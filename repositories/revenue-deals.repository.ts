import { createClient } from '@/lib/supabase/server';
import { toOperationalError } from '@/lib/errors';
import type { RevenueDealInput } from '@/schemas/revenue-deal.schema';
import type { RevenueDeal } from '@/features/revenue-war-room/data';

type RevenueDealRow = {
  id: string;
  organization_id: string;
  account: string;
  deal_value: number | string;
  monthly_recurring_revenue: number | string;
  stage: RevenueDeal['stage'];
  probability: number | string;
  next_action: string;
  owner: RevenueDeal['owner'];
  next_action_date: string;
  expected_close_date: string;
  expected_payment_date: string;
  last_moved_date: string;
  blocker: string | null;
};

function rowToDeal(row: RevenueDealRow): RevenueDeal {
  return {
    id: row.id,
    account: row.account,
    dealValue: Number(row.deal_value),
    monthlyRecurringRevenue: Number(row.monthly_recurring_revenue),
    stage: row.stage,
    probability: Number(row.probability),
    nextAction: row.next_action,
    owner: row.owner,
    nextActionDate: row.next_action_date,
    expectedCloseDate: row.expected_close_date,
    expectedPaymentDate: row.expected_payment_date,
    lastMovedDate: row.last_moved_date,
    blocker: row.blocker ?? undefined,
  };
}

function inputToRow(input: RevenueDealInput, organizationId: string, userId?: string) {
  return {
    organization_id: organizationId,
    account: input.account,
    deal_value: input.dealValue,
    monthly_recurring_revenue: input.monthlyRecurringRevenue,
    stage: input.stage,
    probability: input.probability / 100,
    next_action: input.nextAction,
    owner: input.owner,
    next_action_date: input.nextActionDate,
    expected_close_date: input.expectedCloseDate,
    expected_payment_date: input.expectedPaymentDate,
    last_moved_date: input.lastMovedDate,
    blocker: input.blocker ?? null,
    ...(userId ? { created_by: userId } : {}),
  };
}

export const revenueDealsRepository = {
  async listByOrg(organizationId: string): Promise<RevenueDeal[]> {
    const supabase = await createClient();
    const { data, error } = await (supabase as never as { from: (table: string) => any })
      .from('revenue_deals')
      .select(
        'id, organization_id, account, deal_value, monthly_recurring_revenue, stage, probability, next_action, owner, next_action_date, expected_close_date, expected_payment_date, last_moved_date, blocker',
      )
      .eq('organization_id', organizationId)
      .order('expected_payment_date', { ascending: true })
      .order('deal_value', { ascending: false });

    if (error) throw toOperationalError(error, 'Could not load revenue deals.');
    return ((data ?? []) as RevenueDealRow[]).map(rowToDeal);
  },

  async create(organizationId: string, userId: string, input: RevenueDealInput): Promise<RevenueDeal> {
    const supabase = await createClient();
    const { data, error } = await (supabase as never as { from: (table: string) => any })
      .from('revenue_deals')
      .insert(inputToRow(input, organizationId, userId))
      .select()
      .single();

    if (error) throw toOperationalError(error, 'Could not create revenue deal.');
    return rowToDeal(data as RevenueDealRow);
  },

  async update(organizationId: string, dealId: string, input: RevenueDealInput): Promise<RevenueDeal> {
    const supabase = await createClient();
    const { data, error } = await (supabase as never as { from: (table: string) => any })
      .from('revenue_deals')
      .update(inputToRow(input, organizationId))
      .eq('organization_id', organizationId)
      .eq('id', dealId)
      .select()
      .single();

    if (error) throw toOperationalError(error, 'Could not update revenue deal.');
    return rowToDeal(data as RevenueDealRow);
  },

  async delete(organizationId: string, dealId: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await (supabase as never as { from: (table: string) => any })
      .from('revenue_deals')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', dealId);

    if (error) throw toOperationalError(error, 'Could not delete revenue deal.');
  },
};
