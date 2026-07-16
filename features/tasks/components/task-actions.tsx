'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { TASK_STATUS_META, TASK_PRIORITY_META } from '@/features/tasks/constants';
import {
  updateTaskStatusAction,
  updateTaskPriorityAction,
  completeTaskAction,
  reopenTaskAction,
  cancelTaskAction,
} from '@/features/tasks/actions';

/**
 * Status/priority/complete/reopen/cancel controls for the task detail
 * header. Same native-prompt simplification used by ProjectActions for
 * risky transitions (Blocked, Waiting, Cancel, Reopen) — flagged there as
 * an intentional simplification to swap for a styled dialog later, same
 * story here.
 */
export function TaskActions({
  taskId,
  currentStatus,
  currentPriority,
}: {
  taskId: string;
  currentStatus: string;
  currentPriority: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isTerminal = currentStatus === 'completed' || currentStatus === 'cancelled';

  function handleStatusChange(nextStatus: string) {
    setError(null);
    let blockedReason: string | undefined;
    let waitingOn: string | undefined;
    if (nextStatus === 'blocked') {
      const reason = window.prompt('Why is this task blocked?');
      if (!reason) return;
      blockedReason = reason;
    }
    if (nextStatus === 'waiting') {
      const reason = window.prompt('What is this task waiting on?');
      if (!reason) return;
      waitingOn = reason;
    }
    startTransition(async () => {
      const result = await updateTaskStatusAction(taskId, nextStatus, { blockedReason, waitingOn });
      if (result.formError) setError(result.formError);
      else router.refresh();
    });
  }

  function handlePriorityChange(nextPriority: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateTaskPriorityAction(taskId, nextPriority);
      if (result.formError) setError(result.formError);
      else router.refresh();
    });
  }

  function handleComplete() {
    setError(null);
    startTransition(async () => {
      const result = await completeTaskAction(taskId);
      if (result.formError) setError(result.formError);
      else router.refresh();
    });
  }

  function handleReopen() {
    setError(null);
    const confirmed = window.confirm('Reopen this task? It will move back to Planned.');
    if (!confirmed) return;
    startTransition(async () => {
      const result = await reopenTaskAction(taskId, 'planned');
      if (result.formError) setError(result.formError);
      else router.refresh();
    });
  }

  function handleCancel() {
    setError(null);
    const confirmed = window.confirm('Cancel this task? It will be marked as no longer required.');
    if (!confirmed) return;
    startTransition(async () => {
      const result = await cancelTaskAction(taskId);
      if (result.formError) setError(result.formError);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {!isTerminal ? (
          <>
            <select
              value={currentStatus}
              disabled={isPending}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
              aria-label="Change status"
            >
              {Object.entries(TASK_STATUS_META)
                .filter(([value]) => value !== 'completed')
                .map(([value, meta]) => (
                  <option key={value} value={value}>{meta.label}</option>
                ))}
            </select>

            <select
              value={currentPriority}
              disabled={isPending}
              onChange={(e) => handlePriorityChange(e.target.value)}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
              aria-label="Change priority"
            >
              {Object.entries(TASK_PRIORITY_META).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>

            <Button type="button" size="sm" disabled={isPending} onClick={handleComplete}>
              Complete
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={handleCancel}>
              Cancel
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleReopen}>
            Reopen
          </Button>
        )}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
