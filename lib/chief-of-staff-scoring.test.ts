import { describe, it, expect } from 'vitest';
import { scoreProject, scoreMilestone, scoreTask, CHIEF_OF_STAFF_SCORE_POINTS, CHIEF_OF_STAFF_SCORING_VERSION } from './chief-of-staff-scoring';

const NOW = new Date('2026-07-17T12:00:00Z');

function baseProject(overrides: Record<string, unknown> = {}) {
  return {
    status: 'active',
    health: 'healthy',
    priority_level: 'low',
    focus_level: 3,
    attention_mode: 'delegated',
    founder_required: false,
    progress_percent: 50,
    progress_mode: 'manual',
    target_date: null,
    next_review_at: null,
    blocked_reason: null,
    waiting_on: null,
    business_impact: [],
    ...overrides,
  };
}

function baseMilestone(overrides: Record<string, unknown> = {}) {
  return {
    status: 'in_progress',
    health: 'healthy',
    priority: 'medium',
    progress_percent: 50,
    founder_required: false,
    due_date: null,
    ...overrides,
  };
}

function baseTask(overrides: Record<string, unknown> = {}) {
  return {
    status: 'in_progress',
    priority: 'medium',
    founder_required: false,
    due_at: null,
    next_action: 'Follow up',
    assignee_id: null,
    ...overrides,
  };
}

describe('CHIEF_OF_STAFF_SCORING_VERSION', () => {
  it('is pinned to 1.0', () => {
    expect(CHIEF_OF_STAFF_SCORING_VERSION).toBe('1.0');
  });
});

describe('scoreProject', () => {
  it('scores zero and gives a single reason for completed/cancelled projects regardless of other fields', () => {
    const result = scoreProject(baseProject({ status: 'completed', founder_required: true, health: 'off_track' }), NOW);
    expect(result.score).toBe(0);
    expect(result.reasons).toHaveLength(1);
  });

  it('accumulates founder_required, attention_mode, health, priority, and focus level additively', () => {
    const result = scoreProject(
      baseProject({ founder_required: true, attention_mode: 'founder', health: 'off_track', priority_level: 'urgent', focus_level: 1 }),
      NOW,
    );
    const P = CHIEF_OF_STAFF_SCORE_POINTS.project;
    expect(result.score).toBe(P.founderRequired + P.attentionModeFounder + P.healthOffTrack + P.priorityUrgent + P.focusLevelCritical);
  });

  it('scores an overdue target date using real elapsed days, not a flat constant', () => {
    const result = scoreProject(baseProject({ target_date: '2026-07-10' }), NOW);
    expect(result.score).toBe(CHIEF_OF_STAFF_SCORE_POINTS.project.overdueTargetDate);
    expect(result.reasons[0]).toMatch(/overdue by \d+ days?/i);
  });

  it('does not score a future target date as overdue', () => {
    const result = scoreProject(baseProject({ target_date: '2026-08-01' }), NOW);
    expect(result.score).toBe(0);
  });

  it('caps high-impact business area bonus at two areas even if more are tagged', () => {
    const result = scoreProject(baseProject({ business_impact: ['revenue', 'fundraising', 'customer', 'compliance'] }), NOW);
    expect(result.score).toBe(CHIEF_OF_STAFF_SCORE_POINTS.project.highImpactBusinessArea * 2);
  });

  it('scores blocked higher than merely waiting', () => {
    const blocked = scoreProject(baseProject({ blocked_reason: 'Waiting on legal' }), NOW);
    const waiting = scoreProject(baseProject({ waiting_on: 'External vendor' }), NOW);
    expect(blocked.score).toBeGreaterThan(waiting.score);
  });
});

describe('scoreMilestone', () => {
  it('scores zero for completed/cancelled milestones', () => {
    expect(scoreMilestone(baseMilestone({ status: 'completed', founder_required: true }), {}, NOW).score).toBe(0);
    expect(scoreMilestone(baseMilestone({ status: 'cancelled', founder_required: true }), {}, NOW).score).toBe(0);
  });

  it('scores overdue higher than due-today higher than due-within-3-days', () => {
    const overdue = scoreMilestone(baseMilestone({ due_date: '2026-07-10' }), {}, NOW);
    const dueToday = scoreMilestone(baseMilestone({ due_date: '2026-07-17' }), {}, NOW);
    const dueSoon = scoreMilestone(baseMilestone({ due_date: '2026-07-19' }), {}, NOW);
    expect(overdue.score).toBeGreaterThan(dueToday.score);
    expect(dueToday.score).toBeGreaterThan(dueSoon.score);
  });

  it('adds a bonus when connected to a Critical-focus project', () => {
    const withoutContext = scoreMilestone(baseMilestone({ founder_required: true }), {}, NOW);
    const withContext = scoreMilestone(baseMilestone({ founder_required: true }), { connectedProjectFocusLevel: 1 }, NOW);
    expect(withContext.score - withoutContext.score).toBe(CHIEF_OF_STAFF_SCORE_POINTS.milestone.connectedHighFocusProject);
  });

  it('adds a low-progress-near-deadline bonus only within the 14-day window and below 40% progress', () => {
    const nearDeadlineLowProgress = scoreMilestone(baseMilestone({ due_date: '2026-07-25', progress_percent: 10 }), {}, NOW);
    const nearDeadlineHighProgress = scoreMilestone(baseMilestone({ due_date: '2026-07-25', progress_percent: 90 }), {}, NOW);
    expect(nearDeadlineLowProgress.score).toBeGreaterThan(nearDeadlineHighProgress.score);
  });
});

describe('scoreTask', () => {
  it('scores zero for completed/done/cancelled tasks', () => {
    expect(scoreTask(baseTask({ status: 'completed', founder_required: true }), {}, NOW).score).toBe(0);
    expect(scoreTask(baseTask({ status: 'done' }), {}, NOW).score).toBe(0);
    expect(scoreTask(baseTask({ status: 'cancelled' }), {}, NOW).score).toBe(0);
  });

  it('adds a bonus for missing next_action', () => {
    const withAction = scoreTask(baseTask({ next_action: 'Call vendor' }), {}, NOW);
    const withoutAction = scoreTask(baseTask({ next_action: null }), {}, NOW);
    expect(withoutAction.score - withAction.score).toBe(CHIEF_OF_STAFF_SCORE_POINTS.task.missingNextAction);
  });

  it('adds a bonus only when assignee matches the founder user id in context', () => {
    const founderId = 'founder-uuid';
    const assignedToFounder = scoreTask(baseTask({ assignee_id: founderId }), { founderUserId: founderId }, NOW);
    const assignedToOther = scoreTask(baseTask({ assignee_id: 'someone-else' }), { founderUserId: founderId }, NOW);
    expect(assignedToFounder.score - assignedToOther.score).toBe(CHIEF_OF_STAFF_SCORE_POINTS.task.assignedToFounder);
  });

  it('adds connected-entity bonuses only when context flags are set', () => {
    const plain = scoreTask(baseTask(), {}, NOW);
    const withConnections = scoreTask(baseTask(), { connectedMilestoneAtRisk: true, connectedProjectOffTrack: true }, NOW);
    expect(withConnections.score - plain.score).toBe(
      CHIEF_OF_STAFF_SCORE_POINTS.task.connectedMilestoneAtRisk + CHIEF_OF_STAFF_SCORE_POINTS.task.connectedProjectOffTrack,
    );
  });
});
