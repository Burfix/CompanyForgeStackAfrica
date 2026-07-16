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

/**
 * App-level health set. The database enum (`project_health`) is a
 * superset — it still contains the original Slice 2 values (`on_track`)
 * because 0006 extended it additively, the same pattern as project_status.
 * `on_track` is a legacy alias for `healthy`; nothing in the app writes it
 * anymore, but existing rows keep working without a backfill.
 */
export const PROJECT_HEALTH_VALUES = ['healthy', 'needs_attention', 'at_risk', 'off_track', 'unknown'] as const;
export const projectHealthSchema = z.enum(PROJECT_HEALTH_VALUES);
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

export const PROJECT_CATEGORY_VALUES = [
  'fundraising',
  'pilot',
  'customer',
  'engineering',
  'product',
  'marketing',
  'partnership',
  'operations',
  'research',
  'finance',
] as const;
export const projectCategorySchema = z.enum(PROJECT_CATEGORY_VALUES);
export type ProjectCategory = z.infer<typeof projectCategorySchema>;

export const PRIORITY_LEVEL_VALUES = ['urgent', 'high', 'medium', 'low'] as const;
export const priorityLevelSchema = z.enum(PRIORITY_LEVEL_VALUES);
export type PriorityLevel = z.infer<typeof priorityLevelSchema>;

/** Display-only fallback used when a project has no explicit priority_score. */
export const PRIORITY_LEVEL_SCORE_FALLBACK: Record<PriorityLevel, number> = {
  urgent: 90,
  high: 70,
  medium: 50,
  low: 30,
};

export const REVIEW_CADENCE_VALUES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'milestone_based', 'none'] as const;
export const reviewCadenceSchema = z.enum(REVIEW_CADENCE_VALUES);
export type ReviewCadence = z.infer<typeof reviewCadenceSchema>;

export const ATTENTION_MODE_VALUES = ['founder', 'delegated', 'team', 'no_attention'] as const;
export const attentionModeSchema = z.enum(ATTENTION_MODE_VALUES);
export type AttentionMode = z.infer<typeof attentionModeSchema>;

export const BUSINESS_IMPACT_VALUES = [
  'revenue',
  'customer',
  'fundraising',
  'product',
  'strategic',
  'operational',
  'reputational',
  'compliance',
] as const;
export const businessImpactSchema = z.enum(BUSINESS_IMPACT_VALUES);
export type BusinessImpact = z.infer<typeof businessImpactSchema>;

export const DEPENDENCY_TYPE_VALUES = ['blocks', 'depends_on', 'related_to'] as const;
export const dependencyTypeSchema = z.enum(DEPENDENCY_TYPE_VALUES);
export type DependencyType = z.infer<typeof dependencyTypeSchema>;

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

/**
 * Shared field shape for create and update. `organizationId` is
 * deliberately not part of this schema — it is never accepted from the
 * client, only resolved server-side via `getCurrentOrg()` and passed
 * separately into the service layer. See services/project.service.ts.
 */
const projectFieldsSchema = {
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  category: projectCategorySchema,
  description: optionalText(4000),
  ownerId: z.string().uuid().optional(),
  status: projectStatusSchema.default('proposed'),
  focusLevel: focusLevelSchema.default(3),
  desiredOutcome: z.string().trim().min(2, 'Desired outcome is required').max(1000),
  successMetric: optionalText(300),
  // Deliberately free text, not a number — "2 paying locations" and
  // "Signed pilot agreement" are valid values, not just numeric progress.
  // (current_value/target_value were migrated from numeric(14,2) to text
  // in 0008 specifically so this schema change wasn't a lie about the
  // underlying column — see that migration's comment for the data check.)
  targetValue: optionalText(200),
  currentValue: optionalText(200),
  startDate: z.string().date().optional(),
  targetDate: z.string().date().optional(),
  nextReviewAt: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()),
  reviewCadence: reviewCadenceSchema.default('none'),
  blockedReason: optionalText(500),
  waitingOn: optionalText(500),
  // attentionMode is the user-facing control; founderAttentionRequired is
  // derived from it in the service layer (mapInputToPatch never writes it
  // directly from user input — see project.service.ts) so the two columns
  // can never drift apart.
  attentionMode: attentionModeSchema.default('no_attention'),
  priorityLevel: priorityLevelSchema.default('medium'),
  priorityScore: z.coerce.number().min(0, 'Priority score cannot be negative').max(9999.99, 'Priority score is out of bounds').optional(),
  health: projectHealthSchema.default('unknown'),
  healthNote: optionalText(500),
  businessImpact: z.array(businessImpactSchema).max(BUSINESS_IMPACT_VALUES.length).default([]),
  progressPercent: z.coerce.number().int('Progress must be a whole number').min(0, 'Progress cannot be below 0').max(100, 'Progress cannot exceed 100').default(0),
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
    if ((data.health === 'at_risk' || data.health === 'off_track') && !data.healthNote) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['healthNote'],
        message: 'A health note is required when health is At Risk or Off Track.',
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

/** A project cannot depend on itself; duplicate edges are rejected at the
 * service/repository layer (unique index on the DB side is the backstop). */
export const createProjectDependencySchema = z
  .object({
    projectId: z.string().uuid(),
    dependsOnProjectId: z.string().uuid(),
    dependencyType: dependencyTypeSchema.default('depends_on'),
    note: optionalText(500),
  })
  .superRefine((data, ctx) => {
    if (data.projectId === data.dependsOnProjectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dependsOnProjectId'],
        message: 'A project cannot depend on itself.',
      });
    }
  });
export type CreateProjectDependencyInput = z.infer<typeof createProjectDependencySchema>;

export const removeProjectDependencySchema = z.object({
  projectId: z.string().uuid(),
  dependencyId: z.string().uuid(),
});
export type RemoveProjectDependencyInput = z.infer<typeof removeProjectDependencySchema>;
