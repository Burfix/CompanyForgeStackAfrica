import { projectsRepository } from '@/repositories/projects.repository';
import { activityRepository } from '@/repositories/activity.repository';
import { createProjectSchema, type CreateProjectInput } from '@/schemas/project.schema';

/**
 * Business rules that span more than one table live here, not in
 * repositories or components. Creating a project always writes an
 * activity event as a side effect — the timeline is never a derived view,
 * it's populated explicitly at the point of mutation.
 */
export const projectService = {
  async createProject(organizationId: string, actorId: string, rawInput: CreateProjectInput) {
    const input = createProjectSchema.parse(rawInput);

    const project = await projectsRepository.create({
      organization_id: organizationId,
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? null,
      owner_id: input.ownerId ?? actorId,
      status: input.status,
      focus_level: input.focusLevel,
      target_outcome: input.targetOutcome ?? null,
      due_date: input.dueDate ?? null,
      created_by: actorId,
    });

    await activityRepository.record({
      organization_id: organizationId,
      actor_id: actorId,
      event_type: 'project.created',
      entity_type: 'project',
      entity_id: project.id,
      title: `Project created: ${project.name}`,
    });

    return project;
  },
};
