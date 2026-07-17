'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { generateBriefingAction, type GenerateBriefingActionState } from '@/features/chief-of-staff/actions';

const initialState: GenerateBriefingActionState = {};

/** Owner/admin-only manual generation control — the action itself
 * re-checks the role server-side, this is purely the UI affordance. */
export function GenerateBriefingControl({ canGenerate }: { canGenerate: boolean }) {
  const [state, formAction, isPending] = useActionState(generateBriefingAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.briefingId) {
      router.push(`/chief-of-staff/briefings/${state.briefingId}`);
    }
  }, [state.briefingId, router]);

  if (!canGenerate) return null;

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="briefingType" value="manual" />
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? 'Generating…' : 'Generate briefing now'}
      </Button>
      {state.formError ? <span className="text-xs text-destructive">{state.formError}</span> : null}
    </form>
  );
}
