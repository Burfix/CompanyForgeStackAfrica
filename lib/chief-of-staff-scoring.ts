/**
 * Deterministic, versioned attention-scoring for the Chief of Staff
 * (Slice 5). Every point value here is a real constant, not a UI-hidden
 * magic number — see CHIEF_OF_STAFF_SCORE_POINTS below, which the UI and
 * tests are both free to read directly.
 *
 * These are pure functions: given the same row and the same `now`, they
 * always return the same score and the same reasons. The LLM is never
 * responsible for discovering "this is overdue" or "this is founder
 * required" — it only ever rewords/consolidates what these functions have
 * already determined (see services/chief-of-staff-analysis.service.ts).
 */

export const CHIEF_OF_STAFF_SCORING_VERSION = '1.0';

/** Every point value used by the scoring functions below, grouped by
 * entity — deliberately exported so the UI/tests can display or assert
 * against the exact same constants the engine uses (never re-derived or
 * hidden inside a component). */
export const CHIEF_OF_STAFF_SCORE_POINTS = {
  project: {
    founderRequired: 30,
    attentionModeFounder: 10,
    healthOffTrack: 25,
    healthAtRisk: 15,
    healthNeedsAttention: 8,
    priorityUrgent: 20,
    priorityHigh: 12,
    priorityMedium: 5,
    focusLevelCritical: 15,
    focusLevelHigh: 8,
    overdueTargetDate: 20,
    overdueNextReview: 12,
    blocked: 10,
    waiting: 5,
    lowProgressForElapsedTime: 10,
    highImpactBusinessArea: 4,
  },
  milestone: {
    overdue: 25,
    dueToday: 18,
    dueWithin3Days: 10,
    founderRequired: 25,
    blocked: 15,
    waiting: 8,
    healthAtRisk: 15,
    healthOffTrack: 22,
    priorityUrgent: 15,
    connectedHighFocusProject: 8,
    lowProgressNearDeadline: 12,
  },
  task: {
    overdue: 20,
    founderRequired: 20,
    priorityUrgent: 15,
    blocked: 12,
    waiting: 6,
    missingNextAction: 5,
    dueToday: 10,
    assignedToFounder: 8,
    connectedMilestoneAtRisk: 8,
    connectedProjectOffTrack: 8,
  },
} as const;

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export interface ScoreResult {
  score: number;
  reasons: string[];
}

export interface ScorableProject {
  status: string;
  health: string;
  priority_level: string;
  focus_level: number;
  attention_mode: string;
  founder_required: boolean;
  progress_percent: number;
  progress_mode: string;
  target_date: string | null;
  next_review_at: string | null;
  blocked_reason: string | null;
  waiting_on: string | null;
  business_impact: string[];
}

const HIGH_IMPACT_BUSINESS_AREAS = new Set(['revenue', 'fundraising', 'customer', 'compliance']);

/** Terminal/inactive project statuses that should never accumulate
 * attention score — a completed or cancelled project is never a
 * priority candidate regardless of its other fields. */
const INACTIVE_PROJECT_STATUSES = new Set(['completed', 'cancelled']);

export function scoreProject(project: ScorableProject, now: Date = new Date()): ScoreResult {
  const P = CHIEF_OF_STAFF_SCORE_POINTS.project;
  const reasons: string[] = [];
  let score = 0;

  if (INACTIVE_PROJECT_STATUSES.has(project.status)) {
    return { score: 0, reasons: ['Project is completed or cancelled — excluded from attention scoring.'] };
  }

  if (project.founder_required) {
    score += P.founderRequired;
    reasons.push('Founder attention is explicitly required.');
  }
  if (project.attention_mode === 'founder') {
    score += P.attentionModeFounder;
    reasons.push('Attention mode is set to founder.');
  }

  if (project.health === 'off_track') {
    score += P.healthOffTrack;
    reasons.push('Health is Off Track.');
  } else if (project.health === 'at_risk') {
    score += P.healthAtRisk;
    reasons.push('Health is At Risk.');
  } else if (project.health === 'needs_attention') {
    score += P.healthNeedsAttention;
    reasons.push('Health is flagged as Needs Attention.');
  }

  if (project.priority_level === 'urgent') {
    score += P.priorityUrgent;
    reasons.push('Priority level is Urgent.');
  } else if (project.priority_level === 'high') {
    score += P.priorityHigh;
    reasons.push('Priority level is High.');
  } else if (project.priority_level === 'medium') {
    score += P.priorityMedium;
  }

  if (project.focus_level === 1) {
    score += P.focusLevelCritical;
    reasons.push('Focus level is Critical.');
  } else if (project.focus_level === 2) {
    score += P.focusLevelHigh;
  }

  if (project.target_date) {
    const daysOverdue = daysBetween(now, new Date(project.target_date));
    if (daysOverdue > 0) {
      score += P.overdueTargetDate;
      reasons.push(`Target date is overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}.`);
    }
  }
  if (project.next_review_at) {
    const daysOverdue = daysBetween(now, new Date(project.next_review_at));
    if (daysOverdue > 0) {
      score += P.overdueNextReview;
      reasons.push(`Next review is overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}.`);
    }
  }

  if (project.blocked_reason) {
    score += P.blocked;
    reasons.push('Project is blocked.');
  } else if (project.waiting_on) {
    score += P.waiting;
    reasons.push('Project is waiting on something.');
  }

  const highImpactAreas = (project.business_impact ?? []).filter((area) => HIGH_IMPACT_BUSINESS_AREAS.has(area));
  if (highImpactAreas.length > 0) {
    score += P.highImpactBusinessArea * Math.min(highImpactAreas.length, 2);
    reasons.push(`Tagged with high-impact business area(s): ${highImpactAreas.join(', ')}.`);
  }

  return { score, reasons };
}

export interface ScorableMilestone {
  status: string;
  health: string;
  priority: string;
  progress_percent: number;
  founder_required: boolean;
  due_date: string | null;
}

const INACTIVE_MILESTONE_STATUSES = new Set(['completed', 'cancelled']);

export function scoreMilestone(
  milestone: ScorableMilestone,
  context: { connectedProjectFocusLevel?: number } = {},
  now: Date = new Date(),
): ScoreResult {
  const P = CHIEF_OF_STAFF_SCORE_POINTS.milestone;
  const reasons: string[] = [];
  let score = 0;

  if (INACTIVE_MILESTONE_STATUSES.has(milestone.status)) {
    return { score: 0, reasons: ['Milestone is completed or cancelled — excluded from attention scoring.'] };
  }

  if (milestone.due_date) {
    // Calendar-date comparison first (matches scoreTask's convention) —
    // a due_date of "today" must score as dueToday regardless of what
    // time of day `now` is, not get rounded into "overdue" just because
    // `now` is past midnight. Only once today is ruled out do we fall
    // back to a day-count comparison for the overdue/upcoming buckets.
    const dueDate = new Date(milestone.due_date);
    if (now.toDateString() === dueDate.toDateString()) {
      score += P.dueToday;
      reasons.push('Due today.');
    } else if (dueDate.getTime() < now.getTime()) {
      const daysOverdue = Math.max(1, Math.round((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      score += P.overdue;
      reasons.push(`Overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}.`);
    } else {
      const daysUntilDue = Math.round((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilDue <= 3) {
        score += P.dueWithin3Days;
        reasons.push('Due within 3 days.');
      }
    }
  }

  if (milestone.founder_required) {
    score += P.founderRequired;
    reasons.push('Founder attention is explicitly required.');
  }

  if (milestone.status === 'blocked') {
    score += P.blocked;
    reasons.push('Milestone is blocked.');
  } else if (milestone.status === 'waiting') {
    score += P.waiting;
    reasons.push('Milestone is waiting.');
  }

  if (milestone.health === 'off_track') {
    score += P.healthOffTrack;
    reasons.push('Health is Off Track.');
  } else if (milestone.health === 'at_risk') {
    score += P.healthAtRisk;
    reasons.push('Health is At Risk.');
  }

  if (milestone.priority === 'urgent') {
    score += P.priorityUrgent;
    reasons.push('Priority is Urgent.');
  }

  if (context.connectedProjectFocusLevel === 1) {
    score += P.connectedHighFocusProject;
    reasons.push('Belongs to a Critical-focus project.');
  }

  if (milestone.due_date) {
    // Positive when the due date is still ahead of `now` — no sign flip
    // needed here; daysBetween(due, now) is already (due - now)/day.
    const daysUntilDue = daysBetween(new Date(milestone.due_date), now);
    if (daysUntilDue >= 0 && daysUntilDue <= 14 && milestone.progress_percent < 40) {
      score += P.lowProgressNearDeadline;
      reasons.push('Progress is low relative to the approaching deadline.');
    }
  }

  return { score, reasons };
}

export interface ScorableTask {
  status: string;
  priority: string;
  founder_required: boolean;
  due_at: string | null;
  next_action: string | null;
  assignee_id: string | null;
}

const INACTIVE_TASK_STATUSES = new Set(['completed', 'done', 'cancelled']);

export function scoreTask(
  task: ScorableTask,
  context: { founderUserId?: string | null; connectedMilestoneAtRisk?: boolean; connectedProjectOffTrack?: boolean } = {},
  now: Date = new Date(),
): ScoreResult {
  const P = CHIEF_OF_STAFF_SCORE_POINTS.task;
  const reasons: string[] = [];
  let score = 0;

  if (INACTIVE_TASK_STATUSES.has(task.status)) {
    return { score: 0, reasons: ['Task is completed or cancelled — excluded from attention scoring.'] };
  }

  if (task.due_at) {
    const dueDate = new Date(task.due_at);
    const daysOverdue = daysBetween(now, dueDate);
    if (daysOverdue > 0) {
      score += P.overdue;
      reasons.push(`Overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}.`);
    } else if (now.toDateString() === dueDate.toDateString()) {
      score += P.dueToday;
      reasons.push('Due today.');
    }
  }

  if (task.founder_required) {
    score += P.founderRequired;
    reasons.push('Founder attention is explicitly required.');
  }
  if (context.founderUserId && task.assignee_id === context.founderUserId) {
    score += P.assignedToFounder;
    reasons.push('Assigned directly to the founder.');
  }

  if (task.priority === 'urgent') {
    score += P.priorityUrgent;
    reasons.push('Priority is Urgent.');
  }

  if (task.status === 'blocked') {
    score += P.blocked;
    reasons.push('Task is blocked.');
  } else if (task.status === 'waiting') {
    score += P.waiting;
    reasons.push('Task is waiting.');
  }

  if (!task.next_action) {
    score += P.missingNextAction;
    reasons.push('No next action recorded.');
  }

  if (context.connectedMilestoneAtRisk) {
    score += P.connectedMilestoneAtRisk;
    reasons.push('Connected milestone is at risk.');
  }
  if (context.connectedProjectOffTrack) {
    score += P.connectedProjectOffTrack;
    reasons.push('Connected project is off track.');
  }

  return { score, reasons };
}
