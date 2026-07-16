import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { getCurrentOrg } from '@/lib/auth/session';
import { tasksRepository } from '@/repositories/tasks.repository';
import { activityRepository } from '@/repositories/activity.repository';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TaskStatusPill, PriorityBadge, DueStateBadge, AttentionModeBadge } from '@/components/shared/status-badge';
import { TaskActions } from '@/features/tasks/components/task-actions';

interface TaskDetailPageProps {
  params: Promise<{ taskId: string }>;
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value ?? '—'}</span>
    </div>
  );
}

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { taskId } = await params;
  const org = await getCurrentOrg();

  const task = await tasksRepository.getTaskById(org.organizationId, taskId);
  if (!task) notFound();

  const activity = await activityRepository.listForEntity(org.organizationId, 'task', taskId);

  const project = Array.isArray(task.project) ? task.project[0] : task.project;
  const milestone = Array.isArray(task.milestone) ? task.milestone[0] : task.milestone;
  const owner = Array.isArray(task.owner) ? task.owner[0] : task.owner;
  const creator = Array.isArray(task.creator) ? task.creator[0] : task.creator;

  const constraint = task.status === 'blocked' ? { label: 'Blocked reason', value: task.blocked_reason } : task.status === 'waiting' ? { label: 'Waiting on', value: task.waiting_on } : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{task.title}</h1>
            {project ? <p className="text-sm text-muted-foreground">{project.name}</p> : null}
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/tasks/${task.id}/edit`}>Edit</Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <TaskStatusPill status={task.status} />
          <PriorityBadge level={task.priority} />
          <DueStateBadge dueAt={task.due_at} status={task.status} />
          {task.attention_mode ? <AttentionModeBadge mode={task.attention_mode} /> : null}
          <span className="text-xs text-muted-foreground">Owner: {owner?.full_name ?? 'Unassigned'}</span>
        </div>

        <TaskActions taskId={task.id} currentStatus={task.status} currentPriority={task.priority} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Execution summary */}
          <Card>
            <CardHeader><CardTitle className="text-foreground">Execution Summary</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {task.notes ? <p className="text-sm text-foreground">{task.notes}</p> : null}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Fact label="Next action" value={task.next_action} />
                <Fact label="Estimated time" value={task.estimated_minutes ? `${task.estimated_minutes}m` : null} />
                <Fact label="Actual time" value={task.actual_minutes ? `${task.actual_minutes}m` : null} />
                <Fact label="Start date" value={task.start_at ? new Date(task.start_at).toLocaleString() : null} />
                <Fact label="Due date" value={task.due_at ? new Date(task.due_at).toLocaleString() : null} />
                <Fact label="Completed" value={task.completed_at ? new Date(task.completed_at).toLocaleString() : null} />
              </div>
            </CardContent>
          </Card>

          {/* Current constraint */}
          <Card>
            <CardHeader><CardTitle className="text-foreground">Current Constraint</CardTitle></CardHeader>
            <CardContent>
              {constraint ? (
                <Fact label={constraint.label} value={constraint.value} />
              ) : (
                <p className="text-sm text-muted-foreground">No blocker — this task is clear to proceed.</p>
              )}
            </CardContent>
          </Card>

          {/* Context */}
          <Card>
            <CardHeader><CardTitle className="text-foreground">Context</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Fact label="Project" value={project?.name ?? null} />
              <Fact label="Milestone" value={milestone?.title ?? null} />
              <Fact label="Source type" value={task.source_type} />
              <Fact label="Source reference" value={task.source_reference} />
              <Fact label="Created by" value={creator?.full_name ?? null} />
              <Fact label="Last activity" value={formatDistanceToNow(new Date(task.last_activity_at), { addSuffix: true })} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {/* Activity timeline */}
          <Card>
            <CardHeader><CardTitle className="text-foreground">Activity</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
              ) : (
                activity.map((event) => (
                  <div key={event.id} className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0">
                    <p className="text-sm text-foreground">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.profiles?.full_name ?? 'System'} · {formatDistanceToNow(new Date(event.occurred_at), { addSuffix: true })}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
