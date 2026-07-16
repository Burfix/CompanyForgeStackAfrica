import { z } from 'zod';

/**
 * App-level status set. The database enum (`project_status`) is a superset
 * — it still contains the original Slice 1 values (`planning`, `on_hold`)
 * because that migration was additive-only (see supabase/migrations/0005).
 * Nothing in the app writes those two values anymore; this curated list is
 * what forms, filters, and transition logic are allowed to use.
 */
export const PROJECT_STATUS_VALUES = [
  'proposed',
  'active',
  'at_risk',
  'blocked',
  'completed',
  'parked',
  'cancelled',
] as const;

export const projectStatusSchema = z.enum(PROJECT_STATUS_VALUES);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const projectHealthSchema = z.enum(['on_track', 'at_risk', 'off_track']);
export type ProjectHealth = z.infer<typeof projectHealthSchema>;

export const FOCUS_LEVEL_VALUES = [1, 2, 3, 4, 5] as const;
export const focusLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type FocusLevel = z.infer<typeof focusLevelSchema>;

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

/**
 * Shared field shape for create and update. `organizationId` is
 * deliberately not part of this schema — it is never accepted from the
 * client, only resolved server-side via `getCurrentOrg()` and passed
 * separately into the service layer. See services/project.service.ts.
 */
const projectFieldsSchema = {
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  category: z.string().trim().min(1, 'Category is required').max(60),
  description: optionalText(4000),
  ownerId: z.string().uuid().optional(),
  status: projectStatusSchema.default('proposed'),
  focusLevel: focusLevelSchema.default(3),
  desiredOutcome: z.string().trim().min(2, 'Desired outcome is required').max(1000),
  successMetric: optionalText(300),
  targetValue: z.coerce.number().finite().optional(),
  currentValue: z.coerce.number().finite().optional(),
  startDate: z.string().date().optional(),
  targetDate: z.string().date().optional(),
  nextReviewAt: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()),
  blockedReason: optionalText(500),
  waitingOn: optionalText(500),
  founderAttentionRequired: z.boolean().default(false),
  priorityScore: z.coerce.number().min(0, 'Priority score cannot be negative').max(9999.99, 'Priority score is out of bounds').optional(),
};

function withCrossFieldRules<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((data: any, ctx) => {
    if (data.startDate && data.targetDate && data.targetDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetDate'],
        message: 'Target date cannot be before the start date.',
      });
    }
    if (data.status === 'blocked' && !data.blockedReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blockedReason'],
        message: 'A blocked reason is required when status is Blocked.',
      });
    }
  });
}

export const createProjectSchema = withCrossFieldRules(z.object(projectFieldsSchema));
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/** Same shape, every field optional — used for edits. Cross-field rules
 * still apply where the relevant fields are present in the submission. */
export const updateProjectSchema = withCrossFieldRules(
  z.object(
    Object.fromEntries(
      Object.entries(projectFieldsSchema).map(([key, value]) => [key, (value as z.ZodTypeAny).optional()]),
    ) as { [K in keyof typeof projectFieldsSchema]: z.ZodOptional<(typeof projectFieldsSchema)[K]> },
  ),
);
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/** Critical (focus level 1) requires a reason; more than 3 Critical
 * projects requires an explicit override with its own reason. */
export const updateProjectFocusLevelSchema = z
  .object({
    projectId: z.string().uuid(),
    focusLevel: focusLevelSchema,
    reason: optionalText(500),
    overrideCriticalLimit: z.boolean().default(false),
    overrideReason: optionalText(500),
  })
  .superRefine((data, ctx) => {
    if (data.focusLevel === 1 && !data.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'A reason is required when setting a project to Critical.',
      });
    }
    if (data.overrideCriticalLimit && !data.overrideReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['overrideReason'],
        message: 'An override reason is required to exceed the Critical project limit.',
      });
    }
  });
export type UpdateProjectFocusLevelInput = z.infer<typeof updateProjectFocusLevelSchema>;

export const updateProjectStatusSchema = z
  .object({
    projectId: z.string().uuid(),
    status: projectStatusSchema,
    blockedReason: optionalText(500),
    reason: optionalText(500),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'blocked' && !data.blockedReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blockedReason'],
        message: 'A blocked reason is required when status is Blocked.',
      });
    }
  });
export type UpdateProjectStatusInput = z.infer<typeof updateProjectStatusSchema>;

/** Parking requires a reason. Archiving does not (it's a soft-hide of a
 * project already in a terminal state), but a reason is accepted and
 * logged if given. */
export const archiveOrParkProjectSchema = z
  .object({
    projectId: z.string().uuid(),
    action: z.enum(['archive', 'park']),
    reason: optionalText(500),
  })
  .superRefine((data, ctx) => {
    if (data.action === 'park' && !data.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'A reason is required to park a project.',
      });
    }
  });
export type ArchiveOrParkProjectInput = z.infer<typeof archiveOrParkProjectSchema>;

export const MAX_CRITICAL_PROJECTS = 3;
