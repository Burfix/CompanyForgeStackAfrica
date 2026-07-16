import { describe, it, expect } from 'vitest';
import { createTaskSchema, updateTaskStatusSchema, assignTaskSchema } from './task.schema';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';

const baseInput = {
  title: 'Follow up with investor',
  projectId: PROJECT_ID,
};

describe('createTaskSchema', () => {
  it('accepts minimal valid input', () => {
    const result = createTaskSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });

  it('rejects a missing title', () => {
    const result = createTaskSchema.safeParse({ ...baseInput, title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID project id', () => {
    const result = createTaskSchema.safeParse({ ...baseInput, projectId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects an uncontrolled status', () => {
    const result = createTaskSchema.safeParse({ ...baseInput, status: 'someday' });
    expect(result.success).toBe(false);
  });

  it('accepts every controlled status', () => {
    for (const status of ['inbox', 'planned', 'in_progress', 'waiting', 'blocked', 'review', 'completed', 'cancelled']) {
      // blocked/waiting need their companion field — supply both so this
      // loop tests "is the value itself accepted", not the cross-field rule.
      const result = createTaskSchema.safeParse({
        ...baseInput,
        status,
        blockedReason: status === 'blocked' ? 'Waiting on legal.' : undefined,
        waitingOn: status === 'waiting' ? 'Customer response.' : undefined,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an uncontrolled priority', () => {
    const result = createTaskSchema.safeParse({ ...baseInput, priority: 'someday-maybe' });
    expect(result.success).toBe(false);
  });

  it('accepts every controlled priority', () => {
    for (const priority of ['urgent', 'high', 'medium', 'low']) {
      expect(createTaskSchema.safeParse({ ...baseInput, priority }).success).toBe(true);
    }
  });

  it('rejects an uncontrolled attention mode', () => {
    const result = createTaskSchema.safeParse({ ...baseInput, attentionMode: 'ceo' });
    expect(result.success).toBe(false);
  });

  it('accepts every controlled attention mode (shared with Projects)', () => {
    for (const attentionMode of ['founder', 'delegated', 'team', 'no_attention']) {
      expect(createTaskSchema.safeParse({ ...baseInput, attentionMode }).success).toBe(true);
    }
  });

  it('requires a blocked reason when status is blocked', () => {
    const result = createTaskSchema.safeParse({ ...baseInput, status: 'blocked' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('blockedReason'))).toBe(true);
    }
  });

  it('requires waiting_on when status is waiting', () => {
    const result = createTaskSchema.safeParse({ ...baseInput, status: 'waiting' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('waitingOn'))).toBe(true);
    }
  });

  it('rejects a due date before the start date', () => {
    const result = createTaskSchema.safeParse({
      ...baseInput,
      startAt: '2026-06-01T10:00:00Z',
      dueAt: '2026-05-01T10:00:00Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('dueAt'))).toBe(true);
    }
  });

  it('accepts a due date on or after the start date', () => {
    const result = createTaskSchema.safeParse({
      ...baseInput,
      startAt: '2026-05-01T10:00:00Z',
      dueAt: '2026-05-01T12:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('requires estimated_minutes to be a positive integer', () => {
    expect(createTaskSchema.safeParse({ ...baseInput, estimatedMinutes: 0 }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...baseInput, estimatedMinutes: -5 }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...baseInput, estimatedMinutes: 30.5 }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...baseInput, estimatedMinutes: 30 }).success).toBe(true);
  });

  it('requires actual_minutes to be a non-negative integer', () => {
    expect(createTaskSchema.safeParse({ ...baseInput, actualMinutes: -1 }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...baseInput, actualMinutes: 0 }).success).toBe(true);
    expect(createTaskSchema.safeParse({ ...baseInput, actualMinutes: 45 }).success).toBe(true);
  });

  it('never accepts organizationId or founderRequired as fields (not part of the schema)', () => {
    const parsed = createTaskSchema.parse({ ...baseInput, organizationId: 'sneaky-org-id', founderRequired: true } as never);
    expect((parsed as Record<string, unknown>).organizationId).toBeUndefined();
    expect((parsed as Record<string, unknown>).founderRequired).toBeUndefined();
  });

  it('never accepts completedAt as a field (server sets it exclusively)', () => {
    const parsed = createTaskSchema.parse({ ...baseInput, completedAt: '2026-01-01T00:00:00Z' } as never);
    expect((parsed as Record<string, unknown>).completedAt).toBeUndefined();
  });
});

describe('updateTaskStatusSchema', () => {
  const taskId = '22222222-2222-2222-2222-222222222222';

  it('requires a blocked reason when transitioning to blocked', () => {
    const result = updateTaskStatusSchema.safeParse({ taskId, status: 'blocked' });
    expect(result.success).toBe(false);
  });

  it('requires waiting_on when transitioning to waiting', () => {
    const result = updateTaskStatusSchema.safeParse({ taskId, status: 'waiting' });
    expect(result.success).toBe(false);
  });

  it('accepts a normal transition without extra fields', () => {
    const result = updateTaskStatusSchema.safeParse({ taskId, status: 'in_progress' });
    expect(result.success).toBe(true);
  });
});

describe('assignTaskSchema', () => {
  it('accepts a null ownerId (unassign)', () => {
    const result = assignTaskSchema.safeParse({ taskId: '22222222-2222-2222-2222-222222222222', ownerId: null });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID ownerId', () => {
    const result = assignTaskSchema.safeParse({ taskId: '22222222-2222-2222-2222-222222222222', ownerId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});
