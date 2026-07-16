import { describe, it, expect } from 'vitest';
import { buildTaskSections, type GroupableTask } from './grouping';

const NOW = new Date('2026-07-16T12:00:00.000Z');
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function task(overrides: Partial<GroupableTask>): GroupableTask {
  return {
    id: Math.random().toString(36),
    status: 'planned',
    priority: 'medium',
    due_at: null,
    founder_required: false,
    assignee_id: null,
    last_activity_at: NOW.toISOString(),
    ...overrides,
  };
}

describe('buildTaskSections', () => {
  it('places an overdue task into both Overdue and My Focus (when owned)', () => {
    const overdue = task({ id: 't1', due_at: '2026-07-01T00:00:00Z', assignee_id: USER_A });
    const sections = buildTaskSections([overdue], USER_A, NOW);
    expect(sections.overdue.map((t) => t.id)).toContain('t1');
    expect(sections.myFocus.map((t) => t.id)).toContain('t1');
  });

  it('excludes tasks owned by someone else from My Focus', () => {
    const t = task({ id: 't2', assignee_id: USER_B });
    const sections = buildTaskSections([t], USER_A, NOW);
    expect(sections.myFocus).toHaveLength(0);
  });

  it('excludes completed/cancelled tasks from every open-work section', () => {
    const completed = task({ id: 't3', status: 'completed', due_at: '2020-01-01T00:00:00Z', founder_required: true });
    const sections = buildTaskSections([completed], USER_A, NOW);
    expect(sections.overdue).toHaveLength(0);
    expect(sections.founderRequired).toHaveLength(0);
    expect(sections.blocked).toHaveLength(0);
    expect(sections.completed.map((t) => t.id)).toContain('t3');
  });

  it('groups blocked and waiting tasks into their own sections', () => {
    const blocked = task({ id: 't4', status: 'blocked' });
    const waiting = task({ id: 't5', status: 'waiting' });
    const sections = buildTaskSections([blocked, waiting], null, NOW);
    expect(sections.blocked.map((t) => t.id)).toEqual(['t4']);
    expect(sections.waiting.map((t) => t.id)).toEqual(['t5']);
  });

  it('orders Overdue deterministically by priority tier, not insertion order', () => {
    const overdueHigh = task({ id: 'high', priority: 'high', due_at: '2026-07-01T00:00:00Z' });
    const overdueUrgent = task({ id: 'urgent', priority: 'urgent', due_at: '2026-07-02T00:00:00Z' });
    const sections = buildTaskSections([overdueHigh, overdueUrgent], null, NOW);
    expect(sections.overdue.map((t) => t.id)).toEqual(['urgent', 'high']);
  });

  it('handles a fully empty task list without throwing', () => {
    const sections = buildTaskSections([], USER_A, NOW);
    expect(sections.myFocus).toEqual([]);
    expect(sections.completed).toEqual([]);
  });

  it('is safe against legacy rows with null optional fields (no due date, no owner)', () => {
    const legacy = task({ id: 'legacy', due_at: null, assignee_id: null, founder_required: false, status: 'in_progress' });
    const sections = buildTaskSections([legacy], null, NOW);
    // A null due_at never lands in a due-date-based section...
    expect(sections.dueToday.map((t) => t.id)).not.toContain('legacy');
    expect(sections.overdue.map((t) => t.id)).not.toContain('legacy');
    expect(sections.upcoming.map((t) => t.id)).not.toContain('legacy');
    // ...but a status-based section still finds it without throwing.
    expect(sections.inProgress.map((t) => t.id)).toContain('legacy');
  });
});
