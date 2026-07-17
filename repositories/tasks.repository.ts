import { createClient } from '@/lib/supabase/server';
import { toOperationalError } from '@/lib/errors';
import { organizationsRepository } from '@/repositories/organizations.repository';
import type { TablesInsert, TablesUpdate, Enums } from '@/types/database.types';
import type { TaskSortOption } from '@/features/tasks/constants';

export interface TaskListFilters {
  search?: string;
  projectId?: string;
  ownerId?: string;
  status?: Enums<'task_status'>;
  priority?: Enums<'task_priority'>;
  attentionMode?: Enums<'project_attention_mode'>;
  founderRequiredOnly?: boolean;
  sort?: TaskSortOption;
}

const TASK_LIST_COLUMNS =
  'id, title, status, priority, project_id, milestone_id, assignee_id, attention_mode, founder_required, due_at, start_at, completed_at, blocked_reason, waiting_on, next_action, estimated_minutes, actual_minutes, last_activity_at, created_at, project:projects!tasks_project_id_fkey(id, name), owner:profiles!tasks_assignee_id_fkey(id, full_name)';

/**
 * Every physical, mutable column on `tasks` — the single canonical
 * projection for anything that diffs a patch against "the current row".
 * Same convention and rationale as PROJECT_MUTATION_COLUMNS in
 * projects.repository.ts / MILESTONE_COLUMNS in milestones.repository.ts:
 * one place to update when a new mutable column is added, so no-op
 * detection can never silently regress by omission.
 */
const TASK_MUTATION_COLUMNS =
  'id, organization_id, project_id, milestone_id, title, notes, assignee_id, status, priority, attention_mode, founder_required, due_at, due_date, start_at, estimated_minutes, actual_minutes, blocked_reason, waiting_on, next_action, source_type, source_reference, completed_at, created_by, created_at, updated_at, last_activity_at';

const SORT_COLUMN_MAP: Record<TaskSortOption, string> = {
  default: 'due_at',
  due_at: 'due_at',
  priority: 'priority',
  last_activity_at: 'last_activity_at',
  project: 'project_id',
};

export const tasksRepository = {
  /** Full work-queue view with search/filter — powers /tasks. Deterministic
   * final ordering (priority tiers, due-state) is applied in JS via
   * taskSortWeight() once due-state is computed — that logic isn't
   * expressible as a single SQL ORDER BY, so this only supplies a sane base
   * order and lets the caller re-sort. */
  async listTasks(organizationId: string, filters: TaskListFilters = {}) {
    const supabase = await createClient();
    let query = supabase
      .from('tasks')
      .select(TASK_LIST_COLUMNS)
      .eq('organization_id', organizationId);

    if (filters.search) query = query.ilike('title', `%${filters.search}%`);
    if (filters.projectId) query = query.eq('project_id', filters.projectId);
    if (filters.ownerId) query = query.eq('assignee_id', filters.ownerId);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.priority) query = query.eq('priority', filters.priority);
    if (filters.attentionMode) query = query.eq('attention_mode', filters.attentionMode);
    if (filters.founderRequiredOnly) query = query.eq('founder_required', true);

    const sortColumn = SORT_COLUMN_MAP[filters.sort ?? 'default'];
    query = query.order(sortColumn, { ascending: true, nullsFirst: false });

    const { data, error } = await query;
    if (error) throw toOperationalError(error, 'Could not load tasks.');
    return data;
  },

  /** Project detail page — all tasks for one project, grouped client-side
   * into Open / Blocked-or-Waiting / Completed. */
  async listTasksByProject(organizationId: string, projectId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tasks')
      .select(TASK_LIST_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('project_id', projectId)
      .order('due_at', { ascending: true, nullsFirst: false });

    if (error) throw toOperationalError(error, 'Could not load project tasks.');
    return data;
  },

  /** Legacy alias — kept because the project detail page and existing
   * imports already call listByProject; both names resolve to the same
   * query so nothing else needs to change on this call path. */
  async listByProject(organizationId: string, projectId: string) {
    return this.listTasksByProject(organizationId, projectId);
  },

  async getTaskById(organizationId: string, taskId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tasks')
      .select(
        '*, project:projects!tasks_project_id_fkey(id, name, category), milestone:milestones!tasks_milestone_id_fkey(id, title), owner:profiles!tasks_assignee_id_fkey(id, full_name), creator:profiles!tasks_created_by_fkey(id, full_name)',
      )
      .eq('organization_id', organizationId)
      .eq('id', taskId)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not load task.');
    return data;
  },

  /** True task-level access check, independent of any list query — same
   * "not found or not yours" checkpoint pattern as
   * projectsRepository.verifyProjectAccess. */
  async verifyTaskAccess(organizationId: string, taskId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tasks')
      .select('id, organization_id, project_id, status, priority, assignee_id, attention_mode, founder_required, completed_at')
      .eq('organization_id', organizationId)
      .eq('id', taskId)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not verify task access.');
    return data;
  },

  /**
   * Canonical full-row read for mutation comparisons — see
   * projectsRepository.getProjectForMutation for the full rationale. Every
   * task service method that diffs a patch against "the existing row"
   * MUST load `existing` through this method, never through
   * verifyTaskAccess's slim projection (which omits milestone_id, notes,
   * due_at, start_at, estimated/actual_minutes, blocked_reason,
   * waiting_on, next_action, source_type/reference — any of those being
   * absent from `existing` would make diffPatch treat a resubmitted,
   * unchanged value as "changed").
   */
  async getTaskForMutation(organizationId: string, taskId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tasks')
      .select(TASK_MUTATION_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('id', taskId)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not load task.');
    return data;
  },

  async create(input: TablesInsert<'tasks'>) {
    const supabase = await createClient();
    const { data, error } = await supabase.from('tasks').insert(input).select().single();
    if (error) throw toOperationalError(error, 'Could not create task.');
    return data;
  },

  async update(organizationId: string, taskId: string, patch: TablesUpdate<'tasks'>) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tasks')
      .update(patch)
      .eq('organization_id', organizationId)
      .eq('id', taskId)
      .select()
      .single();

    if (error) throw toOperationalError(error, 'Could not update task.');
    return data;
  },

  /** Today's priorities widget on Founder HQ: open tasks due today or
   * overdue, assigned to the current user. Kept for backward
   * compatibility with the existing Founder HQ call site — now reads from
   * due_at instead of the legacy due_date. */
  async listTodaysPriorities(organizationId: string, userId: string) {
    const supabase = await createClient();
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('tasks')
      .select(TASK_LIST_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('assignee_id', userId)
      .not('status', 'in', '(completed,cancelled,done)')
      .lte('due_at', endOfToday.toISOString())
      .order('due_at', { ascending: true });

    if (error) throw toOperationalError(error, 'Could not load tasks.');
    return data;
  },

  async listTasksDueToday(organizationId: string) {
    const supabase = await createClient();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('tasks')
      .select(TASK_LIST_COLUMNS)
      .eq('organization_id', organizationId)
      .not('status', 'in', '(completed,cancelled,done)')
      .gte('due_at', startOfToday.toISOString())
      .lte('due_at', endOfToday.toISOString())
      .order('priority', { ascending: true });

    if (error) throw toOperationalError(error, 'Could not load tasks due today.');
    return data;
  },

  async listOverdueTasks(organizationId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tasks')
      .select(TASK_LIST_COLUMNS)
      .eq('organization_id', organizationId)
      .not('status', 'in', '(completed,cancelled,done)')
      .lt('due_at', new Date().toISOString())
      .order('due_at', { ascending: true });

    if (error) throw toOperationalError(error, 'Could not load overdue tasks.');
    return data;
  },

  async listFounderRequiredTasks(organizationId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tasks')
      .select(TASK_LIST_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('founder_required', true)
      .not('status', 'in', '(completed,cancelled,done)')
      .order('due_at', { ascending: true, nullsFirst: false });

    if (error) throw toOperationalError(error, 'Could not load founder-required tasks.');
    return data;
  },

  async listBlockedTasks(organizationId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tasks')
      .select(TASK_LIST_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('status', 'blocked')
      .order('last_activity_at', { ascending: false });

    if (error) throw toOperationalError(error, 'Could not load blocked tasks.');
    return data;
  },

  async listWaitingTasks(organizationId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tasks')
      .select(TASK_LIST_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('status', 'waiting')
      .order('last_activity_at', { ascending: true });

    if (error) throw toOperationalError(error, 'Could not load waiting tasks.');
    return data;
  },

  /** Founder HQ "Needs Attention": overdue, blocked+urgent/high, waiting
   * with no recent activity, due within 24h, or founder-required — a
   * single broad read that the caller narrows down deterministically in
   * JS (same division of labor as computeDueState / taskSortWeight). */
  async listTasksNeedingAttention(organizationId: string) {
    const supabase = await createClient();
    const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('tasks')
      .select(TASK_LIST_COLUMNS)
      .eq('organization_id', organizationId)
      .not('status', 'in', '(completed,cancelled,done)')
      .or(`due_at.lt.${new Date().toISOString()},status.eq.blocked,status.eq.waiting,founder_required.eq.true,due_at.lte.${in24h}`)
      .order('due_at', { ascending: true, nullsFirst: false });

    if (error) throw toOperationalError(error, 'Could not load tasks needing attention.');
    return data;
  },

  async countTasksByProject(organizationId: string, projectId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tasks')
      .select('status, founder_required, due_at, completed_at')
      .eq('organization_id', organizationId)
      .eq('project_id', projectId);

    if (error) throw toOperationalError(error, 'Could not load task counts.');

    const now = new Date();
    return data.reduce(
      (acc, row) => {
        acc.total += 1;
        const isOpen = !['completed', 'cancelled', 'done'].includes(row.status);
        if (isOpen) acc.open += 1;
        else if (row.status === 'completed' || row.status === 'done') acc.completed += 1;
        if (row.founder_required && isOpen) acc.founderRequired += 1;
        if (row.status === 'blocked') acc.blocked += 1;
        if (isOpen && row.due_at && new Date(row.due_at) < now) acc.overdue += 1;
        return acc;
      },
      { total: 0, open: 0, completed: 0, founderRequired: 0, blocked: 0, overdue: 0 },
    );
  },

  async countTasksByStatus(organizationId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tasks')
      .select('status')
      .eq('organization_id', organizationId);

    if (error) throw toOperationalError(error, 'Could not load task counts.');

    return data.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});
  },

  /** Thin delegate to organizationsRepository so task creation/update can
   * validate an owner without importing a second query for the same
   * underlying check — avoids duplicating the membership query. */
  async verifyOwnerBelongsToOrganisation(organizationId: string, userId: string) {
    return organizationsRepository.verifyOrganisationMember(organizationId, userId);
  },
};
