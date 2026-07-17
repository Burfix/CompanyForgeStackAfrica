'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, getCurrentOrg } from '@/lib/auth/session';
import { generateBriefing, submitFeedback } from '@/services/chief-of-staff.service';
import { generateBriefingSchema, submitBriefingFeedbackSchema } from '@/schemas/chief-of-staff.schema';
import { BusinessRuleError } from '@/lib/errors';

export interface GenerateBriefingActionState {
  formError?: string;
  briefingId?: string;
}

/**
 * Server Action backing the manual "Generate briefing" control. Deliberately
 * owner/admin gated — generation costs money (an AI call) and produces a
 * company-wide artifact, so it follows the same role check already used by
 * the System Health reconciliation action (features/admin/actions.ts).
 *
 * This action can never write to projects/milestones/tasks — it only calls
 * services/chief-of-staff.service.ts, whose own header documents the same
 * read-only-of-everything-else boundary.
 */
export async function generateBriefingAction(
  _prevState: GenerateBriefingActionState,
  formData: FormData,
): Promise<GenerateBriefingActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  if (org.role !== 'owner' && org.role !== 'admin') {
    return { formError: 'Only an organization owner or admin may generate a Chief of Staff briefing.' };
  }

  const parsed = generateBriefingSchema.safeParse({
    briefingType: formData.get('briefingType') ?? 'manual',
    force: formData.get('force') === 'true',
  });
  if (!parsed.success) {
    return { formError: 'Invalid request.' };
  }

  try {
    const briefing = await generateBriefing({
      organizationId: org.organizationId,
      organizationName: org.organizationName,
      generatedBy: user.id,
      generationSource: 'manual',
      briefingType: parsed.data.briefingType,
      force: parsed.data.force,
    });

    revalidatePath('/chief-of-staff');
    revalidatePath('/chief-of-staff/briefings');
    revalidatePath('/');

    return { briefingId: briefing.id };
  } catch (error) {
    if (error instanceof BusinessRuleError) {
      return { formError: error.message };
    }
    console.error('[chief-of-staff:generate]', error);
    return { formError: 'Could not generate a briefing right now. Please try again.' };
  }
}

export interface SubmitFeedbackActionState {
  formError?: string;
  success?: boolean;
}

/** Any org member may leave feedback on a briefing — no owner/admin gate. */
export async function submitBriefingFeedbackAction(
  _prevState: SubmitFeedbackActionState,
  formData: FormData,
): Promise<SubmitFeedbackActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  const parsed = submitBriefingFeedbackSchema.safeParse({
    briefingId: formData.get('briefingId'),
    feedbackType: formData.get('feedbackType'),
    rating: formData.get('rating') || undefined,
    comment: formData.get('comment') || undefined,
  });
  if (!parsed.success) {
    return { formError: 'Invalid feedback.' };
  }

  try {
    await submitFeedback({
      organizationId: org.organizationId,
      briefingId: parsed.data.briefingId,
      userId: user.id,
      feedbackType: parsed.data.feedbackType,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
    });
    revalidatePath(`/chief-of-staff/briefings/${parsed.data.briefingId}`);
    return { success: true };
  } catch {
    return { formError: 'Could not record feedback. Please try again.' };
  }
}
