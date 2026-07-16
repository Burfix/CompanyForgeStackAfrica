import { describe, it, expect } from 'vitest';
import {
  createProjectSchema,
  updateProjectStatusSchema,
  updateProjectFocusLevelSchema,
  archiveOrParkProjectSchema,
  createProjectDependencySchema,
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

describe('createProjectSchema — controlled category', () => {
  it('rejects a category value outside the curated enum', () => {
    const result = createProjectSchema.safeParse({ ...baseInput, category: 'not-a-real-category' });
    expect(result.success).toBe(false);
  });

  it('accepts every curated category value', () => {
    for (const category of ['fundraising', 'pilot', 'customer', 'engineering', 'product', 'marketing', 'partnership', 'operations', 'research', 'finance']) {
      const result = createProjectSchema.safeParse({ ...baseInput, category });
      expect(result.success).toBe(true);
    }
  });
});

describe('createProjectSchema — progress_percent bounds', () => {
  it('rejects progress below 0', () => {
    const result = createProjectSchema.safeParse({ ...baseInput, progressPercent: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects progress above 100', () => {
    const result = createProjectSchema.safeParse({ ...baseInput, progressPercent: 101 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer progress value', () => {
    const result = createProjectSchema.safeParse({ ...baseInput, progressPercent: 50.5 });
    expect(result.success).toBe(false);
  });

  it('accepts 0 and 100 as valid boundaries', () => {
    expect(createProjectSchema.safeParse({ ...baseInput, progressPercent: 0 }).success).toBe(true);
    expect(createProjectSchema.safeParse({ ...baseInput, progressPercent: 100 }).success).toBe(true);
  });

  it('defaults to 0 when omitted', () => {
    const result = createProjectSchema.parse(baseInput);
    expect(result.progressPercent).toBe(0);
  });
});

describe('createProjectSchema — health note requirement', () => {
  it('requires a health note when health is at_risk', () => {
    const result = createProjectSchema.safeParse({ ...baseInput, health: 'at_risk' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('healthNote'))).toBe(true);
    }
  });

  it('requires a health note when health is off_track', () => {
    const result = createProjectSchema.safeParse({ ...baseInput, health: 'off_track' });
    expect(result.success).toBe(false);
  });

  it('does not require a health note for healthy or needs_attention', () => {
    expect(createProjectSchema.safeParse({ ...baseInput, health: 'healthy' }).success).toBe(true);
    expect(createProjectSchema.safeParse({ ...baseInput, health: 'needs_attention' }).success).toBe(true);
  });

  it('accepts at_risk with a health note given', () => {
    const result = createProjectSchema.safeParse({ ...baseInput, health: 'at_risk', healthNote: 'Waiting for integration credentials.' });
    expect(result.success).toBe(true);
  });
});

describe('createProjectSchema — priority, review cadence, attention mode, business impact', () => {
  it('rejects an uncontrolled priority level', () => {
    const result = createProjectSchema.safeParse({ ...baseInput, priorityLevel: 'super-urgent' });
    expect(result.success).toBe(false);
  });

  it('accepts every controlled priority level', () => {
    for (const priorityLevel of ['urgent', 'high', 'medium', 'low']) {
      expect(createProjectSchema.safeParse({ ...baseInput, priorityLevel }).success).toBe(true);
    }
  });

  it('rejects an uncontrolled review cadence', () => {
    const result = createProjectSchema.safeParse({ ...baseInput, reviewCadence: 'daily' });
    expect(result.success).toBe(false);
  });

  it('accepts every controlled review cadence', () => {
    for (const reviewCadence of ['weekly', 'biweekly', 'monthly', 'quarterly', 'milestone_based', 'none']) {
      expect(createProjectSchema.safeParse({ ...baseInput, reviewCadence }).success).toBe(true);
    }
  });

  it('rejects an uncontrolled attention mode', () => {
    const result = createProjectSchema.safeParse({ ...baseInput, attentionMode: 'ceo' });
    expect(result.success).toBe(false);
  });

  it('accepts every controlled attention mode', () => {
    for (const attentionMode of ['founder', 'delegated', 'team', 'no_attention']) {
      expect(createProjectSchema.safeParse({ ...baseInput, attentionMode }).success).toBe(true);
    }
  });

  it('rejects an uncontrolled business impact value', () => {
    const result = createProjectSchema.safeParse({ ...baseInput, businessImpact: ['revenue', 'made-up-dimension'] });
    expect(result.success).toBe(false);
  });

  it('accepts a valid set of business impact values', () => {
    const result = createProjectSchema.safeParse({ ...baseInput, businessImpact: ['revenue', 'customer', 'compliance'] });
    expect(result.success).toBe(true);
  });
});

describe('createProjectDependencySchema', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const otherId = '22222222-2222-2222-2222-222222222222';

  it('rejects a self-dependency', () => {
    const result = createProjectDependencySchema.safeParse({ projectId, dependsOnProjectId: projectId });
    expect(result.success).toBe(false);
  });

  it('accepts a valid dependency between two different projects', () => {
    const result = createProjectDependencySchema.safeParse({ projectId, dependsOnProjectId: otherId, dependencyType: 'blocks' });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID project id', () => {
    const result = createProjectDependencySchema.safeParse({ projectId: 'not-a-uuid', dependsOnProjectId: otherId });
    expect(result.success).toBe(false);
  });

  it('rejects an uncontrolled dependency type', () => {
    const result = createProjectDependencySchema.safeParse({ projectId, dependsOnProjectId: otherId, dependencyType: 'inspires' });
    expect(result.success).toBe(false);
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
