import { z } from 'zod';
import { priorityLevelSchema, attentionModeSchema } from '@/schemas/project.schema';

// Milestone priority reuses project_priority_level (urgent/high/medium/low)
// — identical vocabulary, no reason to duplicate. Attention mode reuses
// project_attention_mode (founder/delegated/team/no_attention) — same
// shared vocabulary Tasks already reuses. See migration 0009 comment.
const milestonePrioritySchema = priorityLevelSchema;
const milestoneAttentionModeSchema = attentionModeSchema;
export { milestonePrioritySchema, milestoneAttentionModeSchema };

/**
 * App-level status set. The database enum (`milestone_status`) is a
 * superset that also still contains nothing beyond these seven values —
 * 0009 added blocked/waiting/cancelled additively alongside the original
 * pending/in_progress/completed/missed. All seven are valid app-level
 * values (unlike Tasks/Projects, there's no legacy value here that's been
 * superseded — every value is current).
 */
export const MILESTONE_STATUS_VALUES = [
  'pending',
  'in_progress',
  'blocked',
  'waiting',
  'completed',
  'missed',
  'cancelled',
] as const;
export const milestoneStatusSchema = z.enum(MILESTONE_STATUS_VALUES);
export type MilestoneStatus = z.infer<typeof milestoneStatusSchema>;

export const MILESTONE_HEALTH_VALUES = ['healthy', 'needs_attention', 'at_risk', 'off_track', 'unknown'] as const;
export const milestoneHealthSchema = z.enum(MILESTONE_HEALTH_VALUES);
export type MilestoneHealth = z.infer<typeof milestoneHealthSchema>;

export const MILESTONE_PROGRESS_MODE_VALUES = ['automatic', 'manual'] as const;
export const milestoneProgressModeSchema = z.enum(MILESTONE_PROGRESS_MODE_VALUES);
export type MilestoneProgressMode = z.infer<typeof milestoneProgressModeSchema>;

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

/**
 * Shared field shape for create/update. `organizationId` is never part of
 * this schema — resolved server-side via `getCurrentOrg()`, same rule as
 * projects/tasks. `completedAt` is never part of this schema at all — only
 * completeMilestone/reopenMilestone ever set it, server-side, exclusively.
 * `founderRequired` is likewise never accepted here — it is always derived
 * from `attentionMode` in the service layer (see milestone.service.ts),
 * the same rule that keeps projects.founder_attention_required and
 * tasks.founder_required from drifting away from their attention_mode.
 */
const milestoneFieldsSchema = {
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(200),
  projectId: z.string().uuid('Select a project.'),
  description: optionalText(4000),
  successCriteria: optionalText(1000),
  ownerId: z.string().uuid().optional(),
  status: milestoneStatusSchema.default('pending'),
  priority: milestonePrioritySchema.default('medium'),
  health: milestoneHealthSchema.default('unknown'),
  healthNote: optionalText(500),
  attentionMode: milestoneAttentionModeSchema.default('no_attention'),
  progressMode: milestoneProgressModeSchema.default('automatic'),
  progressPercent: z.coerce.number().int('Progress must be a whole number').min(0, 'Progress cannot be below 0').max(100, 'Progress cannot exceed 100').optional(),
  targetValue: optionalText(200),
  currentValue: optionalText(200),
  startDate: z.string().date().optional(),
  dueDate: z.string().date().optional(),
  nextReviewAt: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()),
  blockedReason: optionalText(500),
  waitingOn: optionalText(500),
  sortOrder: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).safe().optional(),
};

function withMilestoneCrossFieldRules<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((data: any, ctx) => {
    if (data.startDate && data.dueDate && data.dueDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueDate'],
        message: 'Due date cannot be before the start date.',
      });
    }
    if ((data.health === 'at_risk' || data.health === 'off_track') && !data.healthNote) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['healthNote'],
        message: 'A health note is required when health is At Risk or Off Track.',
      });
    }
    if (data.status === 'blocked' && !data.blockedReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blockedReason'],
        message: 'A blocked reason is required when status is Blocked.',
      });
    }
    if (data.status === 'waiting' && !data.waitingOn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['waitingOn'],
        message: 'Waiting on is required when status is Waiting.',
      });
    }
    // "Manual progress required when progress_mode is manual" — the service
    // layer is the one that actually decides whether to accept, ignore, or
    // recalculate progressPercent (see milestone.service.ts), but a client
    // that explicitly switches to manual mode without ever supplying a
    // number is almost certainly a form bug worth surfacing here rather
    // than silently defaulting to 0.
    if (data.progressMode === 'manual' && data.progressPercent === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['progressPercent'],
        message: 'Enter a progress percentage when Progress Mode is Manual.',
      });
    }
  });
}

export const createMilestoneSchema = withMilestoneCrossFieldRules(z.object(milestoneFieldsSchema));
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

/** Same shape, every field optional — used for edits. Cross-field rules
 * still apply where the relevant fields are present in the submission. */
export const updateMilestoneSchema = withMilestoneCrossFieldRules(
  z.object(
    Object.fromEntries(
      Object.entries(milestoneFieldsSchema).map(([key, value]) => [key, (value as z.ZodTypeAny).optional()]),
    ) as { [K in keyof typeof milestoneFieldsSchema]: z.ZodOptional<(typeof milestoneFieldsSchema)[K]> },
  ),
);
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;

export const updateMilestoneStatusSchema = z
  .object({
    milestoneId: z.string().uuid(),
    status: milestoneStatusSchema,
    blockedReason: optionalText(500),
    waitingOn: optionalText(500),
    reason: optionalText(500),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'blocked' && !data.blockedReason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blockedReason'], message: 'A blocked reason is required when status is Blocked.' });
    }
    if (data.status === 'waiting' && !data.waitingOn) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['waitingOn'], message: 'Waiting on is required when status is Waiting.' });
    }
  });
export type UpdateMilestoneStatusInput = z.infer<typeof updateMilestoneStatusSchema>;

/** `completedAt` is deliberately not accepted here — the service sets it. */
export const completeMilestoneSchema = z.object({
  milestoneId: z.string().uuid(),
  reason: optionalText(500),
});
export type CompleteMilestoneInput = z.infer<typeof completeMilestoneSchema>;

export const REOPEN_MILESTONE_TARGET_STATUSES = ['pending', 'in_progress'] as const;
export const reopenMilestoneSchema = z.object({
  milestoneId: z.string().uuid(),
  targetStatus: z.enum(REOPEN_MILESTONE_TARGET_STATUSES).default('in_progress'),
  reason: optionalText(500),
});
export type ReopenMilestoneInput = z.infer<typeof reopenMilestoneSchema>;

export const cancelMilestoneSchema = z.object({
  milestoneId: z.string().uuid(),
  reason: optionalText(500),
});
export type CancelMilestoneInput = z.infer<typeof cancelMilestoneSchema>;

/** A single milestone's new position within its project. The service loops
 * over these transactionally-as-possible (see milestone.service.ts for the
 * documented limits of that guarantee under the current Supabase client
 * pattern) and verifies every ID belongs to the same project/org first. */
export const reorderMilestonesSchema = z.object({
  projectId: z.string().uuid(),
  orderedMilestoneIds: z.array(z.string().uuid()).min(1, 'Nothing to reorder.'),
});
export type ReorderMilestonesInput = z.infer<typeof reorderMilestonesSchema>;
