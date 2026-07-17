import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { toOperationalError, BusinessRuleError } from '@/lib/errors';
import { CHIEF_OF_STAFF_BOUNDS } from '@/features/chief-of-staff/constants';
import type { Json } from '@/types/database.types';

/**
 * Dedicated READ-ONLY repository for the Chief of Staff evidence layer.
 *
 * Every method here is a bounded SELECT — nothing in this file ever
 * inserts/updates/deletes a project, milestone, or task, and it never will
 * (see services/chief-of-staff.service.ts's architecture comment). This is
 * deliberately separate from projectsRepository/milestonesRepository/
 * tasksRepository rather than reusing their list methods, because those
 * are shaped for their own UI screens (filters, sort options, joins for
 * display) — this repository is shaped for "what does an evidence packet
 * need," with its own explicit bounds (see CHIEF_OF_STAFF_BOUNDS) so this
 * layer can never accidentally load an unbounded amount of company data.
 *
 * `useServiceRole` (Slice 5.1): a narrow, explicit escape hatch accepted by
 * every method the scheduled/cron generation path touches. Defaults to
 * false everywhere, so every existing (browser-session) caller is
 * completely unaffected. It exists because a cron-triggered request has no
 * Supabase-authenticated user and therefore no `auth.uid()` for RLS to
 * evaluate — see services/chief-of-staff.service.ts's
 * generateScheduledDailyBriefing for the only caller that ever passes
 * `true`, and app/api/cron/chief-of-staff/route.ts for how the target
 * organisation is resolved safely (never from the request itself).
 */
function resolveClient(useServiceRole: boolean) {
  return useServiceRole ? Promise.resolve(createServiceRoleClient()) : createClient();
}

const PROJECT_EVIDENCE_COLUMNS =
  'id, name, category, owner:profiles!projects_owner_id_fkey(id, full_name), status, focus_level, priority_level, priority_score, health, health_note, progress_percent, progress_mode, attention_mode, founder_required:founder_attention_required, desired_outcome, success_metric, target_value, current_value, target_date, next_review_at, review_cadence, blocked_reason, waiting_on, business_impact, last_activity_at, updated_at, archived_at';

const MILESTONE_EVIDENCE_COLUMNS =
  'id, project_id, title, status, health, health_note, priority, progress_percent, progress_mode, attention_mode, founder_required, due_date, start_date, next_review_at, success_criteria, target_value, current_value, blocked_reason, waiting_on, last_activity_at, updated_at';

const TASK_EVIDENCE_COLUMNS =
  'id, project_id, milestone_id, title, status, priority, assignee:profiles!tasks_assignee_id_fkey(id, full_name), attention_mode, founder_required, due_at, start_at, blocked_reason, waiting_on, next_action, source_type, source_reference, completed_at, updated_at';

export const chiefOfStaffRepository = {
  /**
   * Active/relevant projects, bounded. Archived projects are excluded
   * unless they were touched within the activity window (so a project
   * archived yesterday can still show up in "changes since previous"),
   * matching the spec's "exclude archived unless required for comparison."
   */
  async loadEvidenceProjects(organizationId: string, useServiceRole = false) {
    const supabase = await resolveClient(useServiceRole);
    const cutoff = new Date(Date.now() - CHIEF_OF_STAFF_BOUNDS.activityWindowDays * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_EVIDENCE_COLUMNS)
      .eq('organization_id', organizationId)
      .or(`archived_at.is.null,archived_at.gte.${cutoff}`)
      .order('priority_score', { ascending: false })
      .limit(CHIEF_OF_STAFF_BOUNDS.maxProjects);

    if (error) throw toOperationalError(error, 'Could not load evidence projects.');
    return data;
  },

  /** All non-cancelled milestones for the given projects, bounded. */
  async loadEvidenceMilestones(organizationId: string, projectIds: string[], useServiceRole = false) {
    if (projectIds.length === 0) return [];
    const supabase = await resolveClient(useServiceRole);

    const { data, error } = await supabase
      .from('milestones')
      .select(MILESTONE_EVIDENCE_COLUMNS)
      .eq('organization_id', organizationId)
      .in('project_id', projectIds)
      .neq('status', 'cancelled')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(CHIEF_OF_STAFF_BOUNDS.maxMilestones);

    if (error) throw toOperationalError(error, 'Could not load evidence milestones.');
    return data;
  },

  /** All open tasks (bounded) plus a small, time-boxed window of recently
   * completed tasks — never unlimited history. */
  async loadEvidenceTasks(organizationId: string, projectIds: string[], useServiceRole = false) {
    if (projectIds.length === 0) return [];
    const supabase = await resolveClient(useServiceRole);
    const completedCutoff = new Date(
      Date.now() - CHIEF_OF_STAFF_BOUNDS.recentlyCompletedTaskWindowDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [openResult, recentlyCompletedResult] = await Promise.all([
      supabase
        .from('tasks')
        .select(TASK_EVIDENCE_COLUMNS)
        .eq('organization_id', organizationId)
        .in('project_id', projectIds)
        .not('status', 'in', '(completed,done,cancelled)')
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(CHIEF_OF_STAFF_BOUNDS.maxOpenTasks),
      supabase
        .from('tasks')
        .select(TASK_EVIDENCE_COLUMNS)
        .eq('organization_id', organizationId)
        .in('project_id', projectIds)
        .in('status', ['completed', 'done'])
        .gte('completed_at', completedCutoff)
        .order('completed_at', { ascending: false })
        .limit(CHIEF_OF_STAFF_BOUNDS.maxRecentlyCompletedTasks),
    ]);

    if (openResult.error) throw toOperationalError(openResult.error, 'Could not load open tasks.');
    if (recentlyCompletedResult.error) throw toOperationalError(recentlyCompletedResult.error, 'Could not load recently completed tasks.');

    return [...openResult.data, ...recentlyCompletedResult.data];
  },

  /** Recent activity, bounded by both a time window and a hard row limit
   * — whichever is smaller wins, per the spec's "last 7 days, maximum 200
   * events." */
  async loadRecentActivity(organizationId: string, useServiceRole = false) {
    const supabase = await resolveClient(useServiceRole);
    const cutoff = new Date(Date.now() - CHIEF_OF_STAFF_BOUNDS.activityWindowDays * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('activity_events')
      .select('id, event_type, entity_type, entity_id, title, description, metadata, occurred_at, actor:profiles(full_name)')
      .eq('organization_id', organizationId)
      .gte('occurred_at', cutoff)
      .order('occurred_at', { ascending: false })
      .limit(CHIEF_OF_STAFF_BOUNDS.maxActivityEvents);

    if (error) throw toOperationalError(error, 'Could not load recent activity.');
    return data;
  },

  /**
   * Best-effort reconciliation health, read entirely from the existing
   * activity trail (the `execution.reconciliation_run` summary event
   * written by services/execution-reconciliation.service.ts) — this
   * deliberately does NOT call the reconciliation service itself (which
   * would perform a live, potentially expensive read-through-write-path
   * check); it only reads the last recorded run.
   */
  async loadLastReconciliationRun(organizationId: string, useServiceRole = false) {
    const supabase = await resolveClient(useServiceRole);
    const { data, error } = await supabase
      .from('activity_events')
      .select('occurred_at, metadata')
      .eq('organization_id', organizationId)
      .eq('event_type', 'execution.reconciliation_run')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not load reconciliation history.');
    return data;
  },

  /** The most recent 'ready' or 'fallback_ready' briefing for an
   * organisation — used both to render "latest briefing" and as the prior
   * snapshot for change detection. Explicitly excludes 'generating' (which
   * may be an abandoned/stale record) and 'failed'. */
  async getLatestReadyBriefing(organizationId: string, useServiceRole = false) {
    const supabase = await resolveClient(useServiceRole);
    const { data, error } = await supabase
      .from('chief_of_staff_briefings')
      .select('*')
      .eq('organization_id', organizationId)
      .in('status', ['ready', 'fallback_ready'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not load the latest briefing.');
    return data;
  },

  /** Whether a ready/fallback_ready DAILY briefing already exists for this
   * organisation and calendar date — the read-side of the daily
   * idempotency check (Slice 5.1). A 'generating' or 'failed' record for
   * the same date does NOT count as existing here: 'generating' is
   * handled separately by the active/stale-generation checks, and a prior
   * 'failed' attempt must be allowed to retry. */
  async getDailyBriefingForDate(organizationId: string, briefingDate: string, useServiceRole = false) {
    const supabase = await resolveClient(useServiceRole);
    const { data, error } = await supabase
      .from('chief_of_staff_briefings')
      .select('id, status')
      .eq('organization_id', organizationId)
      .eq('briefing_date', briefingDate)
      .eq('briefing_type', 'daily')
      .in('status', ['ready', 'fallback_ready'])
      .limit(1)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not check for an existing daily briefing.');
    return data;
  },

  async getBriefingById(organizationId: string, briefingId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('chief_of_staff_briefings')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', briefingId)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not load briefing.');
    return data;
  },

  async listBriefings(organizationId: string, limit = 30) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('chief_of_staff_briefings')
      .select(
        'id, briefing_date, briefing_type, status, title, top_priorities, generated_by, generated_at, generation_source, model_provider, model_name, data_as_of, generator:profiles!chief_of_staff_briefings_generated_by_fkey(full_name)',
      )
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw toOperationalError(error, 'Could not load briefing history.');
    return data;
  },

  /** Any briefing(s) for this org currently stuck in 'generating' —
   * used by the stale-generation recovery rule (Part 29). */
  async listStaleGeneratingBriefings(organizationId: string, olderThanMinutes: number, useServiceRole = false) {
    const supabase = await resolveClient(useServiceRole);
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('chief_of_staff_briefings')
      .select('id, created_at')
      .eq('organization_id', organizationId)
      .eq('status', 'generating')
      .lt('created_at', cutoff);

    if (error) throw toOperationalError(error, 'Could not check for stale generation records.');
    return data;
  },

  async listActiveGeneratingBriefings(organizationId: string, useServiceRole = false) {
    const supabase = await resolveClient(useServiceRole);
    const { data, error } = await supabase
      .from('chief_of_staff_briefings')
      .select('id, created_at')
      .eq('organization_id', organizationId)
      .eq('status', 'generating');

    if (error) throw toOperationalError(error, 'Could not check for an in-progress generation.');
    return data;
  },

  /**
   * Starts a new 'generating' record. For daily briefings, the unique
   * partial index `chief_of_staff_briefings_one_current_daily`
   * (organization_id, briefing_date where briefing_type='daily' and
   * status<>'superseded') is the ATOMIC backstop for idempotency: if two
   * concurrent cron invocations both pass the read-side
   * `getDailyBriefingForDate` check (a real but narrow race window),
   * exactly one of these inserts succeeds and the other hits a unique
   * violation (Postgres error code 23505), which is translated into a
   * BusinessRuleError('DUPLICATE_DAILY_BRIEFING') rather than a generic
   * operational error, so the caller can treat it as "already generated"
   * instead of a failure.
   */
  async createGeneratingRecord(
    input: {
      organizationId: string;
      briefingDate: string;
      briefingType: 'daily' | 'manual';
      dataAsOf: string;
      generationSource: 'manual' | 'cron';
    },
    useServiceRole = false,
  ) {
    const supabase = await resolveClient(useServiceRole);
    const { data, error } = await supabase
      .from('chief_of_staff_briefings')
      .insert({
        organization_id: input.organizationId,
        briefing_date: input.briefingDate,
        briefing_type: input.briefingType,
        generation_source: input.generationSource,
        status: 'generating',
        title: 'Generating…',
        data_as_of: input.dataAsOf,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new BusinessRuleError(
          'A daily briefing already exists for this organisation and date.',
          'DUPLICATE_DAILY_BRIEFING',
        );
      }
      throw toOperationalError(error, 'Could not start briefing generation.');
    }
    return data;
  },

  async markBriefingFailed(id: string, errorCode: string, errorMessage: string, useServiceRole = false) {
    const supabase = await resolveClient(useServiceRole);
    const { error } = await supabase
      .from('chief_of_staff_briefings')
      .update({ status: 'failed', generation_error_code: errorCode, generation_error_message: errorMessage })
      .eq('id', id);

    if (error) throw toOperationalError(error, 'Could not record generation failure.');
  },

  async supersedePreviousBriefings(organizationId: string, briefingDate: string, exceptId: string, useServiceRole = false) {
    const supabase = await resolveClient(useServiceRole);
    const { error } = await supabase
      .from('chief_of_staff_briefings')
      .update({ status: 'superseded' })
      .eq('organization_id', organizationId)
      .eq('briefing_date', briefingDate)
      .eq('briefing_type', 'daily')
      .neq('id', exceptId)
      .in('status', ['ready', 'fallback_ready']);

    if (error) throw toOperationalError(error, 'Could not supersede previous briefings.');
  },

  async finalizeBriefing(
    id: string,
    patch: {
      status: 'ready' | 'fallback_ready';
      title: string;
      executive_summary: string;
      top_priorities: Json;
      risks: Json;
      blockers: Json;
      decisions_required: Json;
      safe_to_ignore: Json;
      changes_since_previous: Json;
      observations: Json;
      evidence_snapshot: Json;
      deterministic_snapshot: Json;
      source_record_count: number;
      source_latest_activity_at: string | null;
      model_provider: string | null;
      model_name: string | null;
      prompt_version: string;
      generation_duration_ms: number;
      generated_by: string | null;
      generated_at: string;
      generation_error_code?: string | null;
      generation_error_message?: string | null;
    },
    useServiceRole = false,
  ) {
    const supabase = await resolveClient(useServiceRole);
    const { data, error } = await supabase.from('chief_of_staff_briefings').update(patch).eq('id', id).select().single();

    if (error) throw toOperationalError(error, 'Could not save the generated briefing.');
    return data;
  },

  async recordFeedback(input: {
    organizationId: string;
    briefingId: string;
    userId: string;
    feedbackType: string;
    rating?: string;
    comment?: string;
  }) {
    const supabase = await createClient();
    const { error } = await supabase.from('chief_of_staff_feedback').insert({
      organization_id: input.organizationId,
      briefing_id: input.briefingId,
      user_id: input.userId,
      feedback_type: input.feedbackType,
      rating: input.rating ?? null,
      comment: input.comment ?? null,
    });

    if (error) throw toOperationalError(error, 'Could not record feedback.');
  },
};
