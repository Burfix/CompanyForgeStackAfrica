import Link from 'next/link';
import { notFound } from 'next/navigation';
import { differenceInCalendarDays, formatDistanceToNow } from 'date-fns';
import { getCurrentOrg } from '@/lib/auth/session';
import { projectsRepository } from '@/repositories/projects.repository';
import { tasksRepository } from '@/repositories/tasks.repository';
import { milestonesRepository } from '@/repositories/milestones.repository';
import { activityRepository } from '@/repositories/activity.repository';
import { projectDependenciesRepository } from '@/repositories/project-dependencies.repository';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  HealthPill,
  FocusLevelBadge,
  StatusPill,
  AttentionIndicator,
  PriorityBadge,
  AttentionModeBadge,
  BusinessImpactBadges,
  ProgressBar,
  TaskStatusPill,
  DueStateBadge,
} from '@/components/shared/status-badge';
import { CATEGORY_META, REVIEW_CADENCE_META } from '@/features/projects/constants';
import type { ProjectCategory } from '@/schemas/project.schema';
import { ProjectActions } from '@/features/projects/components/project-actions';
import { ProjectDependencies } from '@/features/projects/components/project-dependencies';
import { ProjectMilestonesSection } from '@/features/milestones/components/project-milestones-section';

const OPEN_TASK_STATUSES = new Set(['inbox', 'planned', 'in_progress', 'review']);

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

function SummaryFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  );
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { projectId } = await params;
  const org = await getCurrentOrg();

  const project = await projectsRepository.getById(org.organizationId, projectId);
  if (!project) notFound();

  const [tasks, taskCounts, milestones, milestoneCounts, activity, dependencies, selectableProjects] = await Promise.all([
    tasksRepository.listTasksByProject(org.organizationId, projectId),
    tasksRepository.countTasksByProject(org.organizationId, projectId),
    milestonesRepository.listByProject(org.organizationId, projectId),
    milestonesRepository.countMilestonesByProject(org.organizationId, projectId),
    activityRepository.listForEntity(org.organizationId, 'project', projectId),
    projectDependenciesRepository.listForProject(org.organizationId, projectId),
    projectsRepository.listSelectable(org.organizationId, projectId),
  ]);

  const openTasks = tasks.filter((t) => OPEN_TASK_STATUSES.has(t.status));
  const blockedOrWaitingTasks = tasks.filter((t) => t.status === 'blocked' || t.status === 'waiting');
  const completedTasks = tasks.filter((t) => t.status === 'completed' || t.status === 'done');

  const owner = Array.isArray(project.owner) ? project.owner[0] : project.owner;
  const categoryLabel = project.category ? CATEGORY_META[project.category as ProjectCategory]?.label ?? project.category : 'Uncategorized';

  const daysRemaining = project.target_date ? differenceInCalendarDays(new Date(project.target_date), new Date()) : null;

  const openMilestoneStatuses = new Set(['pending', 'in_progress', 'blocked', 'waiting']);
  const nextMilestone = milestones
    .filter((m) => openMilestoneStatuses.has(m.status) && m.due_date)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())[0];

  const outgoingDeps = (dependencies.outgoing ?? []).map((d) => ({
    id: d.id,
    dependency_type: d.dependency_type,
    note: d.note,
    project: Array.isArray(d.depends_on) ? d.depends_on[0] : d.depends_on,
  })).filter((d): d is typeof d & { project: NonNullable<typeof d.project> } => !!d.project);

  const incomingDeps = (dependencies.incoming ?? []).map((d) => ({
    id: d.id,
    dependency_type: d.dependency_type,
    note: d.note,
    project: Array.isArray(d.dependent) ? d.dependent[0] : d.dependent,
  })).filter((d): d is typeof d & { project: NonNullable<typeof d.project> } => !!d.project);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <AttentionIndicator active={project.founder_attention_required} />
            <div>
              <h1 className="text-xl font-semibold text-foreground">{project.name}</h1>
              <p className="text-sm text-muted-foreground">{categoryLabel}</p>
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
          {project.priority_level ? <PriorityBadge level={project.priority_level} score={project.priority_score} /> : null}
          {project.attention_mode ? <AttentionModeBadge mode={project.attention_mode} /> : null}
        </div>

        <ProjectActions projectId={project.id} currentStatus={project.status} currentFocusLevel={project.focus_level} />
      </div>

      {/* Executive summary — derived entirely from stored structured data */}
      <Card>
        <CardHeader><CardTitle className="text-foreground">Executive Summary</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryFact label="Health"><HealthPill health={project.health} /></SummaryFact>
          <SummaryFact label="Progress"><ProgressBar percent={project.progress_percent ?? 0} /></SummaryFact>
          <SummaryFact label="Priority">{project.priority_level ? <PriorityBadge level={project.priority_level} score={project.priority_score} /> : '—'}</SummaryFact>
          <SummaryFact label="Focus level"><FocusLevelBadge level={project.focus_level} /></SummaryFact>
          <SummaryFact label="Status"><StatusPill status={project.status} /></SummaryFact>
          <SummaryFact label="Executive Owner"><span className="text-sm text-foreground">{owner?.full_name ?? 'Unassigned'}</span></SummaryFact>
          <SummaryFact label="Attention mode">{project.attention_mode ? <AttentionModeBadge mode={project.attention_mode} /> : '—'}</SummaryFact>
          <SummaryFact label="Next review"><span className="text-sm text-foreground">{project.next_review_at ? project.next_review_at.slice(0, 10) : '—'}</span></SummaryFact>
          <SummaryFact label="Target date"><span className="text-sm text-foreground">{project.target_date ?? '—'}</span></SummaryFact>
          <SummaryFact label="Last activity"><span className="text-sm text-foreground">{formatDistanceToNow(new Date(project.last_activity_at), { addSuffix: true })}</span></SummaryFact>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Success Definition (was: Outcome) */}
          <Card>
            <CardHeader><CardTitle className="text-foreground">Success Definition</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
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
              {project.health_note ? (
                <div>
                  <p className="text-xs text-muted-foreground">Health note</p>
                  <p className="text-sm text-foreground">{project.health_note}</p>
                </div>
              ) : null}
              <BusinessImpactBadges impact={project.business_impact} />
              {project.founder_attention_required ? (
                <p className="text-xs font-medium text-red-400">Founder attention required</p>
              ) : null}
            </CardContent>
          </Card>

          {/* Executive Notes (was: Description) */}
          {project.description ? (
            <Card>
              <CardHeader><CardTitle className="text-foreground">Executive Notes</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-foreground">{project.description}</p>
              </CardContent>
            </Card>
          ) : null}

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

          {/* Dependencies */}
          <Card>
            <CardHeader><CardTitle className="text-foreground">Dependencies</CardTitle></CardHeader>
            <CardContent>
              <ProjectDependencies
                projectId={project.id}
                outgoing={outgoingDeps as never}
                incoming={incomingDeps as never}
                selectableProjects={selectableProjects}
              />
            </CardContent>
          </Card>

          {/* Tasks */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-foreground">Tasks</CardTitle>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/tasks/new?projectId=${project.id}&returnTo=/projects/${project.id}`}>New Task</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/tasks?project=${project.id}`}>View All</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <TimelineFact label="Open" value={String(taskCounts.open)} />
                <TimelineFact label="Overdue" value={String(taskCounts.overdue)} />
                <TimelineFact label="Completed" value={String(taskCounts.completed)} />
                <TimelineFact label="Founder-required" value={String(taskCounts.founderRequired)} />
                <TimelineFact label="Blocked" value={String(taskCounts.blocked)} />
              </div>

              {tasks.length === 0 ? (
                <div className="flex flex-col items-start gap-2">
                  <p className="text-sm text-muted-foreground">No tasks have been added to this project.</p>
                  <Button asChild size="sm">
                    <Link href={`/tasks/new?projectId=${project.id}&returnTo=/projects/${project.id}`}>New Task</Link>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {[
                    { title: 'Open', items: openTasks },
                    { title: 'Blocked or Waiting', items: blockedOrWaitingTasks },
                    { title: 'Completed', items: completedTasks },
                  ]
                    .filter((group) => group.items.length > 0)
                    .map((group) => (
                      <div key={group.title} className="flex flex-col gap-2">
                        <p className="text-xs font-medium text-muted-foreground">{group.title}</p>
                        {group.items.slice(0, 5).map((task) => (
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

          {/* Milestones */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-foreground">Milestones</CardTitle>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/milestones/new?projectId=${project.id}&returnTo=/projects/${project.id}`}>New Milestone</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/milestones?project=${project.id}`}>View All</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <TimelineFact label="Total" value={String(milestoneCounts.total)} />
                <TimelineFact label="Completed" value={String(milestoneCounts.completed)} />
                <TimelineFact label="Overdue" value={String(milestoneCounts.overdue)} />
                <TimelineFact label="Next milestone" value={nextMilestone?.title ?? 'None scheduled'} />
              </div>
              <ProjectMilestonesSection projectId={project.id} milestones={milestones as never} />
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
              <TimelineFact label="Review cadence" value={project.review_cadence ? REVIEW_CADENCE_META[project.review_cadence]?.label ?? project.review_cadence : null} />
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

          {/* Decisions / Recommendations — reserved for a future slice */}
          <Card>
            <CardHeader><CardTitle className="text-foreground">Decisions</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Decision tracking isn&rsquo;t built yet — reserved for a later slice.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
