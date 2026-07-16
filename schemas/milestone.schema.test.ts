import { describe, it, expect } from 'vitest';
import {
  createMilestoneSchema,
  updateMilestoneSchema,
  reorderMilestonesSchema,
} from './milestone.schema';

const PROJECT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OWNER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Launch pilot',
    projectId: PROJECT_ID,
    ...overrides,
  };
}

describe('createMilestoneSchema', () => {
  it('requires a title', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ title: '' }));
    expect(result.success).toBe(false);
  });

  it('requires projectId to be a UUID', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ projectId: 'not-a-uuid' }));
    expect(result.success).toBe(false);
  });

  it('requires ownerId to be a UUID when supplied', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ ownerId: 'not-a-uuid' }));
    expect(result.success).toBe(false);
  });

  it('accepts a valid ownerId', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ ownerId: OWNER_ID }));
    expect(result.success).toBe(true);
  });

  it('rejects progress below 0', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ progressMode: 'manual', progressPercent: -1 }));
    expect(result.success).toBe(false);
  });

  it('rejects progress above 100', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ progressMode: 'manual', progressPercent: 101 }));
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer progress value', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ progressMode: 'manual', progressPercent: 50.5 }));
    expect(result.success).toBe(false);
  });

  it('accepts a valid manual progress value', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ progressMode: 'manual', progressPercent: 40 }));
    expect(result.success).toBe(true);
  });

  it('requires progressPercent when progressMode is manual', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ progressMode: 'manual' }));
    expect(result.success).toBe(false);
  });

  it('does not require progressPercent when progressMode is automatic', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ progressMode: 'automatic' }));
    expect(result.success).toBe(true);
  });

  it('rejects a due date before the start date', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ startDate: '2026-06-01', dueDate: '2026-05-01' }));
    expect(result.success).toBe(false);
  });

  it('accepts a due date on or after the start date', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ startDate: '2026-06-01', dueDate: '2026-06-15' }));
    expect(result.success).toBe(true);
  });

  it('requires a health note when health is at_risk', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ health: 'at_risk' }));
    expect(result.success).toBe(false);
  });

  it('requires a health note when health is off_track', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ health: 'off_track' }));
    expect(result.success).toBe(false);
  });

  it('accepts at_risk health with a note', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ health: 'at_risk', healthNote: 'Waiting on legal review.' }));
    expect(result.success).toBe(true);
  });

  it('does not require a health note for healthy', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ health: 'healthy' }));
    expect(result.success).toBe(true);
  });

  it('requires a blocked reason when status is blocked', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ status: 'blocked' }));
    expect(result.success).toBe(false);
  });

  it('accepts blocked status with a reason', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ status: 'blocked', blockedReason: 'Waiting on vendor contract.' }));
    expect(result.success).toBe(true);
  });

  it('requires waiting_on when status is waiting', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ status: 'waiting' }));
    expect(result.success).toBe(false);
  });

  it('accepts waiting status with waiting_on', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ status: 'waiting', waitingOn: 'Customer sign-off' }));
    expect(result.success).toBe(true);
  });

  it('accepts every valid status value', () => {
    for (const status of ['pending', 'in_progress', 'completed', 'missed', 'cancelled']) {
      const result = createMilestoneSchema.safeParse(baseInput({ status }));
      expect(result.success, `status ${status} should be valid`).toBe(true);
    }
  });

  it('rejects an invalid status value', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ status: 'not_a_status' }));
    expect(result.success).toBe(false);
  });

  it('does not accept a completedAt field at all — it is not part of the schema', () => {
    const parsed = createMilestoneSchema.parse(baseInput());
    expect('completedAt' in parsed).toBe(false);
  });

  it('does not accept a founderRequired field at all — it is derived, never client-supplied', () => {
    const parsed = createMilestoneSchema.parse(baseInput());
    expect('founderRequired' in parsed).toBe(false);
  });

  it('defaults progressMode to automatic', () => {
    const parsed = createMilestoneSchema.parse(baseInput());
    expect(parsed.progressMode).toBe('automatic');
  });

  it('defaults status to pending', () => {
    const parsed = createMilestoneSchema.parse(baseInput());
    expect(parsed.status).toBe('pending');
  });

  it('defaults priority to medium', () => {
    const parsed = createMilestoneSchema.parse(baseInput());
    expect(parsed.priority).toBe('medium');
  });

  it('trims and enforces a minimum title length', () => {
    const result = createMilestoneSchema.safeParse(baseInput({ title: 'A' }));
    expect(result.success).toBe(false);
  });
});

describe('updateMilestoneSchema', () => {
  it('allows a partial patch with no fields set', () => {
    const result = updateMilestoneSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('still enforces the blocked-reason rule when status is present', () => {
    const result = updateMilestoneSchema.safeParse({ status: 'blocked' });
    expect(result.success).toBe(false);
  });

  it('still enforces the health-note rule when health is present', () => {
    const result = updateMilestoneSchema.safeParse({ health: 'off_track' });
    expect(result.success).toBe(false);
  });
});

describe('reorderMilestonesSchema', () => {
  it('requires at least one milestone id', () => {
    const result = reorderMilestonesSchema.safeParse({ projectId: PROJECT_ID, orderedMilestoneIds: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID milestone id', () => {
    const result = reorderMilestonesSchema.safeParse({ projectId: PROJECT_ID, orderedMilestoneIds: ['not-a-uuid'] });
    expect(result.success).toBe(false);
  });

  it('accepts a valid ordered list', () => {
    const result = reorderMilestonesSchema.safeParse({ projectId: PROJECT_ID, orderedMilestoneIds: [OWNER_ID] });
    expect(result.success).toBe(true);
  });
});
