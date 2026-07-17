import { tasksRepository } from '@/repositories/tasks.repository';
import { projectsRepository } from '@/repositories/projects.repository';
import { milestonesRepository } from '@/repositories/milestones.repository';
import { activityRepository } from '@/repositories/activity.repository';
import { milestoneService } from '@/services/milestone.service';
import { NotFoundError, BusinessRuleError } from '@/lib/errors';
import { diffPatch } from '@/lib/diff-patch';
import { TASK_STATUS_META, TASK_PRIORITY_META, ATTENTION_MODE_META, attentionModeRequiresFounder } from '@/features/tasks/constants';
import {
  createTaskSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
  updateTaskPrioritySchema,
  assignTaskSchema,
  completeTaskSchema,
  reopenTaskSchema,
  cancelTaskSchema,
  type CreateTaskInput,
  type UpdateTaskInput,
  type UpdateTaskStatusInput,
  type UpdateTaskPriorityInput,
  type AssignTaskInput,
  type CompleteTaskInput,
  type ReopenTaskInput,
  type CancelTaskInput,
  type TaskStatus,
} from '@/schemas/task.schema';
import type { Tables, TablesInsert, TablesUpdate, Json } from '@/types/database.types';

type TaskRow = Tables<'tasks'>;

// ---------------------------------------------------------------------
// Status transition rules — centralized here rather than scattered
// through UI components, per the Slice 3 spec.
// ---------------------------------------------------------------------

const TERMINAL_STATUSES: TaskStatus[] = ['completed', 'cancelled'];

/**
 * Validates a status transition. Deliberately permissive for most moves
 * (Inbox/Planned/In Progress/Waiting/Blocked/Review can move between each
 * other freely — that's normal execution flow) but enforces the rules the
 * spec calls out explicitly:
 *   - completed is only reachable through completeTask, never a bare
 *     status change (so completed_at is always server-timestamped)
 *   - a cancelled task cannot move directly to completed either — this
 *     falls out of the rule above, since completed always requires
 *     completeTask regardless of the starting status
 *   - once a task is completed or cancelled, only reopenTask may move it
 *     to a different status — a bare status change can't silently
 *     resurrect it
 */
export function assertValidStatusTransition(from: TaskStatus, to: TaskStatus): void {
  if (from === to) return;
  if (to === 'completed') {
    throw new BusinessRuleError('Use completeTask to mark a task complete — this sets completed_at server-side.', 'USE_COMPLETE_TASK');
  }
  if (TERMINAL_STATUSES.includes(from)) {
    throw new BusinessRuleError('Use reopenTask to move a completed or cancelled task to a different status.', 'USE_REOPEN_TASK');
  }
}

async function assertTaskInOrg(organizationId: string, taskId: string): Promise<TaskRow> {
  // Deliberately fetches the FULL canonical row (getTaskForMutation), not
  // the slim verifyTaskAccess projection — diffPatch below needs every
  // column that might appear in a patch to be present on `existing`, or
  // unrelated fields would spuriously show up as "changed" every time
  // (existing[key] would be `undefined` rather than the real stored
  // value). This was the confirmed Slice 4.5 Risk 1 bug: verifyTaskAccess
  // only selected 9 columns, omitting milestone_id, notes, due_at,
  // start_at, estimated/actual_minutes, blocked_reason, waiting_on,
  // next_action, source_type/reference — any resubmitted-but-unchanged
  // value for those would falsely register as a change AND, in
  // milestone_id's case, falsely trigger a milestone/project progress
  // recalculation on every update. Same canonical-read convention as
  // assertProjectInOrg in project.service.ts / assertMilestoneInOrg in
  // milestone.service.ts.
  const task = await tasksRepository.getTaskForMutation(organizationId, taskId);
  if (!task) {
    // Same "never confirm which" behavior as projects: identical message
    // whether the task doesn't exist or belongs to a different org.
    throw new NotFoundError('Task not found.');
  }
  return task as TaskRow;
}

async function assertProjectInOrg(organizationId: string, projectId: string) {
  const project = await projectsRepository.verifyProjectAccess(organizationId, projectId);
  if (!project) {
    throw new BusinessRuleError('The selected project does not belong to this organization.', 'PROJECT_NOT_IN_ORG');
  }
  return project;
}

async function assertOwnerInOrg(organizationId: string, ownerId: string | null | undefined) {
  if (!ownerId) return;
  const isMember = await tasksRepository.verifyOwnerBelongsToOrganisation(organizationId, ownerId);
  if (!isMember) {
    throw new BusinessRuleError('The selected owner is not a member of this organization.', 'OWNER_NOT_IN_ORG');
  }
}

/**
 * Verifies a milestone_id both belongs to the selected project (so a task
 * can never be linked to a milestone from another project — or, since
 * milestones are org-scoped by the same query, another organization
 * either) and isn't cancelled. Completed milestones are deliberately
 * allowed through here — the spec's "warn before assigning a task to a
 * completed milestone" is a soft, UI-level confirmation (see the task
 * form), not a hard server-side rejection like the cancelled-milestone
 * case.
 */
async function assertMilestoneBelongsToProject(organizationId: string, milestoneId: string | null | undefined, projectId: string) {
  if (!milestoneId) return;
  const result = await milestonesRepository.verifyMilestoneBelongsToProject(organizationId, milestoneId, projectId);
  if (!result.belongs) {
    throw new BusinessRuleError('The selected milestone does not belong to the selected project.', 'MILESTONE_NOT_IN_PROJECT');
  }
  if (result.status === 'cancelled') {
    throw new BusinessRuleError('This milestone has been cancelled and cannot accept new tasks.', 'MILESTONE_CANCELLED');
  }
}

/**
 * Fire-and-await milestone progress recalculation, but only when a task
 * actually has a milestone attached — a task with no milestone_id should
 * never trigger any milestone or project roll-up work.
 *
 * IMPORTANT — failure isolation (Slice 4.5 Part 9): the primary task
 * mutation has already succeeded by the time this runs. There is no
 * shared database transaction between "write the task" and "recalculate
 * its milestone/project roll-up" (see the transaction-honesty comments in
 * milestone.service.ts / milestones.repository.ts), so a roll-up failure
 * here must never be allowed to make the caller believe the task write
 * itself failed. This catches the error, logs it server-side with enough
 * context to investigate, and returns a plain-language warning string
 * instead of throwing — the task mutation methods below thread that
 * warning back to the Server Action layer, which surfaces it as a
 * non-blocking notice (never a raw error) rather than swallowing it
 * silently. execution-reconciliation.service.ts exists specifically to
 * repair whatever this leaves out of sync.
 */
async function recalcMilestoneIfPresent(organizationId: string, actorId: string, milestoneId: string | null | undefined): Promise<string | undefined> {
  if (!milestoneId) return undefined;
  try {
    await milestoneService.recalculateMilestoneProgress(organizationId, actorId, milestoneId, 'task_rollup');
    return undefined;
  } catch (error) {
    console.error('[task.service] milestone roll-up failed after task mutation', { organizationId, milestoneId, error });
    return 'Saved, but the milestone/project progress could not be refreshed automatically. Run reconciliation from System Health to correct it.';
  }
}

/** camelCase input keys -> snake_case DB columns. `founder_required` is
 * never taken from raw input — always derived from `attentionMode`, same
 * rule as projects.founder_attention_required. `completed_at` is never set
 * here at all — completeTask/reopenTask own it exclusively. */
function mapInputToPatch(input: Partial<CreateTaskInput | UpdateTaskInput>): TablesUpdate<'tasks'> {
  const patch: TablesUpdate<'tasks'> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.projectId !== undefined) patch.project_id = input.projectId;
  if (input.description !== undefined) patch.notes = input.description ?? null;
  if (input.ownerId !== undefined) patch.assignee_id = input.ownerId ?? null;
  if (input.milestoneId !== undefined) patch.milestone_id = input.milestoneId ?? null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.attentionMode !== undefined) {
    patch.attention_mode = input.attentionMode;
    patch.founder_required = attentionModeRequiresFounder(input.attentionMode);
  }
  if (input.dueAt !== undefined) patch.due_at = input.dueAt ?? null;
  if (input.startAt !== undefined) patch.start_at = input.startAt ?? null;
  if (input.estimatedMinutes !== undefined) patch.estimated_minutes = input.estimatedMinutes ?? null;
  if (input.actualMinutes !== undefined) patch.actual_minutes = input.actualMinutes ?? null;
  if (input.blockedReason !== undefined) patch.blocked_reason = input.blockedReason ?? null;
  if (input.waitingOn !== undefined) patch.waiting_on = input.waitingOn ?? null;
  if (input.nextAction !== undefined) patch.next_action = input.nextAction ?? null;
  if (input.sourceType !== undefined) patch.source_type = input.sourceType;
  if (input.sourceReference !== undefined) patch.source_reference = input.sourceReference ?? null;
  return patch;
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  project_id: 'Project',
  notes: 'Description',
  assignee_id: 'Owner',
  milestone_id: 'Milestone',
  status: 'Status',
  priority: 'Priority',
  attention_mode: 'Attention mode',
  founder_required: 'Founder required',
  due_at: 'Due date',
  start_at: 'Start date',
  estimated_minutes: 'Estimated time',
  actual_minutes: 'Actual time',
  blocked_reason: 'Blocked reason',
  waiting_on: 'Waiting on',
  next_action: 'Next action',
  source_type: 'Source type',
  source_reference: 'Source reference',
};

function describeChange(changedFields: string[], previousValues: Record<string, unknown>, newValues: Record<string, unknown>): string {
  if (changedFields.length === 1) {
    const field = changedFields[0]!;
    if (field === 'status') {
      const from = TASK_STATUS_META[previousValues.status as TaskStatus]?.label ?? previousValues.status;
      const to = TASK_STATUS_META[newValues.status as TaskStatus]?.label ?? newValues.status;
      return `Task moved from ${from} to ${to}`;
    }
    if (field === 'priority') {
      const from = TASK_PRIORITY_META[previousValues.priority as keyof typeof TASK_PRIORITY_META]?.label ?? previousValues.priority;
      const to = TASK_PRIORITY_META[newValues.priority as keyof typeof TASK_PRIORITY_META]?.label ?? newValues.priority;
      return `Task priority changed from ${from} to ${to}`;
    }
    if (field === 'assignee_id') return 'Task owner changed';
    if (field === 'due_at') return 'Due date changed';
    if (field === 'title') return `Task renamed to ${newValues.title}`;
    if (field === 'attention_mode') {
      const to = ATTENTION_MODE_META[newValues.attention_mode as keyof typeof ATTENTION_MODE_META]?.label ?? newValues.attention_mode;
      return `Attention mode changed to ${to}`;
    }
    if (field === 'waiting_on') return 'Waiting-on updated';
    if (field === 'next_action') return 'Next action updated';
    if (field === 'blocked_reason') return 'Blocker updated';
    return `${FIELD_LABELS[field] ?? field} updated`;
  }
  return `Task updated: ${changedFields.length} fields`;
}

async function recordTaskActivity(params: {
  organizationId: string;
  actorId: string;
  taskId: string;
  eventType: string;
  title: string;
  metadata: Record<string, unknown>;
}) {
  await activityRepository.record({
    organization_id: params.organizationId,
    actor_id: params.actorId,
    event_type: params.eventType,
    entity_type: 'task',
    entity_id: params.taskId,
    title: params.title,
    metadata: { task_id: params.taskId, performed_by_user_id: params.actorId, ...params.metadata } as Json,
  });
}

export const taskService = {
  /** Returns `{ task, warning }` rather than a bare row — see
   * recalcMilestoneIfPresent's doc comment above. `warning` is set only
   * when the task write itself succeeded but its milestone roll-up
   * failed; every caller (Server Actions) threads this into the UI as a
   * non-blocking notice, never a hard failure. */
  async createTask(organizationId: string, actorId: string, rawInput: CreateTaskInput) {
    const input = createTaskSchema.parse(rawInput);
    await assertProjectInOrg(organizationId, input.projectId);
    await assertOwnerInOrg(organizationId, input.ownerId);
    await assertMilestoneBelongsToProject(organizationId, input.milestoneId, input.projectId);

    const insert: TablesInsert<'tasks'> = {
      organization_id: organizationId,
      created_by: actorId,
      last_activity_at: new Date().toISOString(),
      ...mapInputToPatch(input),
      title: input.title,
      project_id: input.projectId,
    };

    const task = await tasksRepository.create(insert);

    await recordTaskActivity({
      organizationId,
      actorId,
      taskId: task.id,
      eventType: 'task.created',
      title: `Task created: ${task.title}`,
      metadata: { project_id: task.project_id, action: 'created' },
    });

    const warning = await recalcMilestoneIfPresent(organizationId, actorId, task.milestone_id);

    return { task, warning };
  },

  async updateTask(organizationId: string, actorId: string, taskId: string, rawInput: UpdateTaskInput) {
    const existing = await assertTaskInOrg(organizationId, taskId);
    const input = updateTaskSchema.parse(rawInput);

    if (input.projectId !== undefined) await assertProjectInOrg(organizationId, input.projectId);
    if (input.ownerId !== undefined) await assertOwnerInOrg(organizationId, input.ownerId);
    if (input.milestoneId !== undefined) {
      await assertMilestoneBelongsToProject(organizationId, input.milestoneId, input.projectId ?? existing.project_id);
    }
    if (input.status !== undefined) {
      assertValidStatusTransition(existing.status as TaskStatus, input.status);
    }

    const requestedPatch = mapInputToPatch(input);
    const { changedFields, previousValues, newValues, finalPatch } = diffPatch(existing as Record<string, unknown>, requestedPatch as Record<string, unknown>);

    if (changedFields.length === 0) {
      return { task: existing, warning: undefined };
    }

    (finalPatch as Record<string, unknown>).last_activity_at = new Date().toISOString();
    const updated = await tasksRepository.update(organizationId, taskId, finalPatch as TablesUpdate<'tasks'>);

    await recordTaskActivity({
      organizationId,
      actorId,
      taskId,
      eventType: 'task.updated',
      title: describeChange(changedFields, previousValues, newValues),
      metadata: {
        project_id: existing.project_id,
        action: 'updated',
        changed_fields: changedFields,
        previous_values: previousValues,
        new_values: newValues,
      },
    });

    // Moving a task between milestones affects both roll-ups; a status
    // change on a task that stayed on the same milestone only affects that
    // one. A task with no milestone at all (before or after) never
    // triggers any of this — recalcMilestoneIfPresent no-ops on null. Note
    // that with getTaskForMutation now supplying a full canonical row,
    // "moved" to the SAME milestone_id no longer appears in changedFields
    // at all (it's a genuine no-op), so this branch only ever runs for a
    // real move.
    let warning: string | undefined;
    if (changedFields.includes('milestone_id')) {
      const warningFromOld = await recalcMilestoneIfPresent(organizationId, actorId, existing.milestone_id);
      const warningFromNew = await recalcMilestoneIfPresent(organizationId, actorId, updated.milestone_id);
      warning = warningFromOld ?? warningFromNew;
    } else if (changedFields.includes('status')) {
      warning = await recalcMilestoneIfPresent(organizationId, actorId, existing.milestone_id);
    }

    return { task: updated, warning };
  },

  async updateTaskStatus(organizationId: string, actorId: string, rawInput: UpdateTaskStatusInput) {
    const input = updateTaskStatusSchema.parse(rawInput);
    const existing = await assertTaskInOrg(organizationId, input.taskId);

    if (existing.status === input.status) return { task: existing, warning: undefined };
    assertValidStatusTransition(existing.status as TaskStatus, input.status);

    const patch: TablesUpdate<'tasks'> = {
      status: input.status,
      last_activity_at: new Date().toISOString(),
      blocked_reason: input.status === 'blocked' ? (input.blockedReason ?? null) : null,
      waiting_on: input.status === 'waiting' ? (input.waitingOn ?? null) : null,
    };

    const updated = await tasksRepository.update(organizationId, input.taskId, patch);

    const fromLabel = TASK_STATUS_META[existing.status as TaskStatus]?.label ?? existing.status;
    const toLabel = TASK_STATUS_META[input.status]?.label ?? input.status;
    const eventType = input.status === 'blocked' ? 'task.blocked' : existing.status === 'blocked' ? 'task.unblocked' : input.status === 'review' ? 'task.moved_to_review' : 'task.status_changed';

    await recordTaskActivity({
      organizationId,
      actorId,
      taskId: input.taskId,
      eventType,
      title: `Task moved from ${fromLabel} to ${toLabel}`,
      metadata: {
        project_id: existing.project_id,
        action: 'status_changed',
        changed_fields: ['status'],
        previous_values: { status: existing.status },
        new_values: { status: input.status },
        reason: input.reason ?? null,
      },
    });

    const warning = await recalcMilestoneIfPresent(organizationId, actorId, existing.milestone_id);

    return { task: updated, warning };
  },

  async updateTaskPriority(organizationId: string, actorId: string, rawInput: UpdateTaskPriorityInput) {
    const input = updateTaskPrioritySchema.parse(rawInput);
    const existing = await assertTaskInOrg(organizationId, input.taskId);

    if (existing.priority === input.priority) return existing;

    const patch: TablesUpdate<'tasks'> = { priority: input.priority, last_activity_at: new Date().toISOString() };
    const updated = await tasksRepository.update(organizationId, input.taskId, patch);

    const fromLabel = TASK_PRIORITY_META[existing.priority as keyof typeof TASK_PRIORITY_META]?.label ?? existing.priority;
    const toLabel = TASK_PRIORITY_META[input.priority].label;

    await recordTaskActivity({
      organizationId,
      actorId,
      taskId: input.taskId,
      eventType: 'task.priority_changed',
      title: `Task priority changed from ${fromLabel} to ${toLabel}`,
      metadata: {
        project_id: existing.project_id,
        action: 'priority_changed',
        changed_fields: ['priority'],
        previous_values: { priority: existing.priority },
        new_values: { priority: input.priority },
        reason: input.reason ?? null,
      },
    });

    return updated;
  },

  async assignTask(organizationId: string, actorId: string, rawInput: AssignTaskInput) {
    const input = assignTaskSchema.parse(rawInput);
    const existing = await assertTaskInOrg(organizationId, input.taskId);
    await assertOwnerInOrg(organizationId, input.ownerId ?? undefined);

    if (existing.assignee_id === input.ownerId) return existing;

    const patch: TablesUpdate<'tasks'> = { assignee_id: input.ownerId, last_activity_at: new Date().toISOString() };
    const updated = await tasksRepository.update(organizationId, input.taskId, patch);

    await recordTaskActivity({
      organizationId,
      actorId,
      taskId: input.taskId,
      eventType: 'task.assigned',
      title: input.ownerId ? 'Task assigned' : 'Task unassigned',
      metadata: {
        project_id: existing.project_id,
        action: 'assigned',
        changed_fields: ['assignee_id'],
        previous_values: { assignee_id: existing.assignee_id },
        new_values: { assignee_id: input.ownerId },
      },
    });

    return updated;
  },

  /**
   * The only path that ever sets completed_at. Preserves the previous
   * status in activity metadata (so "what was it before completion" is
   * always recoverable). As of Slice 4, a task belonging to an
   * automatic-mode milestone triggers that milestone's (and in turn its
   * project's, if milestone-derived) progress recalculation.
   */
  async completeTask(organizationId: string, actorId: string, rawInput: CompleteTaskInput) {
    const input = completeTaskSchema.parse(rawInput);
    const existing = await assertTaskInOrg(organizationId, input.taskId);

    if (existing.status === 'completed') return { task: existing, warning: undefined };

    const completedAt = new Date().toISOString();
    const patch: TablesUpdate<'tasks'> = {
      status: 'completed',
      completed_at: completedAt,
      last_activity_at: completedAt,
      ...(input.actualMinutes !== undefined ? { actual_minutes: input.actualMinutes } : {}),
    };

    const updated = await tasksRepository.update(organizationId, input.taskId, patch);

    await recordTaskActivity({
      organizationId,
      actorId,
      taskId: input.taskId,
      eventType: 'task.completed',
      title: `Task completed: ${existing.title}`,
      metadata: {
        project_id: existing.project_id,
        action: 'completed',
        previous_status: existing.status,
        completed_at: completedAt,
      },
    });

    const warning = await recalcMilestoneIfPresent(organizationId, actorId, existing.milestone_id);

    return { task: updated, warning };
  },

  /** Clears completed_at and returns the task to a real working status.
   * The activity record retains previous_status='completed' so completion
   * history is never lost, only superseded. */
  async reopenTask(organizationId: string, actorId: string, rawInput: ReopenTaskInput) {
    const input = reopenTaskSchema.parse(rawInput);
    const existing = await assertTaskInOrg(organizationId, input.taskId);

    if (existing.status !== 'completed' && existing.status !== 'cancelled') {
      throw new BusinessRuleError('Only a completed or cancelled task can be reopened.', 'NOT_REOPENABLE');
    }

    const patch: TablesUpdate<'tasks'> = {
      status: input.targetStatus,
      completed_at: null,
      last_activity_at: new Date().toISOString(),
    };

    const updated = await tasksRepository.update(organizationId, input.taskId, patch);

    await recordTaskActivity({
      organizationId,
      actorId,
      taskId: input.taskId,
      eventType: 'task.reopened',
      title: `Task reopened: ${existing.title}`,
      metadata: {
        project_id: existing.project_id,
        action: 'reopened',
        previous_status: existing.status,
        new_status: input.targetStatus,
        reason: input.reason ?? null,
      },
    });

    const warning = await recalcMilestoneIfPresent(organizationId, actorId, existing.milestone_id);

    return { task: updated, warning };
  },

  async cancelTask(organizationId: string, actorId: string, rawInput: CancelTaskInput) {
    const input = cancelTaskSchema.parse(rawInput);
    const existing = await assertTaskInOrg(organizationId, input.taskId);

    if (existing.status === 'cancelled') return { task: existing, warning: undefined };

    const patch: TablesUpdate<'tasks'> = { status: 'cancelled', last_activity_at: new Date().toISOString() };
    const updated = await tasksRepository.update(organizationId, input.taskId, patch);

    await recordTaskActivity({
      organizationId,
      actorId,
      taskId: input.taskId,
      eventType: 'task.cancelled',
      title: `Task cancelled: ${existing.title}`,
      metadata: {
        project_id: existing.project_id,
        action: 'cancelled',
        previous_status: existing.status,
        reason: input.reason ?? null,
      },
    });

    // A cancelled task drops out of the milestone's eligible-task set
    // entirely — recalculate so it stops counting in either the numerator
    // or denominator.
    const warning = await recalcMilestoneIfPresent(organizationId, actorId, existing.milestone_id);

    return { task: updated, warning };
  },
};
