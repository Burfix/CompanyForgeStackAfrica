import type { TaskStatus, TaskPriority, TaskSourceType } from '@/schemas/task.schema';
// Attention mode is genuinely shared with Projects — reuse the same meta
// map rather than duplicating labels/tones for an identical vocabulary.
export { ATTENTION_MODE_META, attentionModeRequiresFounder } from '@/features/projects/constants';

export const TASK_STATUS_META: Record<TaskStatus, { label: string; description: string; tone: 'neutral' | 'positive' | 'warning' | 'danger' }> = {
  inbox: { label: 'Inbox', description: 'Captured but not yet prioritised.', tone: 'neutral' },
  planned: { label: 'Planned', description: 'Accepted and scheduled for execution.', tone: 'neutral' },
  in_progress: { label: 'In Progress', description: 'Actively being worked on.', tone: 'positive' },
  waiting: { label: 'Waiting', description: 'Waiting for another person, customer, investor, provider or dependency.', tone: 'warning' },
  blocked: { label: 'Blocked', description: 'Cannot proceed because of an identified blocker.', tone: 'danger' },
  review: { label: 'In Review', description: 'Work is complete but awaiting review, testing, confirmation or approval.', tone: 'warning' },
  completed: { label: 'Completed', description: 'Verified complete.', tone: 'positive' },
  cancelled: { label: 'Cancelled', description: 'No longer required.', tone: 'neutral' },
};

export const TASK_PRIORITY_META: Record<TaskPriority, { label: string; tone: 'neutral' | 'positive' | 'warning' | 'danger' }> = {
  urgent: { label: 'Urgent', tone: 'danger' },
  high: { label: 'High', tone: 'warning' },
  medium: { label: 'Medium', tone: 'neutral' },
  low: { label: 'Low', tone: 'neutral' },
};

export const TASK_SOURCE_TYPE_META: Record<TaskSourceType, { label: string }> = {
  manual: { label: 'Manual' },
  import: { label: 'Import' },
  integration: { label: 'Integration' },
  system: { label: 'System' },
};

export const TASK_SORT_OPTIONS = [
  { value: 'default', label: 'Default (deterministic priority)' },
  { value: 'due_at', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
  { value: 'last_activity_at', label: 'Last activity' },
  { value: 'project', label: 'Project' },
] as const;
export type TaskSortOption = (typeof TASK_SORT_OPTIONS)[number]['value'];

// ---------------------------------------------------------------------
// Due-state — deterministic, no AI. Server-rendered pages run in the
// server's local timezone (Africa/Johannesburg in production, per the
// deployment region); this is the same convention the rest of the app
// already uses for target_date/next_review_at (plain `new Date(...)`
// comparisons, no explicit per-user timezone handling yet), so due-state
// follows the same convention rather than inventing a second one.
// ---------------------------------------------------------------------

export const DUE_STATE_VALUES = ['no_due_date', 'upcoming', 'due_today', 'due_soon', 'overdue', 'completed'] as const;
export type DueState = (typeof DUE_STATE_VALUES)[number];

export const DUE_STATE_META: Record<DueState, { label: string; tone: 'neutral' | 'positive' | 'warning' | 'danger' }> = {
  no_due_date: { label: 'No due date', tone: 'neutral' },
  upcoming: { label: 'Upcoming', tone: 'neutral' },
  due_today: { label: 'Due today', tone: 'warning' },
  due_soon: { label: 'Due soon', tone: 'warning' },
  overdue: { label: 'Overdue', tone: 'danger' },
  completed: { label: 'Completed', tone: 'positive' },
};

const DUE_SOON_WINDOW_HOURS = 72;

/**
 * Pure, deterministic due-state calculation — no AI, no external calls.
 * `dueAt` is an ISO timestamp (nullable). `status`/`now` are injectable so
 * this is trivially unit-testable without faking the system clock.
 */
export function computeDueState(dueAt: string | null, status: TaskStatus, now: Date = new Date()): DueState {
  if (status === 'completed' || status === 'cancelled') return 'completed';
  if (!dueAt) return 'no_due_date';

  const due = new Date(dueAt);
  const isSameCalendarDay = due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth() && due.getDate() === now.getDate();

  if (due.getTime() < now.getTime()) {
    // A same-day due time that has already passed is "due today", not
    // "overdue" — overdue means the calendar day itself has passed.
    return isSameCalendarDay ? 'due_today' : 'overdue';
  }
  if (isSameCalendarDay) return 'due_today';

  const hoursUntilDue = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntilDue <= DUE_SOON_WINDOW_HOURS) return 'due_soon';

  return 'upcoming';
}

export function isOverdue(dueAt: string | null, status: TaskStatus, now: Date = new Date()): boolean {
  return computeDueState(dueAt, status, now) === 'overdue';
}

/**
 * Deterministic default ordering for the global Tasks work queue. Lower
 * numbers sort first. This mirrors the exact tiering the spec calls for —
 * no scoring model, no AI, just an ordered set of buckets.
 */
export function taskSortWeight(task: { priority: TaskPriority; status: TaskStatus; founder_required: boolean; due_at: string | null }, now: Date = new Date()): number {
  const dueState = computeDueState(task.due_at, task.status, now);
  const isUrgentOrHigh = task.priority === 'urgent' || task.priority === 'high';

  if (dueState === 'overdue' && task.priority === 'urgent') return 0;
  if (dueState === 'overdue' && task.priority === 'high') return 1;
  if (task.founder_required && dueState === 'due_today') return 2;
  if (task.status === 'blocked' && isUrgentOrHigh) return 3;
  if (dueState === 'due_today') return 4;
  if (task.status === 'in_progress') return 5;
  return 6; // upcoming / everything else
}
