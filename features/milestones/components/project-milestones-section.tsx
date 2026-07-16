'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { MilestoneStatusPill, MilestoneHealthPill, ProgressBar } from '@/components/shared/status-badge';
import { reorderMilestonesAction, completeMilestoneAction } from '@/features/milestones/actions';

interface ProjectMilestone {
  id: string;
  title: string;
  status: string;
  health: string;
  progress_percent: number;
  due_date: string | null;
}

/**
 * Project detail page's Milestones section. Reordering uses explicit
 * move-up/move-down controls rather than drag-and-drop — the spec is
 * explicit that this is an acceptable simplification when drag-and-drop
 * would add avoidable complexity for a list this size.
 */
export function ProjectMilestonesSection({ projectId, milestones }: { projectId: string; milestones: ProjectMilestone[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [order, setOrder] = useState(milestones);
  const [error, setError] = useState<string | null>(null);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrder(next);
    setError(null);
    startTransition(async () => {
      const result = await reorderMilestonesAction(projectId, next.map((m) => m.id));
      if (result.formError) setError(result.formError);
      else router.refresh();
    });
  }

  function handleComplete(milestoneId: string) {
    setError(null);
    const confirmed = window.confirm('Mark this milestone complete?');
    if (!confirmed) return;
    startTransition(async () => {
      const result = await completeMilestoneAction(milestoneId);
      if (result.formError) setError(result.formError);
      else router.refresh();
    });
  }

  if (order.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">No milestones have been defined for this project yet.</p>
        <Button asChild size="sm">
          <Link href={`/milestones/new?projectId=${projectId}&returnTo=/projects/${projectId}`}>New Milestone</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {order.map((milestone, index) => (
        <div key={milestone.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
          <div className="flex flex-col gap-0.5">
            <Button type="button" variant="ghost" size="sm" className="h-5 px-1 text-xs" disabled={isPending || index === 0} onClick={() => move(index, -1)} aria-label="Move up">
              ▲
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-5 px-1 text-xs" disabled={isPending || index === order.length - 1} onClick={() => move(index, 1)} aria-label="Move down">
              ▼
            </Button>
          </div>
          <Link href={`/milestones/${milestone.id}`} className="flex flex-1 flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{milestone.title}</span>
              <div className="flex items-center gap-1.5">
                <MilestoneStatusPill status={milestone.status} />
                <MilestoneHealthPill health={milestone.health} />
              </div>
            </div>
            <div className="max-w-xs"><ProgressBar percent={milestone.progress_percent} /></div>
          </Link>
          <div className="flex flex-col items-end gap-1">
            {milestone.due_date ? <span className="text-xs text-muted-foreground">{milestone.due_date}</span> : null}
            {milestone.status !== 'completed' && milestone.status !== 'cancelled' ? (
              <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => handleComplete(milestone.id)}>
                Complete
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
