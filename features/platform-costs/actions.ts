'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser, getCurrentOrg } from '@/lib/auth/session';
import { platformCostService } from '@/services/platform-cost.service';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { CreatePlatformCostInput } from '@/schemas/platform-cost.schema';

export interface PlatformCostActionState {
  formError?: string;
  fieldErrors?: Record<string, string[]>;
  success?: boolean;
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

function parseCreateInput(formData: FormData): CreatePlatformCostInput {
  return {
    vendor: String(formData.get('vendor') ?? ''),
    category: formData.get('category') as CreatePlatformCostInput['category'],
    billingFrequency: (formData.get('billingFrequency') as CreatePlatformCostInput['billingFrequency']) || 'monthly',
    amount: Number(formData.get('amount') ?? 0),
    currency: String(formData.get('currency') ?? 'USD'),
    effectiveFrom: (formData.get('effectiveFrom') as string) || undefined,
    notes: (formData.get('notes') as string) || undefined,
  } as CreatePlatformCostInput;
}

/**
 * Deliberately owner/admin gated at this layer too (not just RLS) — same
 * rule as runExecutionReconciliationAction in features/admin/actions.ts,
 * since a Server Action is a second, independent entry point into the
 * same service and cost data is founder-only, not general org data.
 */
async function assertCostAdmin() {
  const org = await getCurrentOrg();
  if (org.role !== 'owner' && org.role !== 'admin') {
    throw new BusinessRuleError('Only an organization owner or admin may manage platform costs.', 'NOT_ADMIN');
  }
  return org;
}

export async function createPlatformCostAction(
  _prevState: PlatformCostActionState,
  formData: FormData,
): Promise<PlatformCostActionState> {
  const user = await requireUser();

  let org;
  try {
    org = await assertCostAdmin();
  } catch (error) {
    if (error instanceof BusinessRuleError) return { formError: error.message };
    throw error;
  }

  try {
    await platformCostService.createCost(org.organizationId, user.id, parseCreateInput(formData));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { fieldErrors: zodFieldErrors(error), submittedValues: extractSubmittedValues(formData) };
    }
    if (error instanceof BusinessRuleError) {
      return { formError: error.message, submittedValues: extractSubmittedValues(formData) };
    }
    return { formError: 'Could not add that cost. Please try again.', submittedValues: extractSubmittedValues(formData) };
  }

  revalidatePath('/settings/platform-costs');
  return { success: true };
}

export async function cancelPlatformCostAction(costId: string): Promise<PlatformCostActionState> {
  const user = await requireUser();

  let org;
  try {
    org = await assertCostAdmin();
  } catch (error) {
    if (error instanceof BusinessRuleError) return { formError: error.message };
    throw error;
  }

  try {
    await platformCostService.cancelCost(org.organizationId, user.id, { costId });
  } catch (error) {
    if (error instanceof NotFoundError) return { formError: error.message };
    if (error instanceof BusinessRuleError) return { formError: error.message };
    return { formError: 'Could not cancel that cost. Please try again.' };
  }

  revalidatePath('/settings/platform-costs');
  return { success: true };
}
