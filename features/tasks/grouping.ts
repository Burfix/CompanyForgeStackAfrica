import { computeDueState, taskSortWeight } from '@/features/tasks/constants';
import type { TaskStatus, TaskPriority } from '@/schemas/task.schema';

/** Minimal shape grouping/sorting needs — the page/component layer maps
 * its richer Supabase row shape down to this before calling in, which
 * keeps this module (and its tests) free of any Supabase-specific typing. */
export interface GroupableTask {
  id: string;
  status: TaskStatus | string;
  priority: TaskPriority | string;
  due_at: string | null;
  founder_required: boolean;
  assignee_id: string | null;
  last_activity_at: string;
}

const OPEN_STATUSES = new Set(['inbox', 'planned', 'in_progress', 'waiting', 'blocked', 'review']);

function isOpen(task: GroupableTask): boolean {
  return OPEN_STATUSES.has(task.status as string);
}

function sortDeterministic<T extends GroupableTask>(tasks: T[], now: Date): T[] {
  return [...tasks].sort((a, b) => {
    const weightDiff = taskSortWeight(a as never, now) - taskSortWeight(b as never, now);
    if (weightDiff !== 0) return weightDiff;
    // Stable tiebreak within the same tier: earlier due date first, then
    // most recently active.
    const aDue = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const bDue = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    if (aDue !== bDue) return aDue - bDue;
    return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
  });
}

export interface TaskSections<T extends GroupableTask> {
  myFocus: T[];
  dueToday: T[];
  overdue: T[];
  founderRequired: T[];
  inProgress: T[];
  blocked: T[];
  waiting: T[];
  inReview: T[];
  upcoming: T[];
  completed: T[];
}

/**
 * Builds the ten grouped sections the Tasks work-queue requires, each
 * deterministically ordered. Sections deliberately overlap (an overdue,
 * founder-required task legitimately belongs in three views at once) —
 * this mirrors how a real operator triages work, not a strict partition.
 */
export function buildTaskSections<T extends GroupableTask>(tasks: T[], currentUserId: string | null, now: Date = new Date()): TaskSections<T> {
  const open = tasks.filter(isOpen);

  const dueToday = open.filter((t) => computeDueState(t.due_at, t.status as never, now) === 'due_today');
  const overdue = open.filter((t) => computeDueState(t.due_at, t.status as never, now) === 'overdue');
  const upcoming = open.filter((t) => {
    const state = computeDueState(t.due_at, t.status as never, now);
    return state === 'upcoming' || state === 'due_soon';
  });

  return {
    myFocus: sortDeterministic(
      currentUserId ? open.filter((t) => t.assignee_id === currentUserId) : [],
      now,
    ),
    dueToday: sortDeterministic(dueToday, now),
    overdue: sortDeterministic(overdue, now),
    founderRequired: sortDeterministic(open.filter((t) => t.founder_required), now),
    inProgress: sortDeterministic(open.filter((t) => t.status === 'in_progress'), now),
    blocked: sortDeterministic(open.filter((t) => t.status === 'blocked'), now),
    waiting: sortDeterministic(open.filter((t) => t.status === 'waiting'), now),
    inReview: sortDeterministic(open.filter((t) => t.status === 'review'), now),
    upcoming: sortDeterministic(upcoming, now),
    completed: tasks
      .filter((t) => t.status === 'completed' || t.status === 'done')
      .sort((a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()),
  };
}
