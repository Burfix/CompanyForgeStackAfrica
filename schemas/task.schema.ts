import { z } from 'zod';
// Attention mode is genuinely shared between Projects and Tasks (same DB
// enum, same meaning) — reused directly rather than redefined.
import { attentionModeSchema } from '@/schemas/project.schema';
export { attentionModeSchema as taskAttentionModeSchema };

/**
 * App-level status set. The database enum (`task_status`) is a superset —
 * it still contains the original values (`todo`, `done`) because 0007
 * extended it additively, the same pattern used for project_status and
 * project_health. Nothing new writes `todo`/`done`; this curated list is
 * what forms, filters, and transition logic are allowed to use.
 */
export const TASK_STATUS_VALUES = [
  'inbox',
  'planned',
  'in_progress',
  'waiting',
  'blocked',
  'review',
  'completed',
  'cancelled',
] as const;
export const taskStatusSchema = z.enum(TASK_STATUS_VALUES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const TASK_PRIORITY_VALUES = ['urgent', 'high', 'medium', 'low'] as const;
export const taskPrioritySchema = z.enum(TASK_PRIORITY_VALUES);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

/** Curated at the Zod/UI layer rather than a DB enum, same reasoning as
 * projects.category: keeps the door open without a migration if a new
 * source type is needed. */
export const TASK_SOURCE_TYPE_VALUES = ['manual', 'import', 'integration', 'system'] as const;
export const taskSourceTypeSchema = z.enum(TASK_SOURCE_TYPE_VALUES);
export type TaskSourceType = z.infer<typeof taskSourceTypeSchema>;

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

/**
 * Shared field shape for create and update. `organizationId` is never part
 * of this schema — resolved server-side via `getCurrentOrg()`, same rule as
 * projects. `completedAt` is likewise never part of this schema at all: the
 * service sets it server-side exclusively (see completeTask/reopenTask in
 * services/task.service.ts) — a client can request status: 'completed' but
 * can never supply a completed_at value directly.
 */
const taskFieldsSchema = {
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(200),
  projectId: z.string().uuid('Select a project.'),
  description: optionalText(4000),
  ownerId: z.string().uuid().optional(),
  milestoneId: z.string().uuid().optional(),
  status: taskStatusSchema.default('inbox'),
  priority: taskPrioritySchema.default('medium'),
  attentionMode: attentionModeSchema.default('no_attention'),
  dueAt: z.string().datetime({ offset: true }).optional().or(z.string().min(1).optional()),
  startAt: z.string().datetime({ offset: true }).optional().or(z.string().min(1).optional()),
  estimatedMinutes: z.coerce.number().int('Estimated minutes must be a whole number').positive('Estimated minutes must be greater than 0').optional(),
  actualMinutes: z.coerce.number().int('Actual minutes must be a whole number').min(0, 'Actual minutes cannot be negative').optional(),
  blockedReason: optionalText(500),
  waitingOn: optionalText(500),
  nextAction: optionalText(300),
  sourceType: taskSourceTypeSchema.default('manual'),
  sourceReference: optionalText(300),
};

function withTaskCrossFieldRules<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((data: any, ctx) => {
    if (data.startAt && data.dueAt && new Date(data.dueAt) < new Date(data.startAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueAt'],
        message: 'Due date cannot be before the start date.',
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
  });
}

export const createTaskSchema = withTaskCrossFieldRules(z.object(taskFieldsSchema));
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** Same shape, every field optional except the schema still enforces the
 * blocked/waiting cross-field rules whenever those fields are present in
 * the submission — same pattern as updateProjectSchema. */
export const updateTaskSchema = withTaskCrossFieldRules(
  z.object(
    Object.fromEntries(
      Object.entries(taskFieldsSchema).map(([key, value]) => [key, (value as z.ZodTypeAny).optional()]),
    ) as { [K in keyof typeof taskFieldsSchema]: z.ZodOptional<(typeof taskFieldsSchema)[K]> },
  ),
);
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const updateTaskStatusSchema = z
  .object({
    taskId: z.string().uuid(),
    status: taskStatusSchema,
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
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;

export const updateTaskPrioritySchema = z.object({
  taskId: z.string().uuid(),
  priority: taskPrioritySchema,
  reason: optionalText(500),
});
export type UpdateTaskPriorityInput = z.infer<typeof updateTaskPrioritySchema>;

export const assignTaskSchema = z.object({
  taskId: z.string().uuid(),
  ownerId: z.string().uuid().nullable(),
});
export type AssignTaskInput = z.infer<typeof assignTaskSchema>;

/** `completedAt` is deliberately not accepted here — the service sets it. */
export const completeTaskSchema = z.object({
  taskId: z.string().uuid(),
  actualMinutes: z.coerce.number().int().min(0).optional(),
});
export type CompleteTaskInput = z.infer<typeof completeTaskSchema>;

export const REOPEN_TARGET_STATUSES = ['planned', 'in_progress'] as const;
export const reopenTaskSchema = z.object({
  taskId: z.string().uuid(),
  targetStatus: z.enum(REOPEN_TARGET_STATUSES).default('planned'),
  reason: optionalText(500),
});
export type ReopenTaskInput = z.infer<typeof reopenTaskSchema>;

export const cancelTaskSchema = z.object({
  taskId: z.string().uuid(),
  reason: optionalText(500),
});
export type CancelTaskInput = z.infer<typeof cancelTaskSchema>;
