import { projectsRepository } from '@/repositories/projects.repository';
import { organizationsRepository } from '@/repositories/organizations.repository';
import { activityRepository } from '@/repositories/activity.repository';
import { projectDependenciesRepository } from '@/repositories/project-dependencies.repository';
import { NotFoundError, BusinessRuleError } from '@/lib/errors';
import { diffPatch as sharedDiffPatch } from '@/lib/diff-patch';
import { FOCUS_LEVEL_META, PROJECT_STATUS_META, HEALTH_META, attentionModeRequiresFounder } from '@/features/projects/constants';
import {
  createProjectSchema,
  updateProjectSchema,
  updateProjectStatusSchema,
  updateProjectFocusLevelSchema,
  archiveOrParkProjectSchema,
  createProjectDependencySchema,
  removeProjectDependencySchema,
  MAX_CRITICAL_PROJECTS,
  type CreateProjectInput,
  type UpdateProjectInput,
  type UpdateProjectStatusInput,
  type UpdateProjectFocusLevelInput,
  type ArchiveOrParkProjectInput,
  type CreateProjectDependencyInput,
  type RemoveProjectDependencyInput,
} from '@/schemas/project.schema';
import type { Tables, TablesInsert, TablesUpdate, Json } from '@/types/database.types';

type ProjectRow = Tables<'projects'>;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

async function generateUniqueSlug(organizationId: string, name: string, excludeProjectId?: string): Promise<string> {
  const base = slugify(name) || 'project';
  let candidate = base;
  let suffix = 2;
  while (await projectsRepository.slugExists(organizationId, candidate, excludeProjectId)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function assertProjectInOrg(organizationId: string, projectId: string): Promise<ProjectRow> {
  const project = await projectsRepository.verifyProjectAccess(organizationId, projectId);
  if (!project) {
    // Deliberately identical message whether the project doesn't exist at
    // all or belongs to a different org — never confirm which.
    throw new NotFoundError('Project not found.');
  }
  return project as ProjectRow;
}

async function assertOwnerInOrg(organizationId: string, ownerId: string | undefined) {
  if (!ownerId) return;
  const isMember = await organizationsRepository.verifyOrganisationMember(organizationId, ownerId);
  if (!isMember) {
    throw new BusinessRuleError('The selected owner is not a member of this organization.', 'OWNER_NOT_IN_ORG');
  }
}

/** camelCase input keys -> snake_case DB columns, only for the fields this service writes.
 * `founder_attention_required` is deliberately never taken from raw input — it is always
 * derived from `attentionMode` below, so the two columns can't drift apart (see
 * ATTENTION_MODE_META / attentionModeRequiresFounder in features/projects/constants.ts). */
function mapInputToPatch(input: Partial<CreateProjectInput | UpdateProjectInput>): TablesUpdate<'projects'> {
  const patch: TablesUpdate<'projects'> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.category !== undefined) patch.category = input.category;
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.ownerId !== undefined) patch.owner_id = input.ownerId ?? null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.focusLevel !== undefined) patch.focus_level = input.focusLevel;
  if (input.desiredOutcome !== undefined) patch.desired_outcome = input.desiredOutcome;
  if (input.successMetric !== undefined) patch.success_metric = input.successMetric ?? null;
  if (input.targetValue !== undefined) patch.target_value = input.targetValue ?? null;
  if (input.currentValue !== undefined) patch.current_value = input.currentValue ?? null;
  if (input.startDate !== undefined) patch.start_date = input.startDate ?? null;
  if (input.targetDate !== undefined) patch.target_date = input.targetDate ?? null;
  if (input.nextReviewAt !== undefined) patch.next_review_at = input.nextReviewAt ?? null;
  if (input.reviewCadence !== undefined) patch.review_cadence = input.reviewCadence;
  if (input.blockedReason !== undefined) patch.blocked_reason = input.blockedReason ?? null;
  if (input.waitingOn !== undefined) patch.waiting_on = input.waitingOn ?? null;
  if (input.attentionMode !== undefined) {
    patch.attention_mode = input.attentionMode;
    patch.founder_attention_required = attentionModeRequiresFounder(input.attentionMode);
  }
  if (input.priorityLevel !== undefined) patch.priority_level = input.priorityLevel;
  if (input.priorityScore !== undefined) patch.priority_score = input.priorityScore;
  if (input.health !== undefined) patch.health = input.health;
  if (input.healthNote !== undefined) patch.health_note = input.healthNote ?? null;
  if (input.businessImpact !== undefined) patch.business_impact = input.businessImpact;
  if (input.progressPercent !== undefined) patch.progress_percent = input.progressPercent;
  return patch;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  category: 'Category',
  description: 'Executive notes',
  owner_id: 'Executive owner',
  status: 'Status',
  focus_level: 'Focus level',
  desired_outcome: 'Desired outcome',
  success_metric: 'Success metric',
  target_value: 'Target value',
  current_value: 'Current value',
  start_date: 'Start date',
  target_date: 'Target date',
  next_review_at: 'Next review',
  review_cadence: 'Review cadence',
  blocked_reason: 'Blocked reason',
  waiting_on: 'Waiting on',
  founder_attention_required: 'Founder attention required',
  attention_mode: 'Attention mode',
  priority_level: 'Priority',
  priority_score: 'Priority score',
  health: 'Health',
  health_note: 'Health note',
  business_impact: 'Business impact',
  progress_percent: 'Progress',
};

/** Computes only the fields that actually changed — this is what makes
 * no-op submissions a no-op (empty diff) instead of a hollow activity
 * entry, and what lets activity metadata carry real before/after values.
 * Shared with services/task.service.ts via lib/diff-patch.ts rather than
 * reimplemented per entity. */
function diffPatch(existing: ProjectRow, patch: TablesUpdate<'projects'>) {
  return sharedDiffPatch(existing as Record<string, unknown>, patch as Record<string, unknown>) as {
    changedFields: string[];
    previousValues: Record<string, unknown>;
    newValues: Record<string, unknown>;
    finalPatch: TablesUpdate<'projects'>;
  };
}

function describeChange(changedFields: string[], previousValues: Record<string, unknown>, newValues: Record<string, unknown>, projectName: string): string {
  if (changedFields.length === 1) {
    const field = changedFields[0]!;
    if (field === 'status') {
      const from = PROJECT_STATUS_META[previousValues.status as keyof typeof PROJECT_STATUS_META]?.label ?? previousValues.status;
      const to = PROJECT_STATUS_META[newValues.status as keyof typeof PROJECT_STATUS_META]?.label ?? newValues.status;
      return `Status changed from ${from} to ${to}`;
    }
    if (field === 'focus_level') {
      const from = FOCUS_LEVEL_META[previousValues.focus_level as 1 | 2 | 3 | 4 | 5]?.label ?? previousValues.focus_level;
      const to = FOCUS_LEVEL_META[newValues.focus_level as 1 | 2 | 3 | 4 | 5]?.label ?? newValues.focus_level;
      return `Focus level changed from ${from} to ${to}`;
    }
    if (field === 'owner_id') return 'Executive Owner changed';
    if (field === 'target_date') return 'Target date changed';
    if (field === 'name') return `Project renamed to ${newValues.name}`;
    if (field === 'founder_attention_required' && newValues.founder_attention_required) return 'Founder attention enabled';
    if (field === 'blocked_reason') return 'Blocker updated';
    if (field === 'health') {
      const from = HEALTH_META[previousValues.health as keyof typeof HEALTH_META]?.label ?? previousValues.health;
      const to = HEALTH_META[newValues.health as keyof typeof HEALTH_META]?.label ?? newValues.health;
      return `Health changed from ${from} to ${to}`;
    }
    if (field === 'priority_level') return `Priority changed to ${newValues.priority_level}`;
    if (field === 'progress_percent') return `Progress changed from ${previousValues.progress_percent}% to ${newValues.progress_percent}%`;
    if (field === 'review_cadence') return 'Review cadence changed';
    if (field === 'attention_mode') return `Attention mode changed to ${newValues.attention_mode}`;
    if (field === 'business_impact') return 'Business impact updated';
    return `${FIELD_LABELS[field] ?? field} updated`;
  }
  return `${projectName}: ${changedFields.length} fields updated`;
}

export const projectService = {
  async createProject(organizationId: string, actorId: string, rawInput: CreateProjectInput) {
    const input = createProjectSchema.parse(rawInput);
    await assertOwnerInOrg(organizationId, input.ownerId);

    const slug = await generateUniqueSlug(organizationId, input.name);
    const insert: TablesInsert<'projects'> = {
      organization_id: organizationId,
      created_by: actorId,
      owner_id: input.ownerId ?? actorId,
      slug,
      last_activity_at: new Date().toISOString(),
      ...mapInputToPatch(input),
      // Explicit override after the spread: mapInputToPatch's parameter
      // type is shared with the (all-optional) update path, so TS can't
      // see that `name` and `desiredOutcome` are guaranteed here — they
      // are, because createProjectSchema requires both.
      name: input.name,
      desired_outcome: input.desiredOutcome,
    };

    const project = await projectsRepository.create(insert);

    await activityRepository.record({
      organization_id: organizationId,
      actor_id: actorId,
      event_type: 'project.created',
      entity_type: 'project',
      entity_id: project.id,
      title: `Project created: ${project.name}`,
      metadata: { project_id: project.id, action: 'created' },
    });

    return project;
  },

  async updateProject(organizationId: string, actorId: string, projectId: string, rawInput: UpdateProjectInput) {
    const existing = await assertProjectInOrg(organizationId, projectId);
    const input = updateProjectSchema.parse(rawInput);
    await assertOwnerInOrg(organizationId, input.ownerId);

    const requestedPatch = mapInputToPatch(input);
    const { changedFields, previousValues, newValues, finalPatch } = diffPatch(existing, requestedPatch);

    if (changedFields.length === 0) {
      // No-op submission — return the existing row, write nothing.
      return existing;
    }

    (finalPatch as Record<string, unknown>).last_activity_at = new Date().toISOString();

    const updated = await projectsRepository.update(organizationId, projectId, finalPatch);

    await activityRepository.record({
      organization_id: organizationId,
      actor_id: actorId,
      event_type: 'project.updated',
      entity_type: 'project',
      entity_id: projectId,
      title: describeChange(changedFields, previousValues, newValues, existing.name),
      metadata: {
        project_id: projectId,
        action: 'updated',
        changed_fields: changedFields,
        previous_values: previousValues,
        new_values: newValues,
        performed_by_user_id: actorId,
      } as Json,
    });

    return updated;
  },

  async updateProjectStatus(organizationId: string, actorId: string, rawInput: UpdateProjectStatusInput) {
    const input = updateProjectStatusSchema.parse(rawInput);
    const existing = await assertProjectInOrg(organizationId, input.projectId);

    if (existing.status === input.status) {
      return existing;
    }

    const patch: TablesUpdate<'projects'> = {
      status: input.status,
      last_activity_at: new Date().toISOString(),
      // Clear a stale blocker once the project leaves Blocked.
      blocked_reason: input.status === 'blocked' ? (input.blockedReason ?? null) : null,
    };

    const updated = await projectsRepository.update(organizationId, input.projectId, patch);

    const fromLabel = PROJECT_STATUS_META[existing.status as keyof typeof PROJECT_STATUS_META]?.label ?? existing.status;
    const toLabel = PROJECT_STATUS_META[input.status]?.label ?? input.status;

    await activityRepository.record({
      organization_id: organizationId,
      actor_id: actorId,
      event_type: 'project.status_changed',
      entity_type: 'project',
      entity_id: input.projectId,
      title: `Status changed from ${fromLabel} to ${toLabel}`,
      metadata: {
        project_id: input.projectId,
        action: 'status_changed',
        changed_fields: ['status'],
        previous_values: { status: existing.status },
        new_values: { status: input.status },
        reason: input.reason ?? null,
        performed_by_user_id: actorId,
      } as Json,
    });

    return updated;
  },

  async updateProjectFocusLevel(organizationId: string, actorId: string, rawInput: UpdateProjectFocusLevelInput) {
    const input = updateProjectFocusLevelSchema.parse(rawInput);
    const existing = await assertProjectInOrg(organizationId, input.projectId);

    if (existing.focus_level === input.focusLevel) {
      return existing;
    }

    if (input.focusLevel === 1) {
      const criticalCount = await projectsRepository.countCriticalProjects(organizationId, input.projectId);
      if (criticalCount >= MAX_CRITICAL_PROJECTS && !input.overrideCriticalLimit) {
        throw new BusinessRuleError(
          `You already have ${criticalCount} Critical projects. Confirm to add another.`,
          'CRITICAL_LIMIT_EXCEEDED',
        );
      }
    }

    const patch: TablesUpdate<'projects'> = {
      focus_level: input.focusLevel,
      last_activity_at: new Date().toISOString(),
    };

    const updated = await projectsRepository.update(organizationId, input.projectId, patch);

    const fromLabel = FOCUS_LEVEL_META[existing.focus_level as 1 | 2 | 3 | 4 | 5]?.label ?? existing.focus_level;
    const toLabel = FOCUS_LEVEL_META[input.focusLevel].label;

    await activityRepository.record({
      organization_id: organizationId,
      actor_id: actorId,
      event_type: 'project.focus_level_changed',
      entity_type: 'project',
      entity_id: input.projectId,
      title: `Focus level changed from ${fromLabel} to ${toLabel}`,
      metadata: {
        project_id: input.projectId,
        action: 'focus_level_changed',
        changed_fields: ['focus_level'],
        previous_values: { focus_level: existing.focus_level },
        new_values: { focus_level: input.focusLevel },
        reason: input.reason ?? null,
        override_applied: input.overrideCriticalLimit || undefined,
        override_reason: input.overrideCriticalLimit ? input.overrideReason ?? null : undefined,
        performed_by_user_id: actorId,
      } as Json,
    });

    return updated;
  },

  async archiveOrParkProject(organizationId: string, actorId: string, rawInput: ArchiveOrParkProjectInput) {
    const input = archiveOrParkProjectSchema.parse(rawInput);
    const existing = await assertProjectInOrg(organizationId, input.projectId);

    const patch: TablesUpdate<'projects'> =
      input.action === 'park'
        ? { status: 'parked', focus_level: 5, last_activity_at: new Date().toISOString() }
        : { archived_at: new Date().toISOString() };

    const updated = await projectsRepository.update(organizationId, input.projectId, patch);

    await activityRepository.record({
      organization_id: organizationId,
      actor_id: actorId,
      event_type: input.action === 'park' ? 'project.parked' : 'project.archived',
      entity_type: 'project',
      entity_id: input.projectId,
      title: input.action === 'park' ? `Project parked: ${existing.name}` : `Project archived: ${existing.name}`,
      metadata: {
        project_id: input.projectId,
        action: input.action,
        reason: input.reason ?? null,
        performed_by_user_id: actorId,
      } as Json,
    });

    return updated;
  },

  async addProjectDependency(organizationId: string, actorId: string, rawInput: CreateProjectDependencyInput) {
    const input = createProjectDependencySchema.parse(rawInput);

    // Both projects must exist and belong to this org — assertProjectInOrg
    // gives the same "not found or not yours" behavior as every other
    // mutation; a cross-org depends-on target fails here before it ever
    // reaches the DB trigger.
    const project = await assertProjectInOrg(organizationId, input.projectId);
    const dependsOn = await assertProjectInOrg(organizationId, input.dependsOnProjectId);

    const duplicate = await projectDependenciesRepository.exists(organizationId, input.projectId, input.dependsOnProjectId);
    if (duplicate) {
      throw new BusinessRuleError('This dependency already exists.', 'DUPLICATE_DEPENDENCY');
    }

    const dependency = await projectDependenciesRepository.create({
      organization_id: organizationId,
      project_id: input.projectId,
      depends_on_project_id: input.dependsOnProjectId,
      dependency_type: input.dependencyType,
      note: input.note ?? null,
      created_by: actorId,
    });

    await activityRepository.record({
      organization_id: organizationId,
      actor_id: actorId,
      event_type: 'project.dependency_added',
      entity_type: 'project',
      entity_id: input.projectId,
      title: `Dependency added: ${project.name} ${input.dependencyType.replace('_', ' ')} ${dependsOn.name}`,
      metadata: {
        project_id: input.projectId,
        action: 'dependency_added',
        depends_on_project_id: input.dependsOnProjectId,
        dependency_type: input.dependencyType,
        performed_by_user_id: actorId,
      } as Json,
    });

    return dependency;
  },

  async removeProjectDependency(organizationId: string, actorId: string, rawInput: RemoveProjectDependencyInput) {
    const input = removeProjectDependencySchema.parse(rawInput);
    const project = await assertProjectInOrg(organizationId, input.projectId);

    const removed = await projectDependenciesRepository.remove(organizationId, input.projectId, input.dependencyId);
    if (!removed) {
      throw new NotFoundError('Dependency not found.');
    }

    await activityRepository.record({
      organization_id: organizationId,
      actor_id: actorId,
      event_type: 'project.dependency_removed',
      entity_type: 'project',
      entity_id: input.projectId,
      title: `Dependency removed from ${project.name}`,
      metadata: {
        project_id: input.projectId,
        action: 'dependency_removed',
        dependency_id: input.dependencyId,
        performed_by_user_id: actorId,
      } as Json,
    });

    return removed;
  },
};
