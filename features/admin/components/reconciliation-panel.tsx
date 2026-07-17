'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { runExecutionReconciliationAction, type ReconciliationActionState } from '@/features/admin/actions';

const initialState: ReconciliationActionState = {};

/**
 * Manual reconciliation control for /settings/system-health. Defaults to
 * dry run — a founder can see exactly what would change before ever
 * committing a write, per Slice 4.5 Part 14 ("dry-run mode is strongly
 * preferred").
 */
export function ReconciliationPanel() {
  const [state, formAction, isPending] = useActionState(runExecutionReconciliationAction, initialState);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="projectId" className="text-xs text-muted-foreground">
            Project ID (optional — leave blank for the whole organization)
          </label>
          <input
            id="projectId"
            name="projectId"
            placeholder="Leave blank for all projects"
            className="h-8 w-80 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
          />
        </div>
        <Button type="submit" name="dryRun" value="true" size="sm" variant="outline" disabled={isPending}>
          Run dry run
        </Button>
        <Button
          type="submit"
          name="dryRun"
          value="false"
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={(e) => {
            if (!window.confirm('Apply corrections to production data? This will write updated progress values and log one reconciliation activity event.')) {
              e.preventDefault();
            }
          }}
        >
          Apply corrections
        </Button>
      </form>

      {state.formError ? <p className="text-xs text-destructive">{state.formError}</p> : null}

      {state.result ? (
        <div className="flex flex-col gap-2 text-sm text-foreground">
          <p className="font-medium">
            {state.result.dryRun ? 'Dry run — no changes were written.' : 'Reconciliation applied.'}
          </p>
          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            <li>Projects checked: {state.result.projectsChecked}</li>
            <li>Milestones checked: {state.result.milestonesChecked}</li>
            <li>Milestone corrections: {state.result.milestoneCorrections}</li>
            <li>Project corrections: {state.result.projectCorrections}</li>
            <li>Failures: {state.result.failures.length}</li>
          </ul>
          {state.result.failures.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-destructive">Failed projects:</p>
              {state.result.failures.map((f) => (
                <p key={f.projectId} className="text-xs text-destructive">
                  {f.projectId}: {f.message}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
