import { describe, it, expect } from 'vitest';
import {
  createProjectSchema,
  updateProjectStatusSchema,
  updateProjectFocusLevelSchema,
  archiveOrParkProjectSchema,
} from './project.schema';

const baseInput = {
  name: 'Test Project',
  category: 'engineering',
  desiredOutcome: 'Ship the thing.',
};

describe('createProjectSchema', () => {
  it('accepts minimal valid input', () => {
    const result = createProjectSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });

  it('rejects a missing name', () => {
    const result = createProjectSchema.safeParse({ ...baseInput, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing desired outcome', () => {
    const result = createProjectSchema.safeParse({ ...baseInput, desiredOutcome: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a target date before the start date', () => {
    const result = createProjectSchema.safeParse({
      ...baseInput,
      startDate: '2026-06-01',
      targetDate: '2026-05-01',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('targetDate'))).toBe(true);
    }
  });

  it('accepts a target date on or after the start date', () => {
    const result = createProjectSchema.safeParse({
      ...baseInput,
      startDate: '2026-05-01',
      targetDate: '2026-05-01',
    });
    expect(result.success).toBe(true);
  });

  it('requires a blocked reason when status is blocked', () => {
    const result = createProjectSchema.safeParse({ ...baseInput, status: 'blocked' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('blockedReason'))).toBe(true);
    }
  });

  it('accepts blocked status with a reason given', () => {
    const result = createProjectSchema.safeParse({
      ...baseInput,
      status: 'blocked',
      blockedReason: 'Waiting on legal review.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a priority score outside valid bounds', () => {
    const result = createProjectSchema.safeParse({ ...baseInput, priorityScore: -5 });
    expect(result.success).toBe(false);
  });

  it('never accepts organizationId as a field (not part of the schema)', () => {
    const shape = createProjectSchema._def as unknown as { schema?: { shape: Record<string, unknown> } };
    // organizationId must not be an accepted key at all — resolved server-side only.
    const parsed = createProjectSchema.parse({ ...baseInput, organizationId: 'sneaky-org-id' } as never);
    expect((parsed as Record<string, unknown>).organizationId).toBeUndefined();
  });
});

describe('updateProjectStatusSchema', () => {
  it('requires a blocked reason when transitioning to blocked', () => {
    const result = updateProjectStatusSchema.safeParse({
      projectId: '11111111-1111-1111-1111-111111111111',
      status: 'blocked',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a non-blocked transition without a reason', () => {
    const result = updateProjectStatusSchema.safeParse({
      projectId: '11111111-1111-1111-1111-111111111111',
      status: 'active',
    });
    expect(result.success).toBe(true);
  });
});

describe('updateProjectFocusLevelSchema', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';

  it('requires a reason when setting focus level to Critical', () => {
    const result = updateProjectFocusLevelSchema.safeParse({ projectId, focusLevel: 1 });
    expect(result.success).toBe(false);
  });

  it('accepts Critical with a reason', () => {
    const result = updateProjectFocusLevelSchema.safeParse({ projectId, focusLevel: 1, reason: 'Investor deadline moved up.' });
    expect(result.success).toBe(true);
  });

  it('requires an override reason when overrideCriticalLimit is set', () => {
    const result = updateProjectFocusLevelSchema.safeParse({
      projectId,
      focusLevel: 1,
      reason: 'Urgent.',
      overrideCriticalLimit: true,
    });
    expect(result.success).toBe(false);
  });

  it('does not require a reason for non-Critical levels', () => {
    const result = updateProjectFocusLevelSchema.safeParse({ projectId, focusLevel: 3 });
    expect(result.success).toBe(true);
  });
});

describe('archiveOrParkProjectSchema', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';

  it('requires a reason to park a project', () => {
    const result = archiveOrParkProjectSchema.safeParse({ projectId, action: 'park' });
    expect(result.success).toBe(false);
  });

  it('accepts parking with a reason', () => {
    const result = archiveOrParkProjectSchema.safeParse({ projectId, action: 'park', reason: 'Deprioritized this quarter.' });
    expect(result.success).toBe(true);
  });

  it('does not require a reason to archive', () => {
    const result = archiveOrParkProjectSchema.safeParse({ projectId, action: 'archive' });
    expect(result.success).toBe(true);
  });
});
