'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { MILESTONE_STATUS_META, isValidMilestoneStatusTransition } from '@/features/milestones/constants';
import {
  updateMilestoneStatusAction,
  completeMilestoneAction,
  reopenMilestoneAction,
  cancelMilestoneAction,
} from '@/features/milestones/actions';
import type { MilestoneStatus } from '@/schemas/milestone.schema';

const OPEN_TRANSITION_TARGETS: MilestoneStatus[] = ['pending', 'in_progress', 'blocked', 'waiting', 'missed'];

/**
 * Status/complete/reopen/cancel controls for the milestone detail header.
 * Completion and reopening are dedicated actions (never a bare status
 * change) so completed_at is always server-timestamped — see
 * completeMilestone/reopenMilestone in milestone.service.ts. Native
 * prompt/confirm for reason capture, same deliberate simplification as
 * ProjectActions (see that file's comment) — a styled dialog is a
 * follow-up, not a functional gap.
 */
export function MilestoneActions({ milestoneId, currentStatus }: { milestoneId: string; currentStatus: MilestoneStatus | string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isTerminal = currentStatus === 'completed' || currentStatus === 'cancelled';

  function handleStatusChange(nextStatus: string) {
    setError(null);
    let blockedReason: string | undefined;
    let waitingOn: string | undefined;
    if (nextStatus === 'blocked') {
      const reason = window.prompt('Why is this milestone blocked?');
      if (!reason) return;
      blockedReason = reason;
    }
    if (nextStatus === 'waiting') {
      const on = window.prompt('What is this milestone waiting on?');
      if (!on) return;
      waitingOn = on;
    }
    startTransition(async () => {
      const result = await updateMilestoneStatusAction(milestoneId, nextStatus, { blockedReason, waitingOn });
      if (result.formError) setError(result.formError);
      else router.refresh();
    });
  }

  function handleComplete() {
    setError(null);
    const confirmed = window.confirm('Mark this milestone complete? Progress will be set to 100%.');
    if (!confirmed) return;
    startTransition(async () => {
      const result = await completeMilestoneAction(milestoneId);
      if (result.formError) setError(result.formError);
      else router.refresh();
    });
  }

  function handleReopen() {
    setError(null);
    startTransition(async () => {
      const result = await reopenMilestoneAction(milestoneId, 'in_progress');
      if (result.formError) setError(result.formError);
      else router.refresh();
    });
  }

  function handleCancel() {
    setError(null);
    const reason = window.prompt('Why is this milestone being cancelled? (optional)') ?? undefined;
    const confirmed = window.confirm('Cancel this milestone? It will be excluded from project progress roll-ups.');
    if (!confirmed) return;
    startTransition(async () => {
      const result = await cancelMilestoneAction(milestoneId, reason);
      if (result.formError) setError(result.formError);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {isTerminal ? (
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleReopen}>
            Reopen
          </Button>
        ) : (
          <>
            <select
              value={currentStatus}
              disabled={isPending}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
              aria-label="Change status"
            >
              {OPEN_TRANSITION_TARGETS.filter((status) => status === currentStatus || isValidMilestoneStatusTransition(currentStatus as MilestoneStatus, status)).map((status) => (
                <option key={status} value={status}>
                  {MILESTONE_STATUS_META[status].label}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" disabled={isPending} onClick={handleComplete}>
              Complete
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={handleCancel}>
              Cancel
            </Button>
          </>
        )}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
