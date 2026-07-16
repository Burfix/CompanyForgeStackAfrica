import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { MilestoneStatusPill, MilestoneHealthPill, PriorityBadge, AttentionModeBadge, ProgressBar } from '@/components/shared/status-badge';
import { isMilestoneOverdue } from '@/features/milestones/constants';
import { formatDistanceToNow } from 'date-fns';

interface MilestoneCardProps {
  milestone: {
    id: string;
    title: string;
    status: string;
    health: string;
    priority: string;
    progress_percent: number;
    due_date: string | null;
    attention_mode?: string | null;
    founder_required?: boolean;
    blocked_reason?: string | null;
    waiting_on?: string | null;
    next_review_at?: string | null;
    last_activity_at: string;
    project: { id: string; name: string } | { id: string; name: string }[] | null;
    owner: { id: string; full_name: string | null } | { id: string; full_name: string | null }[] | null;
  };
  taskCompletion?: { completed: number; total: number };
}

/**
 * Milestone execution card: title + project first, status/health/priority
 * second, progress third, owner/due/attention fourth, blocker or
 * waiting-on summary last — progressive disclosure rather than every field
 * at equal weight, matching the spec's information hierarchy.
 */
export function MilestoneCard({ milestone, taskCompletion }: MilestoneCardProps) {
  const project = Array.isArray(milestone.project) ? milestone.project[0] : milestone.project;
  const owner = Array.isArray(milestone.owner) ? milestone.owner[0] : milestone.owner;
  const overdue = isMilestoneOverdue(milestone.due_date, milestone.status as never);
  const constraint = milestone.status === 'blocked' ? milestone.blocked_reason : milestone.status === 'waiting' ? milestone.waiting_on : null;

  return (
    <Link href={`/milestones/${milestone.id}`}>
      <Card className="flex flex-col gap-2 p-4 transition-colors hover:border-primary/50">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-medium text-foreground">{milestone.title}</h3>
            {project ? <p className="text-xs text-muted-foreground">{project.name}</p> : null}
          </div>
          <PriorityBadge level={milestone.priority} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <MilestoneStatusPill status={milestone.status} />
          <MilestoneHealthPill health={milestone.health} />
          {milestone.attention_mode ? <AttentionModeBadge mode={milestone.attention_mode} /> : null}
        </div>

        <ProgressBar percent={milestone.progress_percent} />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{owner?.full_name ?? 'Unassigned'}</span>
          {milestone.due_date ? (
            <span className={overdue ? 'font-medium text-red-400' : ''}>
              {overdue ? 'Overdue · ' : ''}
              {new Date(milestone.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          ) : null}
        </div>

        {constraint ? <p className="line-clamp-1 text-xs text-amber-400">{constraint}</p> : null}
        {taskCompletion ? (
          <p className="text-xs text-muted-foreground">{taskCompletion.completed}/{taskCompletion.total} tasks complete</p>
        ) : null}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {milestone.next_review_at ? <span>Next review {new Date(milestone.next_review_at).toLocaleDateString()}</span> : <span />}
          <span>Active {formatDistanceToNow(new Date(milestone.last_activity_at), { addSuffix: true })}</span>
        </div>
      </Card>
    </Link>
  );
}
