import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { HealthPill, FocusLevelBadge, StatusPill, AttentionIndicator } from '@/components/shared/status-badge';
import { formatDistanceToNow, isPast } from 'date-fns';

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    category: string | null;
    status: string;
    focus_level: number;
    health: string;
    target_date: string | null;
    priority_score: number;
    desired_outcome: string | null;
    founder_attention_required: boolean;
    last_activity_at: string;
    owner: { id: string; full_name: string | null } | { id: string; full_name: string | null }[] | null;
  };
  nextMilestone?: { title: string; due_date: string | null };
}

/**
 * Operational portfolio row — deliberately not a generic data table. Every
 * field a founder needs to triage attention is visible without a click:
 * what it is, how urgent, how healthy, who owns it, and what's next.
 */
export function ProjectCard({ project, nextMilestone }: ProjectCardProps) {
  const owner = Array.isArray(project.owner) ? project.owner[0] : project.owner;
  const overdue = project.target_date ? isPast(new Date(project.target_date)) && project.status !== 'completed' : false;

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-primary/50">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <AttentionIndicator active={project.founder_attention_required} />
            <h3 className="font-medium text-foreground">{project.name}</h3>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">P{project.priority_score}</span>
        </div>

        {project.desired_outcome ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{project.desired_outcome}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          <FocusLevelBadge level={project.focus_level} />
          <StatusPill status={project.status} />
          <HealthPill health={project.health as never} />
          {project.category ? (
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{project.category}</span>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
          <span>{owner?.full_name ?? 'Unassigned'}</span>
          {project.target_date ? (
            <span className={overdue ? 'text-red-400' : undefined}>
              {overdue ? 'Overdue' : 'Target'}: {project.target_date}
            </span>
          ) : null}
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
