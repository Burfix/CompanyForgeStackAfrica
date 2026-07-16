/**
 * Deterministic, AI-free progress calculations shared by the milestone and
 * project roll-up logic in services/milestone.service.ts. Kept as pure
 * functions in one place (same discipline as lib/diff-patch.ts) rather than
 * scattered across pages and services, per the Slice 4 spec.
 */

import type { MilestoneStatus } from '@/schemas/milestone.schema';

/**
 * Version 1 milestone progress formula: completed eligible tasks / all
 * eligible tasks × 100. The caller is responsible for excluding cancelled
 * tasks from both `totalEligibleTasks` and `completedEligibleTasks` before
 * calling this — this function only does the arithmetic and applies the
 * status-driven overrides.
 *
 * Rules:
 *  - a completed milestone always reports 100%, regardless of task counts
 *    (a milestone can be completed manually even with open tasks left)
 *  - zero eligible tasks never implies 100% — it returns 0%
 *  - result is clamped to [0, 100] and rounded to the nearest integer
 */
export function calculateMilestoneTaskProgress(params: {
  totalEligibleTasks: number;
  completedEligibleTasks: number;
  milestoneStatus: MilestoneStatus;
}): number {
  if (params.milestoneStatus === 'completed') return 100;
  if (params.totalEligibleTasks <= 0) return 0;

  const raw = (params.completedEligibleTasks / params.totalEligibleTasks) * 100;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

/**
 * Version 1 project progress roll-up: equal weighting across every
 * non-cancelled milestone (sum of milestone progress / eligible milestone
 * count). Missed milestones remain included unless explicitly cancelled —
 * a missed milestone's stored progress_percent (whatever it was at the
 * time it was marked missed) still counts toward the average, it is not
 * treated as 0 or 100 by this function.
 *
 * Rules:
 *  - zero eligible milestones never implies 100% — it returns 0%
 *  - cancelled milestones are excluded from both the sum and the count
 *  - this is deliberately equal-weighted for v1; a future slice may add
 *    per-milestone weighting, but nothing here assumes that yet
 */
export function calculateProjectMilestoneProgress(params: {
  milestones: { progressPercent: number; status: MilestoneStatus | string }[];
}): number {
  const eligible = params.milestones.filter((m) => m.status !== 'cancelled');
  if (eligible.length === 0) return 0;

  const sum = eligible.reduce((total, m) => total + m.progressPercent, 0);
  return Math.round(sum / eligible.length);
}
