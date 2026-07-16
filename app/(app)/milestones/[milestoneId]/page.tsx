import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { getCurrentOrg } from '@/lib/auth/session';
import { milestonesRepository } from '@/repositories/milestones.repository';
import { activityRepository } from '@/repositories/activity.repository';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  MilestoneStatusPill,
  MilestoneHealthPill,
  PriorityBadge,
  AttentionModeBadge,
  ProgressBar,
  TaskStatusPill,
  DueStateBadge,
} from '@/components/shared/status-badge';
import { isMilestoneOverdue } from '@/features/milestones/constants';
import { MilestoneActions } from '@/features/milestones/components/milestone-actions';

interface MilestoneDetailPageProps {
  params: Promise<{ milestoneId: string }>;
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value ?? '—'}</span>
    </div>
  );
}

const TASK_OPEN_STATUSES = new Set(['inbox', 'planned', 'todo']);
const TASK_COMPLETED_STATUSES = new Set(['completed', 'done']);

export default async function MilestoneDetailPage({ params }: MilestoneDetailPageProps) {
  const { milestoneId } = await params;
  const org = await getCurrentOrg();

  const milestone = await milestonesRepository.getMilestoneById(org.organizationId, milestoneId);
  if (!milestone) notFound();

  const [tasks, activity, rollup] = await Promise.all([
    milestonesRepository.listTasksForMilestone(org.organizationId, milestoneId),
    activityRepository.listForEntity(org.organizationId, 'milestone', milestoneId),
    milestonesRepository.getTaskCompletionRollup(org.organizationId, milestoneId),
  ]);

  const project = Array.isArray(milestone.project) ? milestone.project[0] : milestone.project;
  const owner = Array.isArray(milestone.owner) ? milestone.owner[0] : milestone.owner;
  const overdue = isMilestoneOverdue(milestone.due_date, milestone.status as never);

  const openTasks = tasks.filter((t) => TASK_OPEN_STATUSES.has(t.status));
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress');
  const blockedOrWaitingTasks = tasks.filter((t) => t.status === 'blocked' || t.status === 'waiting');
  const inReviewTasks = tasks.filter((t) => t.status === 'review');
  const completedTasks = tasks.filter((t) => TASK_COMPLETED_STATUSES.has(t.status));

  const taskGroups = [
    { title: 'Open', items: openTasks },
    { title: 'In Progress', items: inProgressTasks },
    { title: 'Blocked or Waiting', items: blockedOrWaitingTasks },
    { title: 'In Review', items: inReviewTasks },
    { title: 'Completed', items: completedTasks },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{milestone.title}</h1>
            {project ? <p className="text-sm text-muted-foreground">{project.name}</p> : null}
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/milestones/${milestone.id}/edit`}>Edit</Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <MilestoneStatusPill status={milestone.status} />
          <MilestoneHealthPill health={milestone.health} />
          <PriorityBadge level={milestone.priority} />
          {milestone.attention_mode ? <AttentionModeBadge mode={milestone.attention_mode} /> : null}
          {overdue ? <span className="text-xs font-medium text-red-400">Overdue</span> : null}
        </div>

        <div className="max-w-sm"><ProgressBar percent={milestone.progress_percent} /></div>

        <MilestoneActions milestoneId={milestone.id} currentStatus={milestone.status} />
      </div>

      {/* Executive summary */}
      <Card>
        <CardHeader><CardTitle className="text-foreground">Executive Summary</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Fact label="Executive Owner" value={owner?.full_name ?? 'Unassigned'} />
          <Fact label="Current value" value={milestone.current_value} />
          <Fact label="Target value" value={milestone.target_value} />
          <Fact label="Founder required" value={milestone.founder_required ? 'Yes' : 'No'} />
          <Fact label="Start date" value={milestone.start_date} />
          <Fact label="Due date" value={milestone.due_date} />
          <Fact label="Next review" value={milestone.next_review_at ? milestone.next_review_at.slice(0, 10) : null} />
          <Fact label="Last activity" value={formatDistanceToNow(new Date(milestone.last_activity_at), { addSuffix: true })} />
        </CardContent>
      </Card>

      {milestone.success_criteria ? (
        <Card>
          <CardHeader><CardTitle className="text-foreground">Success Criteria</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-foreground">{milestone.success_criteria}</p></CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Execution */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-foreground">Execution</CardTitle>
              <Button asChild variant="outline" size="sm">
                <Link href={`/tasks/new?projectId=${milestone.project_id}&milestoneId=${milestone.id}&returnTo=/milestones/${milestone.id}`}>New Task</Link>
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Fact label="Total tasks" value={String(tasks.length)} />
                <Fact label="Completed" value={String(rollup.completedEligibleTasks)} />
                <Fact label="Progress mode" value={milestone.progress_mode === 'manual' ? 'Manual' : 'Automatic'} />
              </div>
              {milestone.progress_mode === 'automatic' ? (
                <p className="text-xs text-muted-foreground">
                  Automatic progress = completed eligible tasks ÷ all eligible tasks (cancelled tasks excluded) ={' '}
                  {rollup.totalEligibleTasks > 0 ? `${rollup.completedEligibleTasks}/${rollup.totalEligibleTasks}` : 'no eligible tasks yet'} = {milestone.progress_percent}%.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Progress is set manually and will not change from task activity.</p>
              )}

              {tasks.length === 0 ? (
                <div className="flex flex-col items-start gap-2">
                  <p className="text-sm text-muted-foreground">No tasks have been linked to this milestone yet.</p>
                  <Button asChild size="sm">
                    <Link href={`/tasks/new?projectId=${milestone.project_id}&milestoneId=${milestone.id}&returnTo=/milestones/${milestone.id}`}>New Task</Link>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {taskGroups.map((group) => (
                    <div key={group.title} className="flex flex-col gap-2">
                      <p className="text-xs font-medium text-muted-foreground">{group.title}</p>
                      {group.items.map((task) => (
                        <Link
                          key={task.id}
                          href={`/tasks/${task.id}`}
                          className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm hover:border-primary/50"
                        >
                          <span className="text-foreground">{task.title}</span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <TaskStatusPill status={task.status} />
                            <DueStateBadge dueAt={task.due_at} status={task.status} />
                          </div>
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Risk and blockers */}
          {(milestone.health_note || milestone.blocked_reason || milestone.waiting_on || overdue) && (
            <Card>
              <CardHeader><CardTitle className="text-foreground">Risk and Blockers</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2">
                {overdue ? <p className="text-sm font-medium text-red-400">This milestone is overdue.</p> : null}
                {milestone.health_note ? <Fact label="Health note" value={milestone.health_note} /> : null}
                {milestone.blocked_reason ? <Fact label="Blocked reason" value={milestone.blocked_reason} /> : null}
                {milestone.waiting_on ? <Fact label="Waiting on" value={milestone.waiting_on} /> : null}
              </CardContent>
            </Card>
          )}

          {milestone.description ? (
            <Card>
              <CardHeader><CardTitle className="text-foreground">Description</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-foreground">{milestone.description}</p></CardContent>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          {/* Activity */}
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
