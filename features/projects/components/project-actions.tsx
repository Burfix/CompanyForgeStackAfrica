'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PROJECT_STATUS_META, FOCUS_LEVEL_META } from '@/features/projects/constants';
import {
  updateProjectStatusAction,
  updateProjectFocusLevelAction,
  archiveOrParkProjectAction,
} from '@/features/projects/actions';

/**
 * Status/focus/archive controls for the project detail header. Risky
 * transitions (Blocked, Critical, Parked, Critical-limit override) confirm
 * via a native browser prompt/confirm rather than a custom modal — a
 * deliberate simplification for this slice (see Slice 2 completion
 * report). Native prompts are fully keyboard-accessible; the follow-up is
 * swapping them for styled dialogs using the already-installed Radix
 * Dialog primitive, not a functional gap.
 */
export function ProjectActions({
  projectId,
  currentStatus,
  currentFocusLevel,
}: {
  projectId: string;
  currentStatus: string;
  currentFocusLevel: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleStatusChange(nextStatus: string) {
    setError(null);
    let blockedReason: string | undefined;
    if (nextStatus === 'blocked') {
      const reason = window.prompt('Why is this project blocked?');
      if (!reason) return;
      blockedReason = reason;
    }
    startTransition(async () => {
      const result = await updateProjectStatusAction(projectId, nextStatus, { blockedReason });
      if (result.formError) setError(result.formError);
      else router.refresh();
    });
  }

  function handleFocusChange(nextLevel: number) {
    setError(null);
    let reason: string | undefined;
    if (nextLevel === 1) {
      const input = window.prompt('Why is this project becoming Critical?');
      if (!input) return;
      reason = input;
    }
    startTransition(async () => {
      const result = await updateProjectFocusLevelAction(projectId, nextLevel, { reason });
      if (result.requiresOverride) {
        const confirmed = window.confirm(`${result.formError}\n\nContinue anyway?`);
        if (!confirmed) return;
        const overrideReason = window.prompt('Reason for exceeding the Critical project limit:');
        if (!overrideReason) return;
        const retry = await updateProjectFocusLevelAction(projectId, nextLevel, {
          reason,
          overrideCriticalLimit: true,
          overrideReason,
        });
        if (retry.formError) setError(retry.formError);
        else router.refresh();
        return;
      }
      if (result.formError) setError(result.formError);
      else router.refresh();
    });
  }

  function handlePark() {
    setError(null);
    const reason = window.prompt('Why are you parking this project?');
    if (!reason) return;
    startTransition(async () => {
      const result = await archiveOrParkProjectAction(projectId, 'park', reason);
      if (result.formError) setError(result.formError);
      else router.refresh();
    });
  }

  function handleArchive() {
    setError(null);
    const confirmed = window.confirm('Archive this project? It will be hidden from the portfolio view.');
    if (!confirmed) return;
    startTransition(async () => {
      const result = await archiveOrParkProjectAction(projectId, 'archive');
      if (result.formError) setError(result.formError);
      else router.push('/projects');
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={currentStatus}
          disabled={isPending}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
          aria-label="Change status"
        >
          {Object.entries(PROJECT_STATUS_META).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </select>

        <select
          value={currentFocusLevel}
          disabled={isPending}
          onChange={(e) => handleFocusChange(Number(e.target.value))}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
          aria-label="Change focus level"
        >
          {Object.entries(FOCUS_LEVEL_META).map(([level, meta]) => (
            <option key={level} value={level}>
              L{level} · {meta.label}
            </option>
          ))}
        </select>

        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handlePark}>
          Park
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={handleArchive}>
          Archive
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
