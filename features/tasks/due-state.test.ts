import { describe, it, expect } from 'vitest';
import { computeDueState, isOverdue, taskSortWeight } from './constants';

const NOW = new Date('2026-07-16T12:00:00.000Z');

describe('computeDueState', () => {
  it('returns no_due_date when due_at is null', () => {
    expect(computeDueState(null, 'planned', NOW)).toBe('no_due_date');
  });

  it('returns completed for completed status regardless of due_at', () => {
    expect(computeDueState('2020-01-01T00:00:00Z', 'completed', NOW)).toBe('completed');
  });

  it('returns completed for cancelled status regardless of due_at', () => {
    expect(computeDueState('2099-01-01T00:00:00Z', 'cancelled', NOW)).toBe('completed');
  });

  it('returns overdue when the due date is a past calendar day', () => {
    expect(computeDueState('2026-07-15T09:00:00.000Z', 'planned', NOW)).toBe('overdue');
  });

  it('returns due_today for a same-calendar-day due time already passed', () => {
    expect(computeDueState('2026-07-16T08:00:00.000Z', 'planned', NOW)).toBe('due_today');
  });

  it('returns due_today for a same-calendar-day due time not yet passed', () => {
    expect(computeDueState('2026-07-16T18:00:00.000Z', 'planned', NOW)).toBe('due_today');
  });

  it('returns due_soon within the next 72 hours but not today', () => {
    expect(computeDueState('2026-07-18T12:00:00.000Z', 'planned', NOW)).toBe('due_soon');
  });

  it('returns upcoming beyond the 72-hour window', () => {
    expect(computeDueState('2026-07-25T12:00:00.000Z', 'planned', NOW)).toBe('upcoming');
  });
});

describe('isOverdue', () => {
  it('is true only for the overdue due-state', () => {
    expect(isOverdue('2026-07-01T00:00:00Z', 'planned', NOW)).toBe(true);
    expect(isOverdue('2026-07-16T18:00:00Z', 'planned', NOW)).toBe(false);
    expect(isOverdue('2020-01-01T00:00:00Z', 'completed', NOW)).toBe(false);
  });
});

describe('taskSortWeight — deterministic default ordering', () => {
  const overdueUrgent = { priority: 'urgent', status: 'planned', founder_required: false, due_at: '2026-07-01T00:00:00Z' } as const;
  const overdueHigh = { priority: 'high', status: 'planned', founder_required: false, due_at: '2026-07-01T00:00:00Z' } as const;
  const founderDueToday = { priority: 'medium', status: 'planned', founder_required: true, due_at: '2026-07-16T18:00:00Z' } as const;
  const blockedHigh = { priority: 'high', status: 'blocked', founder_required: false, due_at: null } as const;
  const dueToday = { priority: 'low', status: 'planned', founder_required: false, due_at: '2026-07-16T18:00:00Z' } as const;
  const inProgress = { priority: 'low', status: 'in_progress', founder_required: false, due_at: null } as const;
  const upcoming = { priority: 'low', status: 'planned', founder_required: false, due_at: '2026-08-01T00:00:00Z' } as const;

  it('orders the tiers exactly as specified', () => {
    const weights = [overdueUrgent, overdueHigh, founderDueToday, blockedHigh, dueToday, inProgress, upcoming].map((t) =>
      taskSortWeight(t as never, NOW),
    );
    expect(weights).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('is a pure function of its inputs (same inputs, same output)', () => {
    expect(taskSortWeight(overdueUrgent as never, NOW)).toBe(taskSortWeight(overdueUrgent as never, NOW));
  });
});
