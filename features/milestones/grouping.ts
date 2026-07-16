import { isMilestoneOverdue, isMilestoneDueToday } from '@/features/milestones/constants';
import type { MilestoneStatus, MilestoneHealth } from '@/schemas/milestone.schema';

/** Minimal shape grouping/sorting needs — same convention as
 * GroupableTask in features/tasks/grouping.ts. */
export interface GroupableMilestone {
  id: string;
  status: MilestoneStatus | string;
  health: MilestoneHealth | string;
  priority: string;
  due_date: string | null;
  founder_required: boolean;
  last_activity_at: string;
}

const OPEN_STATUSES = new Set(['pending', 'in_progress', 'blocked', 'waiting']);
const PRIORITY_WEIGHT: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function isOpen(m: GroupableMilestone): boolean {
  return OPEN_STATUSES.has(m.status as string);
}

function sortDeterministic<T extends GroupableMilestone>(milestones: T[], now: Date): T[] {
  return [...milestones].sort((a, b) => {
    const aOverdue = isMilestoneOverdue(a.due_date, a.status as MilestoneStatus, now);
    const bOverdue = isMilestoneOverdue(b.due_date, b.status as MilestoneStatus, now);
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    if (a.founder_required !== b.founder_required) return a.founder_required ? -1 : 1;
    const priorityDiff = (PRIORITY_WEIGHT[a.priority] ?? 9) - (PRIORITY_WEIGHT[b.priority] ?? 9);
    if (priorityDiff !== 0) return priorityDiff;
    const aDue = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const bDue = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    if (aDue !== bDue) return aDue - bDue;
    return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
  });
}

export interface MilestoneSections<T extends GroupableMilestone> {
  needsAttention: T[];
  overdue: T[];
  dueToday: T[];
  inProgress: T[];
  blocked: T[];
  waiting: T[];
  upcoming: T[];
  completed: T[];
  missed: T[];
  cancelled: T[];
}

/**
 * Builds the ten grouped sections the global Milestones page requires.
 * Sections deliberately overlap (an overdue, founder-required milestone
 * legitimately belongs in both Needs Attention and Overdue) — same
 * "reflects real triage, not a strict partition" design as
 * buildTaskSections.
 */
export function buildMilestoneSections<T extends GroupableMilestone>(milestones: T[], now: Date = new Date()): MilestoneSections<T> {
  const open = milestones.filter(isOpen);

  const overdue = open.filter((m) => isMilestoneOverdue(m.due_date, m.status as MilestoneStatus, now));
  const dueToday = open.filter((m) => isMilestoneDueToday(m.due_date, m.status as MilestoneStatus, now));
  const needsAttention = open.filter(
    (m) => isMilestoneOverdue(m.due_date, m.status as MilestoneStatus, now) || m.health === 'at_risk' || m.health === 'off_track' || m.status === 'blocked' || m.status === 'waiting' || m.founder_required,
  );
  const upcoming = open.filter((m) => !isMilestoneOverdue(m.due_date, m.status as MilestoneStatus, now) && !isMilestoneDueToday(m.due_date, m.status as MilestoneStatus, now));

  return {
    needsAttention: sortDeterministic(needsAttention, now),
    overdue: sortDeterministic(overdue, now),
    dueToday: sortDeterministic(dueToday, now),
    inProgress: sortDeterministic(open.filter((m) => m.status === 'in_progress'), now),
    blocked: sortDeterministic(open.filter((m) => m.status === 'blocked'), now),
    waiting: sortDeterministic(open.filter((m) => m.status === 'waiting'), now),
    upcoming: sortDeterministic(upcoming, now),
    completed: milestones.filter((m) => m.status === 'completed').sort((a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()),
    missed: milestones.filter((m) => m.status === 'missed').sort((a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()),
    cancelled: milestones.filter((m) => m.status === 'cancelled').sort((a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()),
  };
}
