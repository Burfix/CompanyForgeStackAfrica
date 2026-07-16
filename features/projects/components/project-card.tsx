import Link from 'next/link';
import { Card } from '@/components/ui/card';
import {
  HealthPill,
  FocusLevelBadge,
  StatusPill,
  AttentionIndicator,
  PriorityBadge,
  AttentionModeBadge,
  BusinessImpactBadges,
  ProgressBar,
} from '@/components/shared/status-badge';
import { CATEGORY_META } from '@/features/projects/constants';
import type { ProjectCategory } from '@/schemas/project.schema';
import { formatDistanceToNow, isPast } from 'date-fns';

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    category: string | null;
    status: string;
    focus_level: number;
    health: string;
    health_note?: string | null;
    target_date: string | null;
    next_review_at?: string | null;
    priority_score: number;
    priority_level?: string | null;
    progress_percent?: number | null;
    attention_mode?: string | null;
    business_impact?: string[] | null;
    desired_outcome: string | null;
    founder_attention_required: boolean;
    last_activity_at: string;
    owner: { id: string; full_name: string | null } | { id: string; full_name: string | null }[] | null;
  };
  nextMilestone?: { title: string; due_date: string | null };
  dependencyCount?: number;
}

/**
 * Operational portfolio row — deliberately not a generic data table. Every
 * field a founder needs to triage attention is visible without a click,
 * but information hierarchy keeps it from becoming clutter: identity and
 * urgency first, health/priority/progress next, ownership and dates last.
 */
export function ProjectCard({ project, nextMilestone, dependencyCount }: ProjectCardProps) {
  const owner = Array.isArray(project.owner) ? project.owner[0] : project.owner;
  const overdue = project.target_date ? isPast(new Date(project.target_date)) && project.status !== 'completed' : false;
  const categoryLabel = project.category ? CATEGORY_META[project.category as ProjectCategory]?.label ?? project.category : null;

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-primary/50">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <AttentionIndicator active={project.founder_attention_required} />
            <h3 className="font-medium text-foreground">{project.name}</h3>
          </div>
          {project.priority_level ? (
            <PriorityBadge level={project.priority_level} score={project.priority_score} />
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground">P{project.priority_score}</span>
          )}
        </div>

        {project.desired_outcome ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{project.desired_outcome}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          <FocusLevelBadge level={project.focus_level} />
          <StatusPill status={project.status} />
          <HealthPill health={project.health} />
          {categoryLabel ? (
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{categoryLabel}</span>
          ) : null}
        </div>

        {project.health_note && (project.health === 'at_risk' || project.health === 'off_track') ? (
          <p className="line-clamp-1 text-xs text-amber-400">{project.health_note}</p>
        ) : null}

        <ProgressBar percent={project.progress_percent ?? 0} />

        <BusinessImpactBadges impact={project.business_impact} />

        <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
          <span>Owner: {owner?.full_name ?? 'Unassigned'}</span>
          {project.attention_mode ? <AttentionModeBadge mode={project.attention_mode} /> : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {project.target_date ? (
            <span className={overdue ? 'text-red-400' : undefined}>
              {overdue ? 'Overdue' : 'Target'}: {project.target_date}
            </span>
          ) : null}
          {project.next_review_at ? <span>Next review: {project.next_review_at.slice(0, 10)}</span> : null}
          {dependencyCount ? <span>{dependencyCount} {dependencyCount === 1 ? 'dependency' : 'dependencies'}</span> : null}
        </div>

        {nextMilestone ? (
          <p className="text-xs text-muted-foreground">Next milestone: {nextMilestone.title}{nextMilestone.due_date ? ` (${nextMilestone.due_date})` : ''}</p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Last activity {formatDistanceToNow(new Date(project.last_activity_at), { addSuffix: true })}
        </p>
      </Card>
    </Link>
  );
}
