import { getCurrentOrg, requireUser } from '@/lib/auth/session';
import { projectsRepository } from '@/repositories/projects.repository';
import { milestonesRepository } from '@/repositories/milestones.repository';
import { activityRepository } from '@/repositories/activity.repository';
import { tasksRepository } from '@/repositories/tasks.repository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  HealthPill,
  FocusLevelBadge,
  PriorityBadge,
  ProgressBar,
  AttentionModeBadge,
  TaskStatusPill,
  DueStateBadge,
  MilestoneStatusPill,
  MilestoneHealthPill,
} from '@/components/shared/status-badge';
import { PRIORITY_LEVEL_SCORE_FALLBACK, FOCUS_LEVEL_META } from '@/features/projects/constants';
import { computeDueState, taskSortWeight } from '@/features/tasks/constants';
import { isMilestoneOverdue, isMilestoneDueToday } from '@/features/milestones/constants';
import type { PriorityLevel } from '@/schemas/project.schema';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

const MILESTONE_HEALTH_SEVERITY: Record<string, number> = { off_track: 0, at_risk: 1, needs_attention: 2, unknown: 3, healthy: 4 };
const MILESTONE_PRIORITY_WEIGHT: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

interface FounderHqTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  founder_required: boolean;
  next_action: string | null;
  project: { id: string; name: string } | { id: string; name: string }[] | null;
}

function todaysPriorityReason(task: FounderHqTask, now: Date): string {
  const state = computeDueState(task.due_at, task.status as never, now);
  if (state === 'overdue' && task.priority === 'urgent') return 'Overdue · Urgent';
  if (state === 'overdue') return 'Overdue';
  if (task.founder_required && state === 'due_today') return 'Founder required · Due today';
  if (task.status === 'blocked') return 'Blocked · high impact';
  if (state === 'due_today') return 'Due today';
  if (task.status === 'in_progress') return 'In progress · approaching deadline';
  return 'Needs attention';
}

/**
 * Founder HQ — the homepage. Server-rendered: every widget below reads
 * directly from Supabase on the server, so first paint has real data and
 * there's no client-side loading waterfall. Each block is intentionally
 * one repository call, no client component, no shared state — cheap to
 * reason about correctness now, cheap to add React Query on top later if
 * a widget needs live updates.
 */
export default async function FounderHQPage() {
  await requireUser();
  const org = await getCurrentOrg();

  const [projects, statusCounts, milestones, activity, taskCounts, allOpenTasks, tasksNeedingAttention, needsAttention, allMilestones, milestonesNeedingAttention] = await Promise.all([
    projectsRepository.listByOrg(org.organizationId),
    projectsRepository.countByStatus(org.organizationId),
    milestonesRepository.listUpcoming(org.organizationId),
    activityRepository.listRecent(org.organizationId, 8),
    tasksRepository.countTasksByStatus(org.organizationId),
    tasksRepository.listTasks(org.organizationId, {}),
    tasksRepository.listTasksNeedingAttention(org.organizationId),
    projectsRepository.listNeedingAttention(org.organizationId),
    milestonesRepository.listMilestones(org.organizationId),
    milestonesRepository.listMilestonesNeedingAttention(org.organizationId),
  ]);

  const now = new Date();
  const openTasks = (allOpenTasks as unknown as FounderHqTask[]).filter((t) => !['completed', 'done', 'cancelled'].includes(t.status));
  const dueTodayCount = openTasks.filter((t) => computeDueState(t.due_at, t.status as never, now) === 'due_today').length;
  const overdueCount = openTasks.filter((t) => computeDueState(t.due_at, t.status as never, now) === 'overdue').length;
  const founderRequiredTaskCount = openTasks.filter((t) => t.founder_required).length;
  const blockedTaskCount = taskCounts.blocked ?? 0;
  const inReviewCount = taskCounts.review ?? 0;

  // Today's Priorities: deterministic top 5, no AI ordering — combines the
  // exact buckets the spec calls for, deduped, sorted by taskSortWeight.
  const priorityCandidates = openTasks.filter((t) => {
    const state = computeDueState(t.due_at, t.status as never, now);
    return (
      state === 'overdue' ||
      state === 'due_today' ||
      t.founder_required ||
      t.priority === 'urgent' ||
      (t.status === 'blocked' && (t.priority === 'urgent' || t.priority === 'high')) ||
      (t.status === 'in_progress' && state === 'due_soon')
    );
  });
  const todaysPriorities = [...priorityCandidates]
    .sort((a, b) => taskSortWeight(a as never, now) - taskSortWeight(b as never, now))
    .slice(0, 5);

  const criticalProjects = projects.filter((p) => p.focus_level <= 2);
  const atRiskOrOffTrack = projects.filter((p) => p.health === 'at_risk' || p.health === 'off_track').length;
  const founderRequired = projects.filter((p) => p.founder_attention_required);

  const focusLevelCounts = [1, 2, 3, 4, 5].map((level) => ({
    level,
    count: projects.filter((p) => p.focus_level === level).length,
  }));

  function effectiveScore(p: (typeof projects)[number]) {
    if (p.priority_score) return p.priority_score;
    return p.priority_level ? PRIORITY_LEVEL_SCORE_FALLBACK[p.priority_level as PriorityLevel] : 0;
  }

  // Priority-ordered, not just insertion order — this is the "use priority
  // level when ordering projects" requirement. Falls back to priority_score
  // when priority_level maps to the same fallback bucket.
  const orderedProjects = [...projects].sort((a, b) => effectiveScore(b) - effectiveScore(a));

  // Milestone summary — deterministic counts, no AI.
  const openMilestoneStatuses = new Set(['pending', 'in_progress', 'blocked', 'waiting']);
  const openMilestones = allMilestones.filter((m) => openMilestoneStatuses.has(m.status));
  const milestoneDueTodayCount = openMilestones.filter((m) => isMilestoneDueToday(m.due_date, m.status as never, now)).length;
  const milestoneOverdueCount = openMilestones.filter((m) => isMilestoneOverdue(m.due_date, m.status as never, now)).length;
  const milestoneBlockedCount = openMilestones.filter((m) => m.status === 'blocked').length;
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const milestonesCompletedThisWeek = allMilestones.filter((m) => m.status === 'completed' && new Date(m.last_activity_at) >= oneWeekAgo).length;

  // Next Major Outcomes: the next open milestone per high-priority (focus
  // level 1-2) project, ordered by the exact deterministic factors the
  // spec calls for — overdue, founder required, health severity, priority,
  // due date, project focus level. No AI ranking.
  const highPriorityProjectIds = new Set(projects.filter((p) => p.focus_level <= 2).map((p) => p.id));
  const nextOutcomeByProject = new Map<string, (typeof openMilestones)[number]>();
  for (const m of [...openMilestones].sort((a, b) => {
    const aDue = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const bDue = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    return aDue - bDue;
  })) {
    if (!highPriorityProjectIds.has(m.project_id)) continue;
    if (!nextOutcomeByProject.has(m.project_id)) nextOutcomeByProject.set(m.project_id, m);
  }
  const nextMajorOutcomes = [...nextOutcomeByProject.values()]
    .sort((a, b) => {
      const aOverdue = isMilestoneOverdue(a.due_date, a.status as never, now);
      const bOverdue = isMilestoneOverdue(b.due_date, b.status as never, now);
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      if (a.founder_required !== b.founder_required) return a.founder_required ? -1 : 1;
      const healthDiff = (MILESTONE_HEALTH_SEVERITY[a.health] ?? 9) - (MILESTONE_HEALTH_SEVERITY[b.health] ?? 9);
      if (healthDiff !== 0) return healthDiff;
      const priorityDiff = (MILESTONE_PRIORITY_WEIGHT[a.priority] ?? 9) - (MILESTONE_PRIORITY_WEIGHT[b.priority] ?? 9);
      if (priorityDiff !== 0) return priorityDiff;
      const aDue = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const bDue = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      if (aDue !== bDue) return aDue - bDue;
      const aProject = projects.find((p) => p.id === a.project_id);
      const bProject = projects.find((p) => p.id === b.project_id);
      return (aProject?.focus_level ?? 9) - (bProject?.focus_level ?? 9);
    })
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Founder HQ</h1>
        <p className="text-sm text-muted-foreground">{org.organizationName} — company overview</p>
      </div>

      {/* Company health */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader><CardTitle>Active Projects</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">{statusCounts.active ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Critical Focus</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">{criticalProjects.length}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>At Risk / Off Track</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">{atRiskOrOffTrack}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Upcoming Milestones</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">{milestones.length}</CardContent>
        </Card>
      </div>

      {/* Focus level distribution — quick read on where attention is concentrated */}
      <div className="flex flex-wrap items-center gap-2">
        {focusLevelCounts.map(({ level, count }) => (
          <span key={level} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${FOCUS_LEVEL_META[level as 1 | 2 | 3 | 4 | 5].indicatorClass}`} aria-hidden="true" />
            {FOCUS_LEVEL_META[level as 1 | 2 | 3 | 4 | 5].display}: {count}
          </span>
        ))}
      </div>

      {/* Needs attention — at risk, off track, or founder-required, ordered by next review */}
      {needsAttention.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Needs Attention</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {needsAttention.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:border-primary/50"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{project.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {project.next_review_at ? `Next review: ${project.next_review_at.slice(0, 10)}` : 'No review scheduled'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <HealthPill health={project.health} />
                  {project.attention_mode ? <AttentionModeBadge mode={project.attention_mode} /> : null}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Current projects */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Current Projects ({founderRequired.length} founder-required)</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {orderedProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects yet.</p>
            ) : (
              orderedProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 hover:border-primary/50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{project.name}</p>
                      <p className="text-xs text-muted-foreground">{project.category ?? 'Uncategorized'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {project.priority_level ? <PriorityBadge level={project.priority_level} score={project.priority_score} /> : null}
                      <FocusLevelBadge level={project.focus_level} />
                      <HealthPill health={project.health} />
                    </div>
                  </div>
                  <ProgressBar percent={project.progress_percent ?? 0} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Today's priorities — deterministic, not AI-ranked */}
        <Card>
          <CardHeader><CardTitle>Today&rsquo;s Priorities</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {todaysPriorities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing urgent right now. Clear runway.</p>
            ) : (
              todaysPriorities.map((task) => {
                const taskProject = Array.isArray(task.project) ? task.project[0] : task.project;
                return (
                  <Link key={task.id} href={`/tasks/${task.id}`} className="flex flex-col gap-1 rounded-md border border-border px-3 py-2 hover:border-primary/50">
                    <p className="text-sm text-foreground">{task.title}</p>
                    <p className="text-xs text-muted-foreground">{taskProject?.name ?? 'No project'} · {todaysPriorityReason(task, now)}</p>
                    <div className="flex items-center gap-1.5">
                      <PriorityBadge level={task.priority} />
                      <DueStateBadge dueAt={task.due_at} status={task.status} />
                    </div>
                    {task.next_action ? <p className="text-xs text-muted-foreground">Next: {task.next_action}</p> : null}
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Task summary */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card>
          <CardHeader><CardTitle>Due Today</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">{dueTodayCount}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Overdue</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">{overdueCount}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Founder Required</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">{founderRequiredTaskCount}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Blocked</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">{blockedTaskCount}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>In Review</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">{inReviewCount}</CardContent>
        </Card>
      </div>

      {/* Milestone summary */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card>
          <CardHeader><CardTitle>Open Milestones</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">{openMilestones.length}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Due Today</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">{milestoneDueTodayCount}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Overdue</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">{milestoneOverdueCount}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Blocked</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">{milestoneBlockedCount}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Completed This Week</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">{milestonesCompletedThisWeek}</CardContent>
        </Card>
      </div>

      {/* Next Major Outcomes — the next open milestone per high-priority
          project, deterministically ordered (overdue, founder required,
          health severity, priority, due date, project focus level). */}
      {nextMajorOutcomes.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Next Major Outcomes</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {nextMajorOutcomes.map((m) => {
              const mProject = Array.isArray(m.project) ? m.project[0] : m.project;
              return (
                <Link key={m.id} href={`/milestones/${m.id}`} className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:border-primary/50">
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.title}</p>
                    <p className="text-xs text-muted-foreground">{mProject?.name ?? 'No project'}{m.due_date ? ` · Due ${m.due_date}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MilestoneHealthPill health={m.health} />
                    <PriorityBadge level={m.priority} />
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {/* Milestones needing attention */}
      {milestonesNeedingAttention.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Milestones Needing Attention</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {milestonesNeedingAttention.slice(0, 8).map((m) => {
              const mProject = Array.isArray(m.project) ? m.project[0] : m.project;
              return (
                <Link key={m.id} href={`/milestones/${m.id}`} className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:border-primary/50">
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.title}</p>
                    <p className="text-xs text-muted-foreground">{mProject?.name ?? 'No project'}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MilestoneStatusPill status={m.status} />
                    <MilestoneHealthPill health={m.health} />
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {/* Tasks needing attention — kept as its own panel alongside (not
          replacing) the project-level Needs Attention panel above. */}
      {tasksNeedingAttention.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Tasks Needing Attention</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {tasksNeedingAttention.slice(0, 8).map((task) => {
              const taskProject = Array.isArray(task.project) ? task.project[0] : task.project;
              return (
                <Link key={task.id} href={`/tasks/${task.id}`} className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:border-primary/50">
                  <div>
                    <p className="text-sm font-medium text-foreground">{task.title}</p>
                    <p className="text-xs text-muted-foreground">{taskProject?.name ?? 'No project'}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <TaskStatusPill status={task.status} />
                    <DueStateBadge dueAt={task.due_at} status={task.status} />
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upcoming milestones */}
        <Card>
          <CardHeader><CardTitle>Upcoming Milestones</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {milestones.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming milestones.</p>
            ) : (
              milestones.map((m) => (
                <Link key={m.id} href={`/milestones/${m.id}`} className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:border-primary/50">
                  <div>
                    <p className="text-sm text-foreground">{m.title}</p>
                    <p className="text-xs text-muted-foreground">{m.projects?.name}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{m.due_date}</span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
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
  );
}
