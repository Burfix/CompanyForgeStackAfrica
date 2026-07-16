import { getCurrentOrg } from '@/lib/auth/session';
import { projectsRepository } from '@/repositories/projects.repository';
import { organizationsRepository } from '@/repositories/organizations.repository';
import { milestonesRepository } from '@/repositories/milestones.repository';
import { TaskForm } from '@/features/tasks/components/task-form';
import { createTaskAction } from '@/features/tasks/actions';

interface NewTaskPageProps {
  searchParams: Promise<{ projectId?: string; returnTo?: string }>;
}

export default async function NewTaskPage({ searchParams }: NewTaskPageProps) {
  const org = await getCurrentOrg();
  const params = await searchParams;

  const [projectRows, memberRows] = await Promise.all([
    projectsRepository.listSelectable(org.organizationId),
    organizationsRepository.listMembers(org.organizationId),
  ]);

  const milestonesByProject = await milestonesRepository.listForProjects(
    org.organizationId,
    projectRows.map((p) => p.id),
  );

  const projects = projectRows.map((p) => ({ id: p.id, name: p.name, milestones: milestonesByProject.get(p.id) ?? [] }));
  const members = memberRows.map((m) => ({
    id: m.user_id,
    full_name: Array.isArray(m.profiles) ? m.profiles[0]?.full_name ?? null : (m.profiles as { full_name: string | null } | null)?.full_name ?? null,
  }));

  // Preselected from a project detail page's "New Task" button — locked so
  // a task created from a project can't accidentally be filed elsewhere.
  const lockProject = Boolean(params.projectId && projects.some((p) => p.id === params.projectId));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">New Task</h1>
        <p className="text-sm text-muted-foreground">{org.organizationName}</p>
      </div>
      <TaskForm
        action={createTaskAction}
        members={members}
        projects={projects}
        submitLabel="Create Task"
        initialValues={lockProject ? { projectId: params.projectId } : undefined}
        lockProject={lockProject}
        returnTo={params.returnTo}
      />
    </div>
  );
}
