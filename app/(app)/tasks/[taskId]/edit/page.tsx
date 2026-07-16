import { notFound } from 'next/navigation';
import { getCurrentOrg } from '@/lib/auth/session';
import { tasksRepository } from '@/repositories/tasks.repository';
import { projectsRepository } from '@/repositories/projects.repository';
import { organizationsRepository } from '@/repositories/organizations.repository';
import { milestonesRepository } from '@/repositories/milestones.repository';
import { TaskForm, type TaskFormValues } from '@/features/tasks/components/task-form';
import { updateTaskAction } from '@/features/tasks/actions';

interface EditTaskPageProps {
  params: Promise<{ taskId: string }>;
}

export default async function EditTaskPage({ params }: EditTaskPageProps) {
  const { taskId } = await params;
  const org = await getCurrentOrg();

  const [task, projectRows, memberRows] = await Promise.all([
    tasksRepository.getTaskById(org.organizationId, taskId),
    projectsRepository.listSelectable(org.organizationId),
    organizationsRepository.listMembers(org.organizationId),
  ]);

  // verifyTaskAccess/RLS both scope by organization_id — a task belonging
  // to another org (or that doesn't exist) simply isn't returned here.
  if (!task) notFound();

  const milestonesByProject = await milestonesRepository.listForProjects(org.organizationId, projectRows.map((p) => p.id));
  const projects = projectRows.map((p) => ({ id: p.id, name: p.name, milestones: milestonesByProject.get(p.id) ?? [] }));
  const members = memberRows.map((m) => ({
    id: m.user_id,
    full_name: Array.isArray(m.profiles) ? m.profiles[0]?.full_name ?? null : (m.profiles as { full_name: string | null } | null)?.full_name ?? null,
  }));

  const initialValues: TaskFormValues = {
    title: task.title,
    projectId: task.project_id,
    description: task.notes,
    ownerId: task.assignee_id,
    milestoneId: task.milestone_id,
    status: task.status,
    priority: task.priority,
    attentionMode: task.attention_mode,
    dueAt: task.due_at,
    startAt: task.start_at,
    estimatedMinutes: task.estimated_minutes,
    actualMinutes: task.actual_minutes,
    blockedReason: task.blocked_reason,
    waitingOn: task.waiting_on,
    nextAction: task.next_action,
    sourceType: task.source_type,
    sourceReference: task.source_reference,
  };

  const boundAction = updateTaskAction.bind(null, taskId);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Edit Task</h1>
        <p className="text-sm text-muted-foreground">{task.title}</p>
      </div>
      <TaskForm action={boundAction} initialValues={initialValues} members={members} projects={projects} submitLabel="Save Changes" />
    </div>
  );
}
