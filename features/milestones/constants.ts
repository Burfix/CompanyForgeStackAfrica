import type { MilestoneStatus, MilestoneHealth, MilestoneProgressMode } from '@/schemas/milestone.schema';
// Priority and attention mode are genuinely shared with Projects (and, via
// Projects, with Tasks) — reused rather than redefined. See migration 0009
// and schemas/milestone.schema.ts for why these specific two are reused
// while health gets its own dedicated enum.
export { PRIORITY_LEVEL_META as MILESTONE_PRIORITY_META, ATTENTION_MODE_META, attentionModeRequiresFounder } from '@/features/projects/constants';

export const MILESTONE_STATUS_META: Record<MilestoneStatus, { label: string; description: string; tone: 'neutral' | 'positive' | 'warning' | 'danger' }> = {
  pending: { label: 'Pending', description: 'Not yet started.', tone: 'neutral' },
  in_progress: { label: 'In Progress', description: 'Actively being worked toward.', tone: 'positive' },
  blocked: { label: 'Blocked', description: 'Cannot proceed because of an identified blocker.', tone: 'danger' },
  waiting: { label: 'Waiting', description: 'Waiting on another person, customer, investor, provider or dependency.', tone: 'warning' },
  completed: { label: 'Completed', description: 'Verified complete.', tone: 'positive' },
  missed: { label: 'Missed', description: 'Passed its due date without completion.', tone: 'danger' },
  cancelled: { label: 'Cancelled', description: 'No longer required.', tone: 'neutral' },
};

/** Own dedicated enum — deliberately not reusing project_health, so a
 * milestone's health can evolve independently of how Projects define
 * theirs (see migration 0009 comment). */
export const MILESTONE_HEALTH_META: Record<MilestoneHealth, { label: string; tone: 'neutral' | 'positive' | 'warning' | 'danger'; requiresNote: boolean }> = {
  healthy: { label: 'Healthy', tone: 'positive', requiresNote: false },
  needs_attention: { label: 'Needs Attention', tone: 'warning', requiresNote: false },
  at_risk: { label: 'At Risk', tone: 'warning', requiresNote: true },
  off_track: { label: 'Off Track', tone: 'danger', requiresNote: true },
  unknown: { label: 'Not Assessed', tone: 'neutral', requiresNote: false },
};

export const MILESTONE_PROGRESS_MODE_META: Record<MilestoneProgressMode, { label: string; description: string }> = {
  automatic: { label: 'Automatic', description: 'Calculated from the milestone’s eligible tasks.' },
  manual: { label: 'Manual', description: 'Set directly by an authorised user.' },
};

export const MILESTONE_SORT_OPTIONS = [
  { value: 'due_date', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
  { value: 'last_activity_at', label: 'Last activity' },
  { value: 'project', label: 'Project' },
] as const;
export type MilestoneSortOption = (typeof MILESTONE_SORT_OPTIONS)[number]['value'];

/**
 * Centralised, deterministic status transition rules (mirrors
 * assertValidStatusTransition in services/task.service.ts). Terminal
 * states (completed, cancelled) may only be left through an explicit
 * reopen action; completion is only ever reachable through
 * completeMilestone so completed_at is always server-timestamped.
 */
const MILESTONE_TRANSITIONS: Record<MilestoneStatus, MilestoneStatus[]> = {
  pending: ['in_progress', 'blocked', 'waiting', 'cancelled'],
  in_progress: ['blocked', 'waiting', 'missed', 'cancelled'], // completed excluded: use completeMilestone
  blocked: ['in_progress', 'waiting', 'missed', 'cancelled'],
  waiting: ['in_progress', 'blocked', 'missed', 'cancelled'],
  completed: [], // only reopenMilestone may leave this state
  missed: ['in_progress', 'pending', 'cancelled'], // reopen path only in practice
  cancelled: [], // only reopenMilestone may leave this state
};

export function isValidMilestoneStatusTransition(from: MilestoneStatus, to: MilestoneStatus): boolean {
  if (from === to) return true;
  return MILESTONE_TRANSITIONS[from]?.includes(to) ?? false;
}

const OPEN_MILESTONE_STATUSES: MilestoneStatus[] = ['pending', 'in_progress', 'blocked', 'waiting'];

/**
 * Deterministic milestone overdue check — mirrors isOverdue in
 * features/tasks/constants.ts, adapted for a date-only (not timestamptz)
 * deadline. A milestone is overdue only while it's still in an open
 * status; completed/missed/cancelled milestones are never "overdue" (a
 * missed milestone has already been explicitly marked as such, and
 * re-flagging it as overdue on top would be redundant noise).
 */
export function isMilestoneOverdue(dueDate: string | null, status: MilestoneStatus, now: Date = new Date()): boolean {
  if (!dueDate) return false;
  if (!OPEN_MILESTONE_STATUSES.includes(status)) return false;
  const today = now.toISOString().slice(0, 10);
  return dueDate < today;
}

export function isMilestoneDueToday(dueDate: string | null, status: MilestoneStatus, now: Date = new Date()): boolean {
  if (!dueDate) return false;
  if (!OPEN_MILESTONE_STATUSES.includes(status)) return false;
  return dueDate === now.toISOString().slice(0, 10);
}
