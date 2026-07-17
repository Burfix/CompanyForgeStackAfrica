import { milestonesRepository } from '@/repositories/milestones.repository';
import { projectsRepository } from '@/repositories/projects.repository';
import { organizationsRepository } from '@/repositories/organizations.repository';
import { activityRepository } from '@/repositories/activity.repository';
import { NotFoundError, BusinessRuleError } from '@/lib/errors';
import { diffPatch } from '@/lib/diff-patch';
import { calculateMilestoneTaskProgress, calculateProjectMilestoneProgress } from '@/lib/progress';
import { MILESTONE_STATUS_META, isValidMilestoneStatusTransition, attentionModeRequiresFounder } from '@/features/milestones/constants';
import {
  createMilestoneSchema,
  updateMilestoneSchema,
  updateMilestoneStatusSchema,
  completeMilestoneSchema,
  reopenMilestoneSchema,
  cancelMilestoneSchema,
  reorderMilestonesSchema,
  type CreateMilestoneInput,
  type UpdateMilestoneInput,
  type UpdateMilestoneStatusInput,
  type CompleteMilestoneInput,
  type ReopenMilestoneInput,
  type CancelMilestoneInput,
  type ReorderMilestonesInput,
  type MilestoneStatus,
} from '@/schemas/milestone.schema';
import type { Tables, TablesInsert, TablesUpdate, Json } from '@/types/database.types';

type MilestoneRow = Tables<'milestones'>;

async function assertMilestoneInOrg(organizationId: string, milestoneId: string): Promise<MilestoneRow> {
  // Deliberately fetches the FULL canonical row (getMilestoneForMutation),
  // not the slim verifyMilestoneAccess projection — diffPatch below needs
  // every column that might appear in a patch to be present on `existing`,
  // or unrelated fields would spuriously show up as "changed" every time
  // (existing[key] would be `undefined` rather than the real stored
  // value). Same canonical-read convention as assertProjectInOrg /
  // assertTaskInOrg in project.service.ts / task.service.ts.
  const milestone = await milestonesRepository.getMilestoneForMutation(organizationId, milestoneId);
  if (!milestone) {
    // Same "never confirm which" behavior as projects/tasks: identical
    // message whether the milestone doesn't exist or belongs to another org.
    throw new NotFoundError('Milestone not found.');
  }
  return milestone as unknown as MilestoneRow;
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
  const isMember = await organizationsRepository.verifyOrganisationMember(organizationId, ownerId);
  if (!isMember) {
    throw new BusinessRuleError('The selected owner is not a member of this organization.', 'OWNER_NOT_IN_ORG');
  }
}

/** camelCase input keys -> snake_case DB columns. `founder_required` is
 * never taken from raw input — always derived from `attentionMode`, same
 * rule as projects.founder_attention_required / tasks.founder_required.
 * `completed_at` is never set here at all — completeMilestone/
 * reopenMilestone own it exclusively.
 *
 * `progress_percent` is only ever included when the EFFECTIVE progress
 * mode (the incoming value if present, else the milestone's current
 * stored mode) is 'manual' — this is what makes "direct client mutation
 * of calculated automatic progress is rejected/ignored" true: a client
 * submitting progressPercent while the milestone is (or remains)
 * automatic simply has that value silently dropped, never written.
 */
function mapInputToPatch(input: Partial<CreateMilestoneInput | UpdateMilestoneInput>, effectiveProgressMode: 'automatic' | 'manual'): TablesUpdate<'milestones'> {
  const patch: TablesUpdate<'milestones'> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.successCriteria !== undefined) patch.success_criteria = input.successCriteria ?? null;
  if (input.ownerId !== undefined) patch.owner_id = input.ownerId ?? null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.health !== undefined) patch.health = input.health;
  if (input.healthNote !== undefined) patch.health_note = input.healthNote ?? null;
  if (input.attentionMode !== undefined) {
    patch.attention_mode = input.attentionMode;
    patch.founder_required = attentionModeRequiresFounder(input.attentionMode);
  }
  if (input.progressMode !== undefined) patch.progress_mode = input.progressMode;
  if (effectiveProgressMode === 'manual' && input.progressPercent !== undefined) {
    patch.progress_percent = input.progressPercent;
  }
  if (input.targetValue !== undefined) patch.target_value = input.targetValue ?? null;
  if (input.currentValue !== undefined) patch.current_value = input.currentValue ?? null;
  if (input.startDate !== undefined) patch.start_date = input.startDate ?? null;
  if (input.dueDate !== undefined) patch.due_date = input.dueDate ?? null;
  if (input.nextReviewAt !== undefined) patch.next_review_at = input.nextReviewAt ?? null;
  if (input.blockedReason !== undefined) patch.blocked_reason = input.blockedReason ?? null;
  if (input.waitingOn !== undefined) patch.waiting_on = input.waitingOn ?? null;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  return patch;
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  success_criteria: 'Success criteria',
  owner_id: 'Executive owner',
  status: 'Status',
  priority: 'Priority',
  health: 'Health',
  health_note: 'Health note',
  attention_mode: 'Attention mode',
  founder_required: 'Founder required',
  progress_mode: 'Progress mode',
  progress_percent: 'Progress',
  target_value: 'Target value',
  current_value: 'Current value',
  start_date: 'Start date',
  due_date: 'Due date',
  next_review_at: 'Next review',
  blocked_reason: 'Blocked reason',
  waiting_on: 'Waiting on',
  sort_order: 'Order',
};

function describeChange(changedFields: string[], previousValues: Record<string, unknown>, newValues: Record<string, unknown>, milestoneTitle: string): string {
  if (changedFields.length === 1) {
    const field = changedFields[0]!;
    if (field === 'status') {
      const from = MILESTONE_STATUS_META[previousValues.status as MilestoneStatus]?.label ?? previousValues.status;
      const to = MILESTONE_STATUS_META[newValues.status as MilestoneStatus]?.label ?? newValues.status;
      return `Milestone moved from ${from} to ${to}`;
    }
    if (field === 'owner_id') return 'Executive Owner changed';
    if (field === 'due_date') return 'Due date changed';
    if (field === 'title') return `Milestone renamed to ${newValues.title}`;
    if (field === 'progress_mode') {
      const to = newValues.progress_mode === 'manual' ? 'Manual' : 'Automatic';
      const from = previousValues.progress_mode === 'manual' ? 'Manual' : 'Automatic';
      return `Progress mode changed from ${from} to ${to}`;
    }
    if (field === 'progress_percent') return `Progress changed from ${previousValues.progress_percent}% to ${newValues.progress_percent}%`;
    if (field === 'health') return 'Health changed';
    if (field === 'attention_mode') return 'Attention mode changed';
    if (field === 'blocked_reason') return 'Blocker updated';
    if (field === 'waiting_on') return 'Waiting-on updated';
    return `${FIELD_LABELS[field] ?? field} updated`;
  }
  return `${milestoneTitle}: ${changedFields.length} fields updated`;
}

async function recordMilestoneActivity(params: {
  organizationId: string;
  actorId: string;
  milestoneId: string;
  eventType: string;
  title: string;
  metadata: Record<string, unknown>;
}) {
  await activityRepository.record({
    organization_id: params.organizationId,
    actor_id: params.actorId,
    event_type: params.eventType,
    entity_type: 'milestone',
    entity_id: params.milestoneId,
    title: params.title,
    metadata: { milestone_id: params.milestoneId, performed_by_user_id: params.actorId, ...params.metadata } as Json,
  });
}

export const milestoneService = {
  async createMilestone(organizationId: string, actorId: string, rawInput: CreateMilestoneInput) {
    const input = createMilestoneSchema.parse(rawInput);
    await assertProjectInOrg(organizationId, input.projectId);
    await assertOwnerInOrg(organizationId, input.ownerId);

    const founderRequired = attentionModeRequiresFounder(input.attentionMode);
    // Automatic milestones always start at 0 — there are no tasks yet to
    // derive a percentage from. A manual milestone honours whatever the
    // creator explicitly entered (schema requires it when mode is manual).
    const progressPercent = input.progressMode === 'manual' ? input.progressPercent ?? 0 : 0;

    const counts = await milestonesRepository.countMilestonesByProject(organizationId, input.projectId);

    const insert: TablesInsert<'milestones'> = {
      organization_id: organizationId,
      created_by: actorId,
      project_id: input.projectId,
      title: input.title,
      description: input.description ?? null,
      success_criteria: input.successCriteria ?? null,
      owner_id: input.ownerId ?? null,
      status: input.status,
      priority: input.priority,
      health: input.health,
      health_note: input.healthNote ?? null,
      attention_mode: input.attentionMode,
      founder_required: founderRequired,
      progress_mode: input.progressMode,
      progress_percent: progressPercent,
      target_value: input.targetValue ?? null,
      current_value: input.currentValue ?? null,
      start_date: input.startDate ?? null,
      due_date: input.dueDate ?? null,
      next_review_at: input.nextReviewAt ?? null,
      blocked_reason: input.status === 'blocked' ? (input.blockedReason ?? null) : null,
      waiting_on: input.status === 'waiting' ? (input.waitingOn ?? null) : null,
      sort_order: input.sortOrder ?? counts.total,
      last_activity_at: new Date().toISOString(),
    };

    const milestone = await milestonesRepository.create(insert);

    await recordMilestoneActivity({
      organizationId,
      actorId,
      milestoneId: milestone.id,
      eventType: 'milestone.created',
      title: `Milestone created: ${milestone.title}`,
      metadata: { project_id: milestone.project_id, action: 'created' },
    });

    return milestone;
  },

  async updateMilestone(organizationId: string, actorId: string, milestoneId: string, rawInput: UpdateMilestoneInput) {
    const existing = await assertMilestoneInOrg(organizationId, milestoneId);
    const input = updateMilestoneSchema.parse(rawInput);

    if (input.projectId !== undefined && input.projectId !== existing.project_id) {
      // Moving a milestone to a different project is out of scope for this
      // slice's generic edit form — reject rather than silently allow a
      // project reassignment with unclear task/roll-up implications.
      throw new BusinessRuleError('A milestone cannot be moved to a different project from this form.', 'PROJECT_CHANGE_NOT_ALLOWED');
    }
    if (input.ownerId !== undefined) await assertOwnerInOrg(organizationId, input.ownerId);

    if (input.status !== undefined && input.status !== existing.status) {
      if (input.status === 'completed') {
        throw new BusinessRuleError('Use completeMilestone to mark a milestone complete — this sets completed_at server-side.', 'USE_COMPLETE_MILESTONE');
      }
      if (existing.status === 'completed' || existing.status === 'cancelled') {
        throw new BusinessRuleError('Use reopenMilestone to move a completed or cancelled milestone to a different status.', 'USE_REOPEN_MILESTONE');
      }
      if (!isValidMilestoneStatusTransition(existing.status as MilestoneStatus, input.status)) {
        throw new BusinessRuleError(`Cannot move a milestone from ${existing.status} to ${input.status}.`, 'INVALID_TRANSITION');
      }
    }

    const effectiveProgressMode = (input.progressMode ?? existing.progress_mode) as 'automatic' | 'manual';
    const requestedPatch = mapInputToPatch(input, effectiveProgressMode);

    if (input.status !== undefined) {
      requestedPatch.blocked_reason = input.status === 'blocked' ? (input.blockedReason ?? existing.blocked_reason ?? null) : null;
      requestedPatch.waiting_on = input.status === 'waiting' ? (input.waitingOn ?? existing.waiting_on ?? null) : null;
    }

    const { changedFields, previousValues, newValues, finalPatch } = diffPatch(existing as unknown as Record<string, unknown>, requestedPatch as Record<string, unknown>);

    if (changedFields.length === 0) {
      // No-op submission — return the existing row, write nothing, log
      // nothing, don't bump last_activity_at.
      return existing;
    }

    (finalPatch as Record<string, unknown>).last_activity_at = new Date().toISOString();
    const updated = await milestonesRepository.update(organizationId, milestoneId, finalPatch as TablesUpdate<'milestones'>);

    await recordMilestoneActivity({
      organizationId,
      actorId,
      milestoneId,
      eventType: 'milestone.updated',
      title: describeChange(changedFields, previousValues, newValues, existing.title),
      metadata: {
        project_id: existing.project_id,
        action: 'updated',
        changed_fields: changedFields,
        previous_values: previousValues,
        new_values: newValues,
      },
    });

    // Switching into automatic mode needs an immediate recalculation from
    // current tasks — otherwise progress_percent would be stale until the
    // next task mutation happens to touch this milestone.
    if (changedFields.includes('progress_mode') && finalPatch.progress_mode === 'automatic') {
      await this.recalculateMilestoneProgress(organizationId, actorId, milestoneId, 'mode_switch');
    }

    if (changedFields.includes('progress_percent') || changedFields.includes('status')) {
      await this.recalculateProjectProgressFromMilestones(organizationId, actorId, existing.project_id);
    }

    return updated;
  },

  async updateMilestoneStatus(organizationId: string, actorId: string, rawInput: UpdateMilestoneStatusInput) {
    const input = updateMilestoneStatusSchema.parse(rawInput);
    const existing = await assertMilestoneInOrg(organizationId, input.milestoneId);

    if (existing.status === input.status) return existing;
    if (input.status === 'completed') {
      throw new BusinessRuleError('Use completeMilestone to mark a milestone complete — this sets completed_at server-side.', 'USE_COMPLETE_MILESTONE');
    }
    if (existing.status === 'completed' || existing.status === 'cancelled') {
      throw new BusinessRuleError('Use reopenMilestone to move a completed or cancelled milestone to a different status.', 'USE_REOPEN_MILESTONE');
    }
    if (!isValidMilestoneStatusTransition(existing.status as MilestoneStatus, input.status)) {
      throw new BusinessRuleError(`Cannot move a milestone from ${existing.status} to ${input.status}.`, 'INVALID_TRANSITION');
    }

    const patch: TablesUpdate<'milestones'> = {
      status: input.status,
      last_activity_at: new Date().toISOString(),
      blocked_reason: input.status === 'blocked' ? (input.blockedReason ?? null) : null,
      waiting_on: input.status === 'waiting' ? (input.waitingOn ?? null) : null,
    };

    const updated = await milestonesRepository.update(organizationId, input.milestoneId, patch);

    const fromLabel = MILESTONE_STATUS_META[existing.status as MilestoneStatus]?.label ?? existing.status;
    const toLabel = MILESTONE_STATUS_META[input.status]?.label ?? input.status;
    const eventType =
      input.status === 'blocked' ? 'milestone.blocked'
      : existing.status === 'blocked' ? 'milestone.unblocked'
      : input.status === 'waiting' ? 'milestone.waiting'
      : input.status === 'missed' ? 'milestone.missed'
      : 'milestone.status_changed';

    await recordMilestoneActivity({
      organizationId,
      actorId,
      milestoneId: input.milestoneId,
      eventType,
      title: `Milestone moved from ${fromLabel} to ${toLabel}`,
      metadata: {
        project_id: existing.project_id,
        action: 'status_changed',
        changed_fields: ['status'],
        previous_values: { status: existing.status },
        new_values: { status: input.status },
        reason: input.reason ?? null,
      },
    });

    if (input.status === 'missed' || input.status === 'cancelled') {
      await this.recalculateProjectProgressFromMilestones(organizationId, actorId, existing.project_id);
    }

    return updated;
  },

  /** The only path that ever sets completed_at. Forces progress to 100%
   * regardless of task state or progress_mode — a founder can declare a
   * milestone done even with open tasks left (matches Tasks' identical
   * completeTask design: business reality can outrun task hygiene). */
  async completeMilestone(organizationId: string, actorId: string, rawInput: CompleteMilestoneInput) {
    const input = completeMilestoneSchema.parse(rawInput);
    const existing = await assertMilestoneInOrg(organizationId, input.milestoneId);

    if (existing.status === 'completed') return existing;

    const completedAt = new Date().toISOString();
    const patch: TablesUpdate<'milestones'> = {
      status: 'completed',
      completed_at: completedAt,
      progress_percent: 100,
      last_activity_at: completedAt,
    };

    const updated = await milestonesRepository.update(organizationId, input.milestoneId, patch);

    await recordMilestoneActivity({
      organizationId,
      actorId,
      milestoneId: input.milestoneId,
      eventType: 'milestone.completed',
      title: `Milestone completed: ${existing.title}`,
      metadata: {
        project_id: existing.project_id,
        action: 'completed',
        previous_status: existing.status,
        completed_at: completedAt,
        reason: input.reason ?? null,
      },
    });

    await this.recalculateProjectProgressFromMilestones(organizationId, actorId, existing.project_id);

    return updated;
  },

  /** Clears completed_at and returns the milestone to a real working
   * status. Always recalculates progress afterward (for automatic-mode
   * milestones; manual-mode milestones keep whatever value they held). */
  async reopenMilestone(organizationId: string, actorId: string, rawInput: ReopenMilestoneInput) {
    const input = reopenMilestoneSchema.parse(rawInput);
    const existing = await assertMilestoneInOrg(organizationId, input.milestoneId);

    if (existing.status !== 'completed' && existing.status !== 'cancelled') {
      throw new BusinessRuleError('Only a completed or cancelled milestone can be reopened.', 'NOT_REOPENABLE');
    }

    const patch: TablesUpdate<'milestones'> = {
      status: input.targetStatus,
      completed_at: null,
      last_activity_at: new Date().toISOString(),
    };

    const updated = await milestonesRepository.update(organizationId, input.milestoneId, patch);

    await recordMilestoneActivity({
      organizationId,
      actorId,
      milestoneId: input.milestoneId,
      eventType: 'milestone.reopened',
      title: `Milestone reopened: ${existing.title}`,
      metadata: {
        project_id: existing.project_id,
        action: 'reopened',
        previous_status: existing.status,
        new_status: input.targetStatus,
        reason: input.reason ?? null,
      },
    });

    await this.recalculateMilestoneProgress(organizationId, actorId, input.milestoneId, 'reopen');
    await this.recalculateProjectProgressFromMilestones(organizationId, actorId, existing.project_id);

    return updated;
  },

  async cancelMilestone(organizationId: string, actorId: string, rawInput: CancelMilestoneInput) {
    const input = cancelMilestoneSchema.parse(rawInput);
    const existing = await assertMilestoneInOrg(organizationId, input.milestoneId);

    if (existing.status === 'cancelled') return existing;

    const patch: TablesUpdate<'milestones'> = { status: 'cancelled', last_activity_at: new Date().toISOString() };
    const updated = await milestonesRepository.update(organizationId, input.milestoneId, patch);

    await recordMilestoneActivity({
      organizationId,
      actorId,
      milestoneId: input.milestoneId,
      eventType: 'milestone.cancelled',
      title: `Milestone cancelled: ${existing.title}`,
      metadata: {
        project_id: existing.project_id,
        action: 'cancelled',
        previous_status: existing.status,
        reason: input.reason ?? null,
      },
    });

    // Cancelled milestones drop out of the project roll-up entirely.
    await this.recalculateProjectProgressFromMilestones(organizationId, actorId, existing.project_id);

    return updated;
  },

  /**
   * Reorders every milestone in a project to match `orderedMilestoneIds`.
   * IMPORTANT — transaction honesty: the Supabase JS client used here has
   * no multi-row transactional update primitive, so this issues one update
   * per milestone sequentially (see
   * milestonesRepository.reorderProjectMilestones). If a later write fails
   * partway through, earlier writes in this same call are NOT rolled back.
   * This is a known, documented limitation of the current architecture —
   * not a claimed atomic guarantee.
   */
  async reorderMilestones(organizationId: string, actorId: string, rawInput: ReorderMilestonesInput) {
    const input = reorderMilestonesSchema.parse(rawInput);
    await assertProjectInOrg(organizationId, input.projectId);

    const existingMilestones = await milestonesRepository.listByProject(organizationId, input.projectId);
    const validIds = new Set(existingMilestones.map((m) => m.id));
    for (const id of input.orderedMilestoneIds) {
      if (!validIds.has(id)) {
        throw new BusinessRuleError('One of the selected milestones does not belong to this project.', 'MILESTONE_NOT_IN_PROJECT');
      }
    }

    const updated = await milestonesRepository.reorderProjectMilestones(organizationId, input.projectId, input.orderedMilestoneIds);

    // Logged once per reorder action against the project (not one event per
    // milestone) — a single "milestones reordered" record is what's
    // meaningful to a reader of the activity trail, not N near-duplicate
    // per-row entries. entity_type is 'project' here deliberately, since
    // the action's true subject is "this project's milestone ordering",
    // not any single milestone.
    await activityRepository.record({
      organization_id: organizationId,
      actor_id: actorId,
      event_type: 'milestone.reordered',
      entity_type: 'project',
      entity_id: input.projectId,
      title: 'Milestones reordered',
      metadata: {
        project_id: input.projectId,
        action: 'reordered',
        ordered_milestone_ids: input.orderedMilestoneIds,
        performed_by_user_id: actorId,
      } as Json,
    });

    return updated;
  },

  /**
   * Recalculates progress_percent for one milestone from its eligible
   * tasks. Never touches manual-mode milestones. No-op detection means a
   * repeated identical calculation writes nothing and logs nothing — this
   * is what keeps automatic task-driven recalculation from flooding
   * activity history (spec requirement: only record when the rounded
   * value actually changes).
   */
  async recalculateMilestoneProgress(organizationId: string, actorId: string, milestoneId: string, source: string = 'task_rollup') {
    const existing = await assertMilestoneInOrg(organizationId, milestoneId);

    if (existing.progress_mode === 'manual') {
      return existing;
    }

    const { totalEligibleTasks, completedEligibleTasks } = await milestonesRepository.getTaskCompletionRollup(organizationId, milestoneId);
    const newProgress = calculateMilestoneTaskProgress({
      totalEligibleTasks,
      completedEligibleTasks,
      milestoneStatus: existing.status as MilestoneStatus,
    });

    if (newProgress === existing.progress_percent) {
      return existing;
    }

    const updated = await milestonesRepository.updateMilestoneProgress(organizationId, milestoneId, newProgress);

    await recordMilestoneActivity({
      organizationId,
      actorId,
      milestoneId,
      eventType: 'milestone.progress_recalculated',
      title: `Progress recalculated from ${existing.progress_percent}% to ${newProgress}%`,
      metadata: {
        project_id: existing.project_id,
        action: 'progress_recalculated',
        previous_values: { progress_percent: existing.progress_percent },
        new_values: { progress_percent: newProgress },
        source,
        calculation_source: 'task_rollup',
      },
    });

    await this.recalculateProjectProgressFromMilestones(organizationId, actorId, existing.project_id);

    return updated;
  },

  /**
   * Recalculates a single project's progress_percent from its
   * non-cancelled milestones (equal weighting — see
   * calculateProjectMilestoneProgress in lib/progress.ts). Never touches a
   * project in 'manual' progress mode. Only recalculates the ONE project
   * passed in — deliberately not a global sweep, per the spec's explicit
   * "do not recalculate every project globally after every task mutation."
   */
  async recalculateProjectProgressFromMilestones(organizationId: string, actorId: string, projectId: string) {
    const project = await projectsRepository.getById(organizationId, projectId);
    if (!project || project.progress_mode !== 'milestones') {
      return;
    }

    const milestones = await milestonesRepository.listByProject(organizationId, projectId);
    const newProgress = calculateProjectMilestoneProgress({
      milestones: milestones.map((m) => ({ progressPercent: m.progress_percent, status: m.status })),
    });

    if (newProgress === project.progress_percent) {
      return;
    }

    await projectsRepository.update(organizationId, projectId, {
      progress_percent: newProgress,
      last_activity_at: new Date().toISOString(),
    });

    await activityRepository.record({
      organization_id: organizationId,
      actor_id: actorId,
      event_type: 'project.progress_recalculated',
      entity_type: 'project',
      entity_id: projectId,
      title: `Progress changed from ${project.progress_percent}% to ${newProgress}%`,
      metadata: {
        project_id: projectId,
        action: 'progress_recalculated',
        previous_values: { progress_percent: project.progress_percent },
        new_values: { progress_percent: newProgress },
        calculation_source: 'milestone_rollup',
        performed_by_user_id: actorId,
      } as Json,
    });
  },
};
