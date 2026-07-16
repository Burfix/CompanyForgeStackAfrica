import { describe, it, expect } from 'vitest';
import { isMilestoneOverdue, isMilestoneDueToday, isValidMilestoneStatusTransition } from './constants';
import { buildMilestoneSections, type GroupableMilestone } from './grouping';

const NOW = new Date('2026-07-16T12:00:00.000Z');

describe('isMilestoneOverdue', () => {
  it('returns false when there is no due date', () => {
    expect(isMilestoneOverdue(null, 'in_progress', NOW)).toBe(false);
  });

  it('returns true for a past due date on an open milestone', () => {
    expect(isMilestoneOverdue('2026-07-01', 'in_progress', NOW)).toBe(true);
  });

  it('returns false for a completed milestone even with a past due date', () => {
    expect(isMilestoneOverdue('2026-07-01', 'completed', NOW)).toBe(false);
  });

  it('returns false for a missed milestone (already flagged, not double-counted as overdue)', () => {
    expect(isMilestoneOverdue('2026-07-01', 'missed', NOW)).toBe(false);
  });

  it('returns false for a future due date', () => {
    expect(isMilestoneOverdue('2026-08-01', 'in_progress', NOW)).toBe(false);
  });
});

describe('isMilestoneDueToday', () => {
  it('returns true for the same calendar day', () => {
    expect(isMilestoneDueToday('2026-07-16', 'in_progress', NOW)).toBe(true);
  });

  it('returns false for a different day', () => {
    expect(isMilestoneDueToday('2026-07-17', 'in_progress', NOW)).toBe(false);
  });

  it('returns false for a cancelled milestone', () => {
    expect(isMilestoneDueToday('2026-07-16', 'cancelled', NOW)).toBe(false);
  });
});

describe('isValidMilestoneStatusTransition', () => {
  it('allows pending -> in_progress', () => {
    expect(isValidMilestoneStatusTransition('pending', 'in_progress')).toBe(true);
  });

  it('allows in_progress -> blocked', () => {
    expect(isValidMilestoneStatusTransition('in_progress', 'blocked')).toBe(true);
  });

  it('rejects in_progress -> completed (must use completeMilestone)', () => {
    expect(isValidMilestoneStatusTransition('in_progress', 'completed')).toBe(false);
  });

  it('rejects completed -> anything (terminal, must use reopenMilestone)', () => {
    expect(isValidMilestoneStatusTransition('completed', 'in_progress')).toBe(false);
    expect(isValidMilestoneStatusTransition('completed', 'pending')).toBe(false);
  });

  it('rejects cancelled -> anything (terminal, must use reopenMilestone)', () => {
    expect(isValidMilestoneStatusTransition('cancelled', 'in_progress')).toBe(false);
  });

  it('allows a status to "transition" to itself (no-op)', () => {
    expect(isValidMilestoneStatusTransition('blocked', 'blocked')).toBe(true);
  });

  it('allows missed -> in_progress (reopen path)', () => {
    expect(isValidMilestoneStatusTransition('missed', 'in_progress')).toBe(true);
  });
});

function milestone(overrides: Partial<GroupableMilestone> = {}): GroupableMilestone {
  return {
    id: 'm1',
    status: 'in_progress',
    health: 'healthy',
    priority: 'medium',
    due_date: null,
    founder_required: false,
    last_activity_at: NOW.toISOString(),
    ...overrides,
  };
}

describe('buildMilestoneSections', () => {
  it('places an overdue milestone in both overdue and needsAttention', () => {
    const m = milestone({ id: 'm1', due_date: '2026-07-01' });
    const sections = buildMilestoneSections([m], NOW);
    expect(sections.overdue.map((x) => x.id)).toContain('m1');
    expect(sections.needsAttention.map((x) => x.id)).toContain('m1');
  });

  it('places a blocked milestone in the blocked section', () => {
    const m = milestone({ id: 'm2', status: 'blocked' });
    const sections = buildMilestoneSections([m], NOW);
    expect(sections.blocked.map((x) => x.id)).toContain('m2');
  });

  it('places a completed milestone only in completed, not in any open section', () => {
    const m = milestone({ id: 'm3', status: 'completed' });
    const sections = buildMilestoneSections([m], NOW);
    expect(sections.completed.map((x) => x.id)).toContain('m3');
    expect(sections.overdue.map((x) => x.id)).not.toContain('m3');
    expect(sections.needsAttention.map((x) => x.id)).not.toContain('m3');
  });

  it('places a missed milestone in missed only', () => {
    const m = milestone({ id: 'm4', status: 'missed' });
    const sections = buildMilestoneSections([m], NOW);
    expect(sections.missed.map((x) => x.id)).toContain('m4');
  });

  it('places a cancelled milestone in cancelled only', () => {
    const m = milestone({ id: 'm5', status: 'cancelled' });
    const sections = buildMilestoneSections([m], NOW);
    expect(sections.cancelled.map((x) => x.id)).toContain('m5');
  });

  it('an at_risk open milestone appears in needsAttention', () => {
    const m = milestone({ id: 'm6', health: 'at_risk' });
    const sections = buildMilestoneSections([m], NOW);
    expect(sections.needsAttention.map((x) => x.id)).toContain('m6');
  });

  it('sorts overdue before non-overdue within the same section ordering', () => {
    const overdue = milestone({ id: 'overdue', due_date: '2026-07-01' });
    const notOverdue = milestone({ id: 'future', due_date: '2026-08-01' });
    const sections = buildMilestoneSections([notOverdue, overdue], NOW);
    expect(sections.needsAttention[0]?.id).toBe('overdue');
  });
});
