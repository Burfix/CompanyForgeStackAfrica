import { createClient } from '@/lib/supabase/server';
import { toOperationalError } from '@/lib/errors';
import type { TablesInsert, TablesUpdate } from '@/types/database.types';

const PLATFORM_COST_COLUMNS =
  'id, organization_id, vendor, category, billing_frequency, amount, currency, effective_from, cancelled_at, notes, created_by, created_at, updated_at';

export const platformCostsRepository = {
  /** Every active (non-cancelled) line item — powers the Platform Costs
   * panel table. Ordered by category then vendor so the UI groups
   * naturally without a client-side sort. */
  async listActive(organizationId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('platform_costs')
      .select(PLATFORM_COST_COLUMNS)
      .eq('organization_id', organizationId)
      .is('cancelled_at', null)
      .order('category', { ascending: true })
      .order('vendor', { ascending: true });

    if (error) throw toOperationalError(error, 'Could not load platform costs.');
    return data;
  },

  /** Cancelled line items — kept queryable for cost history rather than
   * deleted, same "never hard-delete operational history" convention as
   * milestone/task cancellation. */
  async listCancelled(organizationId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('platform_costs')
      .select(PLATFORM_COST_COLUMNS)
      .eq('organization_id', organizationId)
      .not('cancelled_at', 'is', null)
      .order('cancelled_at', { ascending: false });

    if (error) throw toOperationalError(error, 'Could not load cancelled platform costs.');
    return data;
  },

  /** Canonical full-row read for mutation/cancellation — same convention
   * as milestonesRepository.getMilestoneForMutation. */
  async getCostForMutation(organizationId: string, costId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('platform_costs')
      .select(PLATFORM_COST_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('id', costId)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not load platform cost.');
    return data;
  },

  /** Category rollup for the monthly summary card — reads the
   * security_invoker view created alongside the table, so RLS still
   * applies exactly as if querying platform_costs directly. */
  async getMonthlySummary(organizationId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('platform_costs_monthly_summary')
      .select('category, monthly_amount, line_item_count')
      .eq('organization_id', organizationId);

    if (error) throw toOperationalError(error, 'Could not load the monthly cost summary.');
    return data;
  },

  async create(input: TablesInsert<'platform_costs'>) {
    const supabase = await createClient();
    const { data, error } = await supabase.from('platform_costs').insert(input).select(PLATFORM_COST_COLUMNS).single();
    if (error) throw toOperationalError(error, 'Could not add that cost.');
    return data;
  },

  async update(organizationId: string, costId: string, patch: TablesUpdate<'platform_costs'>) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('platform_costs')
      .update(patch)
      .eq('organization_id', organizationId)
      .eq('id', costId)
      .select(PLATFORM_COST_COLUMNS)
      .single();

    if (error) throw toOperationalError(error, 'Could not update that cost.');
    return data;
  },
};
