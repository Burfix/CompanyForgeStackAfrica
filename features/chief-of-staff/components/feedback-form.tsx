'use client';

import { useActionState } from 'react';
import { submitBriefingFeedbackAction, type SubmitFeedbackActionState } from '@/features/chief-of-staff/actions';

const initialState: SubmitFeedbackActionState = {};

/** Lightweight feedback control — two one-click ratings plus an optional
 * comment. Writes only to chief_of_staff_feedback (see
 * services/chief-of-staff.service.ts's submitFeedback). */
export function FeedbackForm({ briefingId }: { briefingId: string }) {
  const [state, formAction, isPending] = useActionState(submitBriefingFeedbackAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3">
      <input type="hidden" name="briefingId" value={briefingId} />
      <span className="text-xs text-muted-foreground">Was this briefing useful?</span>
      <button
        type="submit"
        name="feedbackType"
        value="useful"
        disabled={isPending}
        className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:border-primary/50"
      >
        Useful
      </button>
      <button
        type="submit"
        name="feedbackType"
        value="inaccurate"
        disabled={isPending}
        className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:border-primary/50"
      >
        Inaccurate
      </button>
      <button
        type="submit"
        name="feedbackType"
        value="wrong_priority"
        disabled={isPending}
        className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:border-primary/50"
      >
        Wrong priority
      </button>
      <button
        type="submit"
        name="feedbackType"
        value="too_verbose"
        disabled={isPending}
        className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:border-primary/50"
      >
        Too verbose
      </button>
      {state.success ? <span className="text-xs text-green-400">Thanks — recorded.</span> : null}
      {state.formError ? <span className="text-xs text-destructive">{state.formError}</span> : null}
    </form>
  );
}
