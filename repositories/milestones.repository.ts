import { createClient } from '@/lib/supabase/server';
import { toOperationalError } from '@/lib/errors';
import type { TablesInsert, TablesUpdate, Enums } from '@/types/database.types';

export interface MilestoneListFilters {
  search?: string;
  projectId?: string;
  ownerId?: string;
  status?: Enums<'milestone_status'>;
  health?: Enums<'milestone_health'>;
  priority?: Enums<'project_priority_level'>;
  attentionMode?: Enums<'project_attention_mode'>;
  founderRequiredOnly?: boolean;
}

/** Every field the global/detail/project views need — a single shared
 * projection avoids N different partial-select shapes for what is
 * ultimately the same execution entity, same convention as
 * TASK_LIST_COLUMNS in tasks.repository.ts. */
const MILESTONE_COLUMNS =
  'id, organization_id, project_id, title, description, success_criteria, status, health, health_note, priority, progress_percent, progress_mode, owner_id, attention_mode, founder_required, start_date, due_date, next_review_at, target_value, current_value, blocked_reason, waiting_on, sort_order, completed_at, last_activity_at, created_at, updated_at, project:projects!milestones_project_id_fkey(id, name), owner:profiles!milestones_owner_id_fkey(id, full_name)';

const OPEN_MILESTONE_STATUSES: Enums<'milestone_status'>[] = ['pending', 'in_progress', 'blocked', 'waiting'];
const NON_CANCELLED_TASK_STATUSES = '(cancelled)';
const COMPLETED_TASK_STATUSES = ['completed', 'done'];

export const milestonesRepository = {
  /** Full execution view with search/filter — powers /milestones. */
  async listMilestones(organizationId: string, filters: MilestoneListFilters = {}) {
    const supabase = await createClient();
    let query = supabase
      .from('milestones')
      .select(MILESTONE_COLUMNS)
      .eq('organization_id', organizationId);

    if (filters.search) query = query.ilike('title', `%${filters.search}%`);
    if (filters.projectId) query = query.eq('project_id', filters.projectId);
    if (filters.ownerId) query = query.eq('owner_id', filters.ownerId);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.health) query = query.eq('health', filters.health);
    if (filters.priority) query = query.eq('priority', filters.priority);
    if (filters.attentionMode) query = query.eq('attention_mode', filters.attentionMode);
    if (filters.founderRequiredOnly) query = query.eq('founder_required', true);

    query = query.order('due_date', { ascending: true, nullsFirst: false });

    const { data, error } = await query;
    if (error) throw toOperationalError(error, 'Could not load milestones.');
    return data;
  },

  /** Upcoming, incomplete milestones across the org — powers Founder HQ. */
  async listUpcoming(organizationId: string, limit = 6) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .select('id, title, due_date, status, project_id, projects(name)')
      .eq('organization_id', organizationId)
      .in('status', ['pending', 'in_progress'])
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true })
      .limit(limit);

    if (error) throw toOperationalError(error, 'Could not load milestones.');
    return data;
  },

  /** All milestones for a single project, in display order — used by the
   * project detail page's Milestones section. */
  async listByProject(organizationId: string, projectId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .select(MILESTONE_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
      .order('due_date', { ascending: true });

    if (error) throw toOperationalError(error, 'Could not load project milestones.');
    return data;
  },

  async getMilestoneById(organizationId: string, milestoneId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .select(`${MILESTONE_COLUMNS}, creator:profiles!milestones_created_by_fkey(id, full_name)`)
      .eq('organization_id', organizationId)
      .eq('id', milestoneId)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not load milestone.');
    return data;
  },

  /**
   * Canonical full-row read for mutation comparisons — same rationale and
   * convention as projectsRepository.getProjectForMutation /
   * tasksRepository.getTaskForMutation. Uses the same MILESTONE_COLUMNS
   * projection as getMilestoneById minus the `creator` relation join
   * (mutation diffing never needs it) — milestone.service.ts already used
   * getMilestoneById for exactly this purpose from Slice 4 onward; this
   * method gives that same canonical read the same name used for Projects
   * and Tasks, rather than three different call patterns for one concept.
   */
  async getMilestoneForMutation(organizationId: string, milestoneId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .select(MILESTONE_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('id', milestoneId)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not load milestone.');
    return data;
  },

  /** True milestone-level access check, independent of any list query —
   * same "not found or not yours" checkpoint pattern as
   * projectsRepository.verifyProjectAccess / tasksRepository.verifyTaskAccess. */
  async verifyMilestoneAccess(organizationId: string, milestoneId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .select('id, organization_id, project_id, status, health, progress_mode, progress_percent, owner_id, attention_mode, founder_required, completed_at, title')
      .eq('organization_id', organizationId)
      .eq('id', milestoneId)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not verify milestone access.');
    return data;
  },

  /**
   * One "next milestone" per project, for the portfolio list view. Fetches
   * all open milestones for the given projects ordered by due date, then
   * reduces to the earliest per project client-side — Supabase's query
   * builder doesn't support DISTINCT ON, and this table will stay small
   * enough per-org that the extra rows are cheap.
   */
  async listNextForProjects(organizationId: string, projectIds: string[]) {
    if (projectIds.length === 0) return new Map<string, { id: string; title: string; due_date: string | null }>();

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .select('id, title, due_date, project_id')
      .eq('organization_id', organizationId)
      .in('project_id', projectIds)
      .in('status', OPEN_MILESTONE_STATUSES)
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true });

    if (error) throw toOperationalError(error, 'Could not load next milestones.');

    const nextByProject = new Map<string, { id: string; title: string; due_date: string | null }>();
    for (const milestone of data) {
      if (!nextByProject.has(milestone.project_id)) {
        nextByProject.set(milestone.project_id, milestone);
      }
    }
    return nextByProject;
  },

  /** Milestones for a set of projects, grouped by project — powers the
   * task form's project → milestone dependent select without an N+1 query
   * per project. Includes status so the form can flag completed/cancelled
   * milestones rather than only ever offering open ones. */
  async listForProjects(organizationId: string, projectIds: string[]) {
    if (projectIds.length === 0) return new Map<string, { id: string; title: string; status: string }[]>();

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .select('id, title, project_id, status')
      .eq('organization_id', organizationId)
      .in('project_id', projectIds)
      .order('sort_order', { ascending: true });

    if (error) throw toOperationalError(error, 'Could not load milestones.');

    const byProject = new Map<string, { id: string; title: string; status: string }[]>();
    for (const m of data) {
      const list = byProject.get(m.project_id) ?? [];
      list.push({ id: m.id, title: m.title, status: m.status });
      byProject.set(m.project_id, list);
    }
    return byProject;
  },

  /** Used by task creation/update to enforce "milestone must belong to the
   * selected project" — never trust a client-supplied milestone_id without
   * this check. */
  async verifyMilestoneBelongsToProject(organizationId: string, milestoneId: string, projectId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .select('id, status')
      .eq('organization_id', organizationId)
      .eq('id', milestoneId)
      .eq('project_id', projectId)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not verify milestone.');
    return data ? { belongs: true, status: data.status } : { belongs: false, status: null };
  },

  async create(input: TablesInsert<'milestones'>) {
    const supabase = await createClient();
    const { data, error } = await supabase.from('milestones').insert(input).select().single();
    if (error) throw toOperationalError(error, 'Could not create milestone.');
    return data;
  },

  async update(organizationId: string, milestoneId: string, patch: TablesUpdate<'milestones'>) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .update(patch)
      .eq('organization_id', organizationId)
      .eq('id', milestoneId)
      .select()
      .single();

    if (error) throw toOperationalError(error, 'Could not update milestone.');
    return data;
  },

  async countMilestonesByProject(organizationId: string, projectId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .select('status, due_date')
      .eq('organization_id', organizationId)
      .eq('project_id', projectId);

    if (error) throw toOperationalError(error, 'Could not load milestone counts.');

    const now = new Date();
    return data.reduce(
      (acc, row) => {
        acc.total += 1;
        const isOpen = OPEN_MILESTONE_STATUSES.includes(row.status);
        if (isOpen) acc.open += 1;
        if (row.status === 'completed') acc.completed += 1;
        if (isOpen && row.due_date && new Date(row.due_date) < now) acc.overdue += 1;
        return acc;
      },
      { total: 0, open: 0, completed: 0, overdue: 0 },
    );
  },

  async countMilestonesByStatus(organizationId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .select('status')
      .eq('organization_id', organizationId);

    if (error) throw toOperationalError(error, 'Could not load milestone counts.');

    return data.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});
  },

  async listMilestonesDueToday(organizationId: string) {
    const supabase = await createClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('milestones')
      .select(MILESTONE_COLUMNS)
      .eq('organization_id', organizationId)
      .in('status', OPEN_MILESTONE_STATUSES)
      .eq('due_date', today);

    if (error) throw toOperationalError(error, 'Could not load milestones due today.');
    return data;
  },

  async listOverdueMilestones(organizationId: string) {
    const supabase = await createClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('milestones')
      .select(MILESTONE_COLUMNS)
      .eq('organization_id', organizationId)
      .in('status', OPEN_MILESTONE_STATUSES)
      .lt('due_date', today)
      .order('due_date', { ascending: true });

    if (error) throw toOperationalError(error, 'Could not load overdue milestones.');
    return data;
  },

  /** Founder HQ / global page "Needs Attention": overdue, at-risk/off-track
   * health, blocked, waiting, or founder-required — a single broad read
   * the caller narrows deterministically in JS, same division of labor as
   * tasksRepository.listTasksNeedingAttention. */
  async listMilestonesNeedingAttention(organizationId: string) {
    const supabase = await createClient();
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('milestones')
      .select(MILESTONE_COLUMNS)
      .eq('organization_id', organizationId)
      .in('status', OPEN_MILESTONE_STATUSES)
      .or(`due_date.lt.${today},health.eq.at_risk,health.eq.off_track,status.eq.blocked,status.eq.waiting,founder_required.eq.true`)
      .order('due_date', { ascending: true, nullsFirst: false });

    if (error) throw toOperationalError(error, 'Could not load milestones needing attention.');
    return data;
  },

  async listFounderRequiredMilestones(organizationId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .select(MILESTONE_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('founder_required', true)
      .in('status', OPEN_MILESTONE_STATUSES)
      .order('due_date', { ascending: true, nullsFirst: false });

    if (error) throw toOperationalError(error, 'Could not load founder-required milestones.');
    return data;
  },

  async listBlockedMilestones(organizationId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .select(MILESTONE_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('status', 'blocked')
      .order('last_activity_at', { ascending: false });

    if (error) throw toOperationalError(error, 'Could not load blocked milestones.');
    return data;
  },

  async listWaitingMilestones(organizationId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .select(MILESTONE_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('status', 'waiting')
      .order('last_activity_at', { ascending: true });

    if (error) throw toOperationalError(error, 'Could not load waiting milestones.');
    return data;
  },

  /** All tasks linked to a milestone — powers the milestone detail page's
   * grouped Execution section. */
  async listTasksForMilestone(organizationId: string, milestoneId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, status, priority, assignee_id, due_at, completed_at, blocked_reason, waiting_on, owner:profiles!tasks_assignee_id_fkey(id, full_name)')
      .eq('organization_id', organizationId)
      .eq('milestone_id', milestoneId)
      .order('due_at', { ascending: true, nullsFirst: false });

    if (error) throw toOperationalError(error, 'Could not load milestone tasks.');
    return data;
  },

  async countTasksForMilestone(organizationId: string, milestoneId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tasks')
      .select('status', { count: 'exact' })
      .eq('organization_id', organizationId)
      .eq('milestone_id', milestoneId);

    if (error) throw toOperationalError(error, 'Could not count milestone tasks.');
    return data.length;
  },

  /**
   * The exact numerator/denominator the automatic progress formula needs:
   * eligible = not cancelled; completed = canonical `completed` or legacy
   * `done`. Returned as raw counts so the pure calculateMilestoneTaskProgress
   * function (lib/progress.ts) owns the actual arithmetic — this repository
   * method only fetches and counts, it never computes a percentage itself.
   */
  async getTaskCompletionRollup(organizationId: string, milestoneId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tasks')
      .select('status')
      .eq('organization_id', organizationId)
      .eq('milestone_id', milestoneId)
      .not('status', 'in', NON_CANCELLED_TASK_STATUSES);

    if (error) throw toOperationalError(error, 'Could not load milestone task roll-up.');

    const totalEligibleTasks = data.length;
    const completedEligibleTasks = data.filter((row) => COMPLETED_TASK_STATUSES.includes(row.status)).length;
    return { totalEligibleTasks, completedEligibleTasks };
  },

  /** Writes a recalculated progress_percent without touching any other
   * column or bumping last_activity_at — used by the automatic task-driven
   * roll-up path, which the spec says must not flood activity history. The
   * caller (milestone.service.ts) decides whether the change is worth an
   * activity record; this method just performs the write. */
  async updateMilestoneProgress(organizationId: string, milestoneId: string, progressPercent: number) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .update({ progress_percent: progressPercent })
      .eq('organization_id', organizationId)
      .eq('id', milestoneId)
      .select()
      .single();

    if (error) throw toOperationalError(error, 'Could not update milestone progress.');
    return data;
  },

  /**
   * Applies a new sort_order to each milestone in a project. The Supabase
   * JS client has no multi-row transactional update primitive here, so
   * this issues one update per milestone sequentially — not a single
   * atomic transaction. If a later row fails, earlier writes in this call
   * are NOT rolled back. This is a known, documented limitation (see
   * milestone.service.ts reorderMilestones), not a claimed guarantee.
   */
  async reorderProjectMilestones(organizationId: string, projectId: string, orderedMilestoneIds: string[]) {
    const supabase = await createClient();
    const updated: { id: string; sort_order: number }[] = [];

    for (let i = 0; i < orderedMilestoneIds.length; i += 1) {
      const milestoneId = orderedMilestoneIds[i]!;
      const { data, error } = await supabase
        .from('milestones')
        .update({ sort_order: i })
        .eq('organization_id', organizationId)
        .eq('project_id', projectId)
        .eq('id', milestoneId)
        .select('id, sort_order')
        .single();

      if (error) throw toOperationalError(error, 'Could not reorder milestones.');
      updated.push(data);
    }

    return updated;
  },
};
