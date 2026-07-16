'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser, getCurrentOrg } from '@/lib/auth/session';
import { milestoneService } from '@/services/milestone.service';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { CreateMilestoneInput, UpdateMilestoneInput } from '@/schemas/milestone.schema';

export interface MilestoneActionState {
  formError?: string;
  fieldErrors?: Record<string, string[]>;
  success?: boolean;
  /** Raw echo of whatever was submitted, keyed by form field name —
   * populated only on a failed create/update submission so MilestoneForm
   * can re-seed every field with what the user actually typed instead of
   * resetting to blank. Mirrors the identical fix in
   * features/projects/actions.ts and features/tasks/actions.ts. */
  submittedValues?: Record<string, string | string[]>;
}

function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }
  return fieldErrors;
}

function extractSubmittedValues(formData: FormData): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const key of formData.keys()) {
    const value = formData.get(key);
    if (typeof value === 'string') values[key] = value;
  }
  return values;
}

function revalidateMilestoneViews(milestoneId?: string, projectId?: string) {
  revalidatePath('/');
  revalidatePath('/milestones');
  if (milestoneId) revalidatePath(`/milestones/${milestoneId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

function parseCreateInput(formData: FormData): CreateMilestoneInput {
  const progressPercentRaw = formData.get('progressPercent');
  return {
    title: String(formData.get('title') ?? ''),
    projectId: String(formData.get('projectId') ?? ''),
    description: (formData.get('description') as string) || undefined,
    successCriteria: (formData.get('successCriteria') as string) || undefined,
    ownerId: (formData.get('ownerId') as string) || undefined,
    status: (formData.get('status') as CreateMilestoneInput['status']) || 'pending',
    priority: (formData.get('priority') as CreateMilestoneInput['priority']) || 'medium',
    health: (formData.get('health') as CreateMilestoneInput['health']) || 'unknown',
    healthNote: (formData.get('healthNote') as string) || undefined,
    attentionMode: (formData.get('attentionMode') as CreateMilestoneInput['attentionMode']) || 'no_attention',
    progressMode: (formData.get('progressMode') as CreateMilestoneInput['progressMode']) || 'automatic',
    progressPercent: progressPercentRaw ? Number(progressPercentRaw) : undefined,
    targetValue: (formData.get('targetValue') as string) || undefined,
    currentValue: (formData.get('currentValue') as string) || undefined,
    startDate: (formData.get('startDate') as string) || undefined,
    dueDate: (formData.get('dueDate') as string) || undefined,
    nextReviewAt: (formData.get('nextReviewAt') as string) || undefined,
    blockedReason: (formData.get('blockedReason') as string) || undefined,
    waitingOn: (formData.get('waitingOn') as string) || undefined,
  } as CreateMilestoneInput;
}

export async function createMilestoneAction(_prevState: MilestoneActionState, formData: FormData): Promise<MilestoneActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  let milestone;
  try {
    milestone = await milestoneService.createMilestone(org.organizationId, user.id, parseCreateInput(formData));
  } catch (error) {
    const submittedValues = extractSubmittedValues(formData);
    if (error instanceof z.ZodError) return { fieldErrors: zodFieldErrors(error), submittedValues };
    if (error instanceof BusinessRuleError) return { formError: error.message, submittedValues };
    return { formError: 'Could not create the milestone. Please try again.', submittedValues };
  }

  revalidateMilestoneViews(milestone.id, milestone.project_id);
  const returnTo = formData.get('returnTo');
  redirect(typeof returnTo === 'string' && returnTo ? returnTo : `/milestones/${milestone.id}`);
}

export async function updateMilestoneAction(milestoneId: string, _prevState: MilestoneActionState, formData: FormData): Promise<MilestoneActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  const input = parseCreateInput(formData) as UpdateMilestoneInput;
  let updated;
  try {
    updated = await milestoneService.updateMilestone(org.organizationId, user.id, milestoneId, input);
  } catch (error) {
    const submittedValues = extractSubmittedValues(formData);
    if (error instanceof z.ZodError) return { fieldErrors: zodFieldErrors(error), submittedValues };
    if (error instanceof NotFoundError) return { formError: 'Milestone not found.', submittedValues };
    if (error instanceof BusinessRuleError) return { formError: error.message, submittedValues };
    return { formError: 'Could not update the milestone. Please try again.', submittedValues };
  }

  revalidateMilestoneViews(milestoneId, updated.project_id);
  redirect(`/milestones/${milestoneId}`);
}

export async function updateMilestoneStatusAction(
  milestoneId: string,
  status: string,
  options?: { blockedReason?: string; waitingOn?: string; reason?: string },
): Promise<MilestoneActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  let updated;
  try {
    updated = await milestoneService.updateMilestoneStatus(org.organizationId, user.id, {
      milestoneId,
      status: status as never,
      blockedReason: options?.blockedReason,
      waitingOn: options?.waitingOn,
      reason: options?.reason,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return { fieldErrors: zodFieldErrors(error) };
    if (error instanceof NotFoundError) return { formError: 'Milestone not found.' };
    if (error instanceof BusinessRuleError) return { formError: error.message };
    return { formError: 'Could not update status. Please try again.' };
  }

  revalidateMilestoneViews(milestoneId, updated.project_id);
  return { success: true };
}

export async function completeMilestoneAction(milestoneId: string, reason?: string): Promise<MilestoneActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  let updated;
  try {
    updated = await milestoneService.completeMilestone(org.organizationId, user.id, { milestoneId, reason });
  } catch (error) {
    if (error instanceof NotFoundError) return { formError: 'Milestone not found.' };
    if (error instanceof BusinessRuleError) return { formError: error.message };
    return { formError: 'Could not complete the milestone. Please try again.' };
  }

  revalidateMilestoneViews(milestoneId, updated.project_id);
  return { success: true };
}

export async function reopenMilestoneAction(milestoneId: string, targetStatus: 'pending' | 'in_progress', reason?: string): Promise<MilestoneActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  let updated;
  try {
    updated = await milestoneService.reopenMilestone(org.organizationId, user.id, { milestoneId, targetStatus, reason });
  } catch (error) {
    if (error instanceof NotFoundError) return { formError: 'Milestone not found.' };
    if (error instanceof BusinessRuleError) return { formError: error.message };
    return { formError: 'Could not reopen the milestone. Please try again.' };
  }

  revalidateMilestoneViews(milestoneId, updated.project_id);
  return { success: true };
}

export async function cancelMilestoneAction(milestoneId: string, reason?: string): Promise<MilestoneActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  let updated;
  try {
    updated = await milestoneService.cancelMilestone(org.organizationId, user.id, { milestoneId, reason });
  } catch (error) {
    if (error instanceof NotFoundError) return { formError: 'Milestone not found.' };
    return { formError: 'Could not cancel the milestone. Please try again.' };
  }

  revalidateMilestoneViews(milestoneId, updated.project_id);
  return { success: true };
}

export async function reorderMilestonesAction(projectId: string, orderedMilestoneIds: string[]): Promise<MilestoneActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  try {
    await milestoneService.reorderMilestones(org.organizationId, user.id, { projectId, orderedMilestoneIds });
  } catch (error) {
    if (error instanceof BusinessRuleError) return { formError: error.message };
    return { formError: 'Could not reorder milestones. Please try again.' };
  }

  revalidateMilestoneViews(undefined, projectId);
  return { success: true };
}
