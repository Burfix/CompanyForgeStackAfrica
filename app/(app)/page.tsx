import { getCurrentOrg, requireUser } from '@/lib/auth/session';
import { projectsRepository } from '@/repositories/projects.repository';
import { milestonesRepository } from '@/repositories/milestones.repository';
import { activityRepository } from '@/repositories/activity.repository';
import { tasksRepository } from '@/repositories/tasks.repository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HealthPill, FocusLevelBadge, PriorityBadge, ProgressBar, AttentionModeBadge } from '@/components/shared/status-badge';
import { PRIORITY_LEVEL_SCORE_FALLBACK, FOCUS_LEVEL_META } from '@/features/projects/constants';
import type { PriorityLevel } from '@/schemas/project.schema';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

/**
 * Founder HQ — the homepage. Server-rendered: every widget below reads
 * directly from Supabase on the server, so first paint has real data and
 * there's no client-side loading waterfall. Each block is intentionally
 * one repository call, no client component, no shared state — cheap to
 * reason about correctness now, cheap to add React Query on top later if
 * a widget needs live updates.
 */
export default async function FounderHQPage() {
  const user = await requireUser();
  const org = await getCurrentOrg();

  const [projects, statusCounts, milestones, activity, priorities, needsAttention] = await Promise.all([
    projectsRepository.listByOrg(org.organizationId),
    projectsRepository.countByStatus(org.organizationId),
    milestonesRepository.listUpcoming(org.organizationId),
    activityRepository.listRecent(org.organizationId, 8),
    tasksRepository.listTodaysPriorities(org.organizationId, user.id),
    projectsRepository.listNeedingAttention(org.organizationId),
  ]);

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

        {/* Today's priorities */}
        <Card>
          <CardHeader><CardTitle>Today&rsquo;s Priorities</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {priorities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing due today. Clear runway.</p>
            ) : (
              priorities.map((task) => (
                <div key={task.id} className="rounded-md border border-border px-3 py-2">
                  <p className="text-sm text-foreground">{task.title}</p>
                  <p className="text-xs text-muted-foreground">{task.projects?.name}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upcoming milestones */}
        <Card>
          <CardHeader><CardTitle>Upcoming Milestones</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {milestones.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming milestones.</p>
            ) : (
              milestones.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <p className="text-sm text-foreground">{m.title}</p>
                    <p className="text-xs text-muted-foreground">{m.projects?.name}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{m.due_date}</span>
                </div>
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
