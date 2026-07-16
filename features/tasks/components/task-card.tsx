import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { TaskStatusPill, DueStateBadge, PriorityBadge, AttentionModeBadge } from '@/components/shared/status-badge';
import { formatDistanceToNow } from 'date-fns';

interface TaskCardProps {
  task: {
    id: string;
    title: string;
    status: string;
    priority: string;
    project_id: string;
    due_at: string | null;
    attention_mode?: string | null;
    blocked_reason?: string | null;
    waiting_on?: string | null;
    next_action?: string | null;
    estimated_minutes?: number | null;
    last_activity_at: string;
    project: { id: string; name: string } | { id: string; name: string }[] | null;
    owner: { id: string; full_name: string | null } | { id: string; full_name: string | null }[] | null;
  };
}

/**
 * Work-queue row. Hierarchy: task + project first, urgency/status second,
 * owner/due date third, constraint or next action last — matches the
 * spec's required information hierarchy rather than dumping every field.
 */
export function TaskCard({ task }: TaskCardProps) {
  const project = Array.isArray(task.project) ? task.project[0] : task.project;
  const owner = Array.isArray(task.owner) ? task.owner[0] : task.owner;
  const constraint = task.status === 'blocked' ? task.blocked_reason : task.status === 'waiting' ? task.waiting_on : null;

  return (
    <Link href={`/tasks/${task.id}`}>
      <Card className="flex flex-col gap-2 p-4 transition-colors hover:border-primary/50">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-medium text-foreground">{task.title}</h3>
            {project ? <p className="text-xs text-muted-foreground">{project.name}</p> : null}
          </div>
          <PriorityBadge level={task.priority} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <TaskStatusPill status={task.status} />
          <DueStateBadge dueAt={task.due_at} status={task.status} />
          {task.attention_mode ? <AttentionModeBadge mode={task.attention_mode} /> : null}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{owner?.full_name ?? 'Unassigned'}</span>
          {task.due_at ? <span>{new Date(task.due_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span> : null}
        </div>

        {constraint ? <p className="line-clamp-1 text-xs text-amber-400">{constraint}</p> : null}
        {task.next_action ? <p className="line-clamp-1 text-xs text-muted-foreground">Next: {task.next_action}</p> : null}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {task.estimated_minutes ? <span>{task.estimated_minutes}m est.</span> : <span />}
          <span>Active {formatDistanceToNow(new Date(task.last_activity_at), { addSuffix: true })}</span>
        </div>
      </Card>
    </Link>
  );
}
