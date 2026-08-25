'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, getCurrentOrg } from '@/lib/auth/session';
import { revenueDealSchema, type RevenueDealInput } from '@/schemas/revenue-deal.schema';
import { revenueDealsRepository } from '@/repositories/revenue-deals.repository';

function parseInput(formData: FormData): RevenueDealInput {
  return revenueDealSchema.parse({
    account: formData.get('account'),
    dealValue: formData.get('dealValue'),
    monthlyRecurringRevenue: formData.get('monthlyRecurringRevenue'),
    stage: formData.get('stage'),
    probability: formData.get('probability'),
    nextAction: formData.get('nextAction'),
    owner: formData.get('owner'),
    nextActionDate: formData.get('nextActionDate'),
    expectedCloseDate: formData.get('expectedCloseDate'),
    expectedPaymentDate: formData.get('expectedPaymentDate'),
    lastMovedDate: formData.get('lastMovedDate'),
    blocker: formData.get('blocker'),
  });
}

function revalidateRevenueWarRoom() {
  revalidatePath('/');
  revalidatePath('/revenue-war-room');
}

export async function createRevenueDealAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  await revenueDealsRepository.create(org.organizationId, user.id, parseInput(formData));

  revalidateRevenueWarRoom();
}

export async function updateRevenueDealAction(dealId: string, formData: FormData): Promise<void> {
  await requireUser();
  const org = await getCurrentOrg();

  await revenueDealsRepository.update(org.organizationId, dealId, parseInput(formData));

  revalidateRevenueWarRoom();
}

export async function deleteRevenueDealAction(dealId: string, _formData?: FormData): Promise<void> {
  await requireUser();
  const org = await getCurrentOrg();

  await revenueDealsRepository.delete(org.organizationId, dealId);

  revalidateRevenueWarRoom();
}
