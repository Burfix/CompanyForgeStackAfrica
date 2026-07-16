import Link from 'next/link';
import { Suspense } from 'react';
import { getCurrentOrg, requireUser } from '@/lib/auth/session';
import { tasksRepository } from '@/repositories/tasks.repository';
import { projectsRepository } from '@/repositories/projects.repository';
import { organizationsRepository } from '@/repositories/organizations.repository';
import { Button } from '@/components/ui/button';
import { TaskFilters } from '@/features/tasks/components/task-filters';
import { TaskCard } from '@/features/tasks/components/task-card';
import { buildTaskSections } from '@/features/tasks/grouping';
import type { TaskSortOption } from '@/features/tasks/constants';
import type { Enums } from '@/types/database.types';

interface TasksPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

const SECTIONS: { key: keyof ReturnType<typeof buildTaskSections>; title: string }[] = [
  { key: 'myFocus', title: 'My Focus' },
  { key: 'overdue', title: 'Overdue' },
  { key: 'dueToday', title: 'Due Today' },
  { key: 'founderRequired', title: 'Founder Required' },
  { key: 'inProgress', title: 'In Progress' },
  { key: 'blocked', title: 'Blocked' },
  { key: 'waiting', title: 'Waiting' },
  { key: 'inReview', title: 'In Review' },
  { key: 'upcoming', title: 'Upcoming' },
  { key: 'completed', title: 'Completed' },
];

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const user = await requireUser();
  const org = await getCurrentOrg();
  const params = await searchParams;

  const [tasks, projects, memberRows] = await Promise.all([
    tasksRepository.listTasks(org.organizationId, {
      search: params.q,
      projectId: params.project,
      ownerId: params.owner,
      status: params.status as Enums<'task_status'> | undefined,
      priority: params.priority as Enums<'task_priority'> | undefined,
      attentionMode: params.attention as Enums<'project_attention_mode'> | undefined,
      sort: (params.sort as TaskSortOption) ?? 'default',
    }),
    projectsRepository.listSelectable(org.organizationId),
    organizationsRepository.listMembers(org.organizationId),
  ]);

  const members = memberRows.map((m) => ({
    id: m.user_id,
    full_name: Array.isArray(m.profiles) ? m.profiles[0]?.full_name ?? null : (m.profiles as { full_name: string | null } | null)?.full_name ?? null,
  }));

  const sections = buildTaskSections(tasks as never, user.id);
  const hasAnyTasks = tasks.length > 0;
  const hasFilters = Object.values(params).some(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Tasks</h1>
          <p className="text-sm text-muted-foreground">{org.organizationName} — operational execution queue</p>
        </div>
        <Button asChild>
          <Link href="/tasks/new">New Task</Link>
        </Button>
      </div>

      <Suspense fallback={null}>
        <TaskFilters projects={projects} members={members} />
      </Suspense>

      {!hasAnyTasks ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {hasFilters ? 'No tasks match these filters.' : 'No tasks yet. Create the first task to turn a ForgeStack project into an execution plan.'}
          </p>
          {!hasFilters ? (
            <Button asChild className="mt-4">
              <Link href="/tasks/new">New Task</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {SECTIONS.map(({ key, title }) => {
            const items = sections[key];
            if (items.length === 0) return null;
            return (
              <div key={key} className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-foreground">{title} <span className="font-normal text-muted-foreground">({items.length})</span></h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {items.slice(0, key === 'completed' ? 10 : undefined).map((task) => (
                    <TaskCard key={task.id} task={task as never} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
