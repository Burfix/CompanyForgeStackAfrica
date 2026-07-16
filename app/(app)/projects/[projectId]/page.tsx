import Link from 'next/link';
import { notFound } from 'next/navigation';
import { differenceInCalendarDays, formatDistanceToNow } from 'date-fns';
import { getCurrentOrg } from '@/lib/auth/session';
import { projectsRepository } from '@/repositories/projects.repository';
import { tasksRepository } from '@/repositories/tasks.repository';
import { milestonesRepository } from '@/repositories/milestones.repository';
import { activityRepository } from '@/repositories/activity.repository';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HealthPill, FocusLevelBadge, StatusPill, AttentionIndicator } from '@/components/shared/status-badge';
import { ProjectActions } from '@/features/projects/components/project-actions';

interface ProjectDetailPageProps {
  params: Promise<{ projectId: string }>;
}

function TimelineFact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value ?? '—'}</span>
    </div>
  );
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { projectId } = await params;
  const org = await getCurrentOrg();

  const project = await projectsRepository.getById(org.organizationId, projectId);
  if (!project) notFound();

  const [tasks, milestones, activity] = await Promise.all([
    tasksRepository.listByProject(org.organizationId, projectId),
    milestonesRepository.listByProject(org.organizationId, projectId),
    activityRepository.listForEntity(org.organizationId, 'project', projectId),
  ]);

  const owner = Array.isArray(project.owner) ? project.owner[0] : project.owner;

  const daysRemaining = project.target_date ? differenceInCalendarDays(new Date(project.target_date), new Date()) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <AttentionIndicator active={project.founder_attention_required} />
            <div>
              <h1 className="text-xl font-semibold text-foreground">{project.name}</h1>
              <p className="text-sm text-muted-foreground">{project.category ?? 'Uncategorized'} · Priority {project.priority_score}</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${project.id}/edit`}>Edit</Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <FocusLevelBadge level={project.focus_level} />
          <StatusPill status={project.status} />
          <HealthPill health={project.health} />
          <span className="text-xs text-muted-foreground">Owner: {owner?.full_name ?? 'Unassigned'}</span>
        </div>

        <ProjectActions projectId={project.id} currentStatus={project.status} currentFocusLevel={project.focus_level} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Summary */}
          <Card>
            <CardHeader><CardTitle className="text-foreground">Summary</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {project.description ? <p className="text-sm text-foreground">{project.description}</p> : null}
              <div>
                <p className="text-xs text-muted-foreground">Desired outcome</p>
                <p className="text-sm text-foreground">{project.desired_outcome ?? '—'}</p>
              </div>
              {project.success_metric ? (
                <div>
                  <p className="text-xs text-muted-foreground">Success metric</p>
                  <p className="text-sm text-foreground">
                    {project.success_metric}
                    {project.current_value !== null || project.target_value !== null
                      ? ` — ${project.current_value ?? '?'} / ${project.target_value ?? '?'}`
                      : ''}
                  </p>
                </div>
              ) : null}
              {project.founder_attention_required ? (
                <p className="text-xs font-medium text-red-400">Founder attention required</p>
              ) : null}
            </CardContent>
          </Card>

          {/* Blockers */}
          {(project.blocked_reason || project.waiting_on) && (
            <Card>
              <CardHeader><CardTitle className="text-foreground">Current Blockers</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2">
                {project.blocked_reason ? <TimelineFact label="Blocked reason" value={project.blocked_reason} /> : null}
                {project.waiting_on ? <TimelineFact label="Waiting on" value={project.waiting_on} /> : null}
              </CardContent>
            </Card>
          )}

          {/* Tasks */}
          <Card>
            <CardHeader><CardTitle className="text-foreground">Tasks</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasks linked to this project yet.</p>
              ) : (
                tasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <span className="text-foreground">{task.title}</span>
                    <span className="text-xs text-muted-foreground">{task.status}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Milestones */}
          <Card>
            <CardHeader><CardTitle className="text-foreground">Milestones</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {milestones.length === 0 ? (
                <p className="text-sm text-muted-foreground">No milestones yet.</p>
              ) : (
                milestones.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <span className="text-foreground">{m.title}</span>
                    <span className="text-xs text-muted-foreground">{m.due_date ?? m.status}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Decisions / Recommendations — reserved for a future slice */}
          <Card>
            <CardHeader><CardTitle className="text-foreground">Decisions</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Decision tracking isn&rsquo;t built yet — reserved for a later slice.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-foreground">Recommendations</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">AI recommendations ship once the AI executive team layer is built.</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {/* Timeline */}
          <Card>
            <CardHeader><CardTitle className="text-foreground">Timeline</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <TimelineFact label="Start date" value={project.start_date} />
              <TimelineFact label="Target date" value={project.target_date} />
              <TimelineFact label="Next review" value={project.next_review_at ? project.next_review_at.slice(0, 10) : null} />
              <TimelineFact label="Last activity" value={formatDistanceToNow(new Date(project.last_activity_at), { addSuffix: true })} />
              {daysRemaining !== null ? (
                <p className={`text-sm font-medium ${daysRemaining < 0 ? 'text-red-400' : 'text-foreground'}`}>
                  {daysRemaining < 0 ? `${Math.abs(daysRemaining)} days overdue` : `${daysRemaining} days remaining`}
                </p>
              ) : null}
            </CardContent>
          </Card>

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
