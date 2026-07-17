/**
 * Chief of Staff orchestration service (Slice 5, extended in Slice 5.1 for
 * unattended daily generation).
 *
 * ARCHITECTURE BOUNDARY — read this before touching this file:
 *
 *   Repository (read-only evidence) → Deterministic analysis engine →
 *   Evidence packet → AI provider (optional) → Stored briefing → UI
 *
 * This service NEVER imports projectsRepository/tasksRepository/
 * milestonesRepository mutation methods, never calls project/task/
 * milestone services, and never writes to the projects/milestones/tasks
 * tables. Its only writes are to chief_of_staff_briefings and
 * chief_of_staff_feedback — its own dedicated, read-only-of-everything-
 * else tables. If a future change to this file needs to touch a project,
 * milestone, or task row, that is a sign the change belongs in Slice 6+
 * with its own explicit write-capability review, not here.
 *
 * The AI provider (services/ai/chief-of-staff-provider.ts) is optional at
 * every call site in this file — every path here must succeed (with the
 * deterministic fallback) even if AI_API_KEY is unset or the provider call
 * fails outright.
 *
 * Slice 5.1 adds `generateScheduledDailyBriefing`, the machine-safe entry
 * point used exclusively by app/api/cron/chief-of-staff/route.ts. It does
 * not duplicate any generation logic — it performs a daily-idempotency
 * pre-check and then delegates to the exact same `generateBriefing`
 * function the browser-session manual route/action already calls, with
 * `useServiceRole: true` threaded through so repository reads/writes work
 * without a Supabase-authenticated session. Authentication (the
 * CRON_SECRET check) and organisation targeting (the explicit
 * CHIEF_OF_STAFF_CRON_ORGANIZATION_ID env var) both live at the route
 * boundary, never here — this service still has no idea how it was
 * invoked, only who/what to attribute the result to.
 */

import { chiefOfStaffRepository } from '@/repositories/chief-of-staff.repository';
import {
  analyzeCompanyState,
  type EvidenceProjectRow,
  type EvidenceMilestoneRow,
  type EvidenceTaskRow,
  type ReconciliationRunRecord,
} from '@/services/chief-of-staff-analysis.service';
import { detectChanges, buildEvidenceSnapshot, type EvidenceSnapshot } from '@/services/chief-of-staff-change.service';
import { buildEvidencePacket } from '@/services/chief-of-staff-evidence.service';
import { buildFallbackBriefing } from '@/lib/chief-of-staff-fallback';
import { getOrganizationLocalDate } from '@/lib/chief-of-staff-timezone';
import { generateBriefingContent, isAiProviderConfigured, ChiefOfStaffGenerationError, PROMPT_VERSION } from '@/services/ai/chief-of-staff-provider';
import { chiefOfStaffBriefingOutputSchema } from '@/schemas/chief-of-staff.schema';
import { CHIEF_OF_STAFF_BOUNDS } from '@/features/chief-of-staff/constants';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { ChiefOfStaffFreshness } from '@/types/chief-of-staff';
import type { Json, Tables } from '@/types/database.types';

type BriefingRow = Tables<'chief_of_staff_briefings'>;

/** Business-rule codes that mean "a daily briefing already exists (or is
 * already in flight) for this org/date" — safe to treat as skipped rather
 * than a failure. Covers both the coarse org-wide "already generating"
 * guard and the atomic unique-constraint race caught at insert time. */
const ALREADY_GENERATED_CODES = new Set(['GENERATION_IN_PROGRESS', 'DUPLICATE_DAILY_BRIEFING']);

export interface GenerateBriefingParams {
  organizationId: string;
  organizationName: string;
  /** The acting user's id for a browser-session (manual) generation, or
   * null for an unattended (cron) generation. Never a fabricated/impersonated
   * user — see the module header. */
  generatedBy: string | null;
  generationSource: 'manual' | 'cron';
  briefingType: 'daily' | 'manual';
  /** YYYY-MM-DD override. Manual generation omits this and gets the
   * server's UTC date (unchanged Slice 5 behaviour — manual briefings were
   * never timezone-sensitive). Scheduled daily generation always supplies
   * the organisation-local date computed via getOrganizationLocalDate. */
  briefingDate?: string;
  force?: boolean;
  /** Slice 5.1: true only for the cron path — see repository header for
   * why this is needed and how narrowly it's scoped. */
  useServiceRole?: boolean;
}

/**
 * Recovers any generation record stuck in 'generating' past the recovery
 * window (a crashed request, a timed-out serverless invocation, etc.) so
 * it doesn't permanently block future generations for this org.
 */
async function recoverStaleGenerations(organizationId: string, useServiceRole: boolean): Promise<void> {
  const stale = await chiefOfStaffRepository.listStaleGeneratingBriefings(
    organizationId,
    CHIEF_OF_STAFF_BOUNDS.staleGenerationRecoveryMinutes,
    useServiceRole,
  );
  for (const record of stale) {
    await chiefOfStaffRepository.markBriefingFailed(
      record.id,
      'generation_timed_out',
      'Generation did not complete within the expected time and was marked failed automatically.',
      useServiceRole,
    );
  }
}

async function loadEvidence(organizationId: string, useServiceRole: boolean) {
  const projects = (await chiefOfStaffRepository.loadEvidenceProjects(organizationId, useServiceRole)) as unknown as EvidenceProjectRow[];
  const projectIds = projects.map((p) => p.id);
  const [milestones, tasks, lastReconciliationRunRaw] = await Promise.all([
    chiefOfStaffRepository.loadEvidenceMilestones(organizationId, projectIds, useServiceRole) as unknown as Promise<EvidenceMilestoneRow[]>,
    chiefOfStaffRepository.loadEvidenceTasks(organizationId, projectIds, useServiceRole) as unknown as Promise<EvidenceTaskRow[]>,
    chiefOfStaffRepository.loadLastReconciliationRun(organizationId, useServiceRole),
  ]);
  const lastReconciliationRun = lastReconciliationRunRaw as unknown as ReconciliationRunRecord | null;
  return { projects, milestones, tasks, lastReconciliationRun };
}

/**
 * Generates a new briefing end-to-end: loads bounded evidence, runs the
 * deterministic analysis and change detection, attempts the AI provider if
 * configured, falls back to the deterministic formatter on any failure,
 * validates the final output against the shared schema regardless of
 * which path produced it, and stores exactly one result. Never throws for
 * an AI failure — only for genuine infrastructure errors (DB unavailable,
 * a concurrent generation already running, etc.).
 */
export async function generateBriefing(params: GenerateBriefingParams): Promise<BriefingRow> {
  const useServiceRole = params.useServiceRole ?? false;

  await recoverStaleGenerations(params.organizationId, useServiceRole);

  const active = await chiefOfStaffRepository.listActiveGeneratingBriefings(params.organizationId, useServiceRole);
  if (active.length > 0 && !params.force) {
    throw new BusinessRuleError('A briefing is already being generated for this organization.', 'GENERATION_IN_PROGRESS');
  }

  const { projects, milestones, tasks, lastReconciliationRun } = await loadEvidence(params.organizationId, useServiceRole);
  const analysis = analyzeCompanyState({ projects, milestones, tasks, lastReconciliationRun, founderUserId: null });

  const previousBriefing = await chiefOfStaffRepository.getLatestReadyBriefing(params.organizationId, useServiceRole);
  const previousSnapshot = (previousBriefing?.evidence_snapshot as unknown as EvidenceSnapshot | null) ?? null;
  const changes = detectChanges(projects, milestones, tasks, analysis.risks, previousSnapshot, analysis.reconciliation.failureCount);

  const evidencePacket = buildEvidencePacket(params.organizationName, analysis, projects, milestones, tasks, changes);
  const nextSnapshot = buildEvidenceSnapshot(projects, milestones, tasks, lastReconciliationRun, analysis.risks);

  const briefingDate = params.briefingDate ?? new Date().toISOString().slice(0, 10);
  const generatingRecord = await chiefOfStaffRepository.createGeneratingRecord(
    {
      organizationId: params.organizationId,
      briefingDate,
      briefingType: params.briefingType,
      dataAsOf: analysis.dataAsOf,
      generationSource: params.generationSource,
    },
    useServiceRole,
  );

  const startedAt = Date.now();
  let status: 'ready' | 'fallback_ready' = 'fallback_ready';
  let modelProvider: string | null = null;
  let modelName: string | null = null;
  let content = buildFallbackBriefing(analysis, changes);
  let generationErrorCode: string | null = null;
  let generationErrorMessage: string | null = null;

  if (isAiProviderConfigured()) {
    try {
      const result = await generateBriefingContent({ evidencePacket });
      content = result.output;
      status = 'ready';
      modelProvider = result.modelProvider;
      modelName = result.modelName;
    } catch (err) {
      // Any AI failure — timeout, invalid response, unverifiable evidence
      // — falls back to the deterministic formatter rather than failing
      // the whole generation. The reason is recorded for observability
      // but never shown to operators as a raw error.
      if (err instanceof ChiefOfStaffGenerationError) {
        generationErrorCode = err.code;
        generationErrorMessage = err.message;
      } else {
        generationErrorCode = 'provider_request_failed';
        generationErrorMessage = err instanceof Error ? err.message : 'Unknown provider error.';
      }
    }
  } else {
    generationErrorCode = 'provider_not_configured';
    generationErrorMessage = 'AI provider is not configured; deterministic fallback used.';
  }

  // The stored shape must satisfy the exact same contract regardless of
  // which path produced it — this call is what makes the AI and fallback
  // paths structurally indistinguishable to every downstream consumer.
  const validated = chiefOfStaffBriefingOutputSchema.parse(content);

  const finalized = await chiefOfStaffRepository.finalizeBriefing(
    generatingRecord.id,
    {
      status,
      title: validated.title,
      executive_summary: validated.executive_summary,
      top_priorities: validated.top_priorities as unknown as Json,
      risks: validated.risks as unknown as Json,
      blockers: validated.blockers as unknown as Json,
      decisions_required: validated.decisions_required as unknown as Json,
      safe_to_ignore: validated.safe_to_ignore as unknown as Json,
      changes_since_previous: validated.changes_since_previous as unknown as Json,
      observations: validated.observations as unknown as Json,
      evidence_snapshot: nextSnapshot as unknown as Json,
      deterministic_snapshot: analysis as unknown as Json,
      source_record_count: analysis.sourceRecordCount,
      source_latest_activity_at: analysis.latestActivityAt,
      model_provider: modelProvider,
      model_name: modelName,
      prompt_version: PROMPT_VERSION,
      generation_duration_ms: Date.now() - startedAt,
      generated_by: params.generatedBy,
      generated_at: new Date().toISOString(),
      generation_error_code: generationErrorCode,
      generation_error_message: generationErrorMessage,
    },
    useServiceRole,
  );

  if (params.briefingType === 'daily') {
    await chiefOfStaffRepository.supersedePreviousBriefings(params.organizationId, briefingDate, finalized.id, useServiceRole);
  }

  return finalized;
}

export interface ScheduledDailyBriefingParams {
  organizationId: string;
  organizationName: string;
  /** Validated IANA timezone (see lib/chief-of-staff-timezone.ts) — the
   * route boundary validates this before calling in, but the date
   * computation itself lives here since "what date is it for this
   * briefing" is a generation-service concern (it's the idempotency key),
   * not a route concern. */
  timeZone: string;
  requestId: string;
}

export interface ScheduledDailyBriefingResult {
  generated: boolean;
  skipped: boolean;
  reason?: 'daily_briefing_exists';
  briefing?: BriefingRow;
  briefingId?: string;
  briefingDate: string;
}

/**
 * Machine-safe entry point for unattended daily generation (Slice 5.1).
 * Reuses every piece of the existing engine — evidence loading,
 * deterministic analysis, change detection, the AI provider abstraction,
 * structured-output validation, evidence verification, the deterministic
 * fallback, persistence, and stale-generation recovery — via the same
 * `generateBriefing` function the manual route calls. The only things
 * unique to this path are: computing the organisation-local briefing
 * date, the read-side idempotency pre-check (so a repeat cron invocation
 * never calls the AI provider or writes a second record), and passing
 * `useServiceRole: true` because there is no browser session to read RLS
 * context from.
 *
 * Idempotency has two layers, matching the spec's "prefer atomic over
 * read-then-write where possible":
 *  1. This read-side check (`getDailyBriefingForDate`) — cheap, avoids an
 *     AI call entirely in the common case of "already ran today."
 *  2. The database's unique partial index on (organization_id,
 *     briefing_date) for non-superseded daily rows — the real atomicity
 *     guarantee for the narrow race window between two concurrent cron
 *     invocations both passing check #1. A unique-violation there is
 *     caught by the repository and surfaced as
 *     BusinessRuleError('DUPLICATE_DAILY_BRIEFING'), which this function
 *     also treats as a skip, never a failure.
 */
export async function generateScheduledDailyBriefing(params: ScheduledDailyBriefingParams): Promise<ScheduledDailyBriefingResult> {
  const briefingDate = getOrganizationLocalDate(new Date(), params.timeZone);

  const existing = await chiefOfStaffRepository.getDailyBriefingForDate(params.organizationId, briefingDate, true);
  if (existing) {
    return { generated: false, skipped: true, reason: 'daily_briefing_exists', briefingId: existing.id, briefingDate };
  }

  try {
    const briefing = await generateBriefing({
      organizationId: params.organizationId,
      organizationName: params.organizationName,
      generatedBy: null,
      generationSource: 'cron',
      briefingType: 'daily',
      briefingDate,
      useServiceRole: true,
    });
    return { generated: true, skipped: false, briefing, briefingId: briefing.id, briefingDate };
  } catch (err) {
    if (err instanceof BusinessRuleError && ALREADY_GENERATED_CODES.has(err.code)) {
      return { generated: false, skipped: true, reason: 'daily_briefing_exists', briefingDate };
    }
    throw err;
  }
}

const STALE_AFTER_HOURS = 24;

/**
 * Computes freshness by comparing the briefing's data_as_of snapshot time
 * against the latest known activity and the current reconciliation state.
 * integrity_warning takes precedence over everything else — a founder
 * should never read a briefing as "current" while the underlying roll-ups
 * are known to be inconsistent.
 */
export function getBriefingFreshness(
  briefing: Pick<BriefingRow, 'data_as_of' | 'generated_at'>,
  latestActivityAt: string | null,
  reconciliationConsistent: boolean,
  now: Date = new Date(),
): ChiefOfStaffFreshness {
  if (!reconciliationConsistent) return 'integrity_warning';

  const generatedAt = briefing.generated_at ? new Date(briefing.generated_at) : new Date(briefing.data_as_of);
  const hoursSinceGeneration = (now.getTime() - generatedAt.getTime()) / (1000 * 60 * 60);
  if (hoursSinceGeneration > STALE_AFTER_HOURS) return 'stale';

  if (latestActivityAt && new Date(latestActivityAt).getTime() > new Date(briefing.data_as_of).getTime()) {
    return 'new_activity_available';
  }

  return 'current';
}

export async function getLatestBriefing(organizationId: string): Promise<BriefingRow | null> {
  return (await chiefOfStaffRepository.getLatestReadyBriefing(organizationId)) as BriefingRow | null;
}

export async function getBriefingById(organizationId: string, briefingId: string): Promise<BriefingRow> {
  const briefing = await chiefOfStaffRepository.getBriefingById(organizationId, briefingId);
  if (!briefing) throw new NotFoundError('Briefing not found.');
  return briefing as BriefingRow;
}

export async function listBriefings(organizationId: string, limit?: number) {
  return chiefOfStaffRepository.listBriefings(organizationId, limit);
}

export async function submitFeedback(input: {
  organizationId: string;
  briefingId: string;
  userId: string;
  feedbackType: string;
  rating?: string;
  comment?: string;
}): Promise<void> {
  // Confirm the briefing actually belongs to this org before recording
  // feedback against it — mirrors the NotFoundError pattern used by every
  // other mutation-adjacent check in the codebase.
  await getBriefingById(input.organizationId, input.briefingId);
  await chiefOfStaffRepository.recordFeedback(input);
}
