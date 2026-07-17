/**
 * Chief of Staff orchestration service (Slice 5).
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
import { generateBriefingContent, isAiProviderConfigured, ChiefOfStaffGenerationError, PROMPT_VERSION } from '@/services/ai/chief-of-staff-provider';
import { chiefOfStaffBriefingOutputSchema } from '@/schemas/chief-of-staff.schema';
import { CHIEF_OF_STAFF_BOUNDS } from '@/features/chief-of-staff/constants';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { ChiefOfStaffFreshness } from '@/types/chief-of-staff';
import type { Json, Tables } from '@/types/database.types';

type BriefingRow = Tables<'chief_of_staff_briefings'>;

export interface GenerateBriefingParams {
  organizationId: string;
  organizationName: string;
  userId: string;
  briefingType: 'daily' | 'manual';
  force?: boolean;
}

/**
 * Recovers any generation record stuck in 'generating' past the recovery
 * window (a crashed request, a timed-out serverless invocation, etc.) so
 * it doesn't permanently block future generations for this org.
 */
async function recoverStaleGenerations(organizationId: string): Promise<void> {
  const stale = await chiefOfStaffRepository.listStaleGeneratingBriefings(organizationId, CHIEF_OF_STAFF_BOUNDS.staleGenerationRecoveryMinutes);
  for (const record of stale) {
    await chiefOfStaffRepository.markBriefingFailed(record.id, 'generation_timed_out', 'Generation did not complete within the expected time and was marked failed automatically.');
  }
}

async function loadEvidence(organizationId: string) {
  const projects = (await chiefOfStaffRepository.loadEvidenceProjects(organizationId)) as unknown as EvidenceProjectRow[];
  const projectIds = projects.map((p) => p.id);
  const [milestones, tasks, lastReconciliationRunRaw] = await Promise.all([
    chiefOfStaffRepository.loadEvidenceMilestones(organizationId, projectIds) as unknown as Promise<EvidenceMilestoneRow[]>,
    chiefOfStaffRepository.loadEvidenceTasks(organizationId, projectIds) as unknown as Promise<EvidenceTaskRow[]>,
    chiefOfStaffRepository.loadLastReconciliationRun(organizationId),
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
  await recoverStaleGenerations(params.organizationId);

  const active = await chiefOfStaffRepository.listActiveGeneratingBriefings(params.organizationId);
  if (active.length > 0 && !params.force) {
    throw new BusinessRuleError('A briefing is already being generated for this organization.', 'GENERATION_IN_PROGRESS');
  }

  const { projects, milestones, tasks, lastReconciliationRun } = await loadEvidence(params.organizationId);
  const analysis = analyzeCompanyState({ projects, milestones, tasks, lastReconciliationRun, founderUserId: null });

  const previousBriefing = await chiefOfStaffRepository.getLatestReadyBriefing(params.organizationId);
  const previousSnapshot = (previousBriefing?.evidence_snapshot as unknown as EvidenceSnapshot | null) ?? null;
  const changes = detectChanges(projects, milestones, tasks, analysis.risks, previousSnapshot, analysis.reconciliation.failureCount);

  const evidencePacket = buildEvidencePacket(params.organizationName, analysis, projects, milestones, tasks, changes);
  const nextSnapshot = buildEvidenceSnapshot(projects, milestones, tasks, lastReconciliationRun, analysis.risks);

  const briefingDate = new Date().toISOString().slice(0, 10);
  const generatingRecord = await chiefOfStaffRepository.createGeneratingRecord({
    organizationId: params.organizationId,
    briefingDate,
    briefingType: params.briefingType,
    dataAsOf: analysis.dataAsOf,
  });

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

  const finalized = await chiefOfStaffRepository.finalizeBriefing(generatingRecord.id, {
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
    generated_by: params.userId,
    generated_at: new Date().toISOString(),
    generation_error_code: generationErrorCode,
    generation_error_message: generationErrorMessage,
  });

  if (params.briefingType === 'daily') {
    await chiefOfStaffRepository.supersedePreviousBriefings(params.organizationId, briefingDate, finalized.id);
  }

  return finalized;
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
