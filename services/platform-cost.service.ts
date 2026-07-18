import { platformCostsRepository } from '@/repositories/platform-costs.repository';
import { activityRepository } from '@/repositories/activity.repository';
import { NotFoundError } from '@/lib/errors';
import {
  createPlatformCostSchema,
  updatePlatformCostSchema,
  cancelPlatformCostSchema,
  type CreatePlatformCostInput,
  type UpdatePlatformCostInput,
  type CancelPlatformCostInput,
} from '@/schemas/platform-cost.schema';
import type { Tables, TablesInsert, TablesUpdate, Json } from '@/types/database.types';

type PlatformCostRow = Tables<'platform_costs'>;

async function assertCostInOrg(organizationId: string, costId: string): Promise<PlatformCostRow> {
  const cost = await platformCostsRepository.getCostForMutation(organizationId, costId);
  if (!cost) {
    // Same "never confirm which" behavior as every other entity: identical
    // message whether the row doesn't exist or belongs to another org.
    throw new NotFoundError('Cost record not found.');
  }
  return cost as unknown as PlatformCostRow;
}

async function recordCostActivity(params: {
  organizationId: string;
  actorId: string;
  costId: string;
  eventType: string;
  title: string;
  metadata: Record<string, unknown>;
}) {
  await activityRepository.record({
    organization_id: params.organizationId,
    actor_id: params.actorId,
    event_type: params.eventType,
    entity_type: 'platform_cost',
    entity_id: params.costId,
    title: params.title,
    metadata: { cost_id: params.costId, performed_by_user_id: params.actorId, ...params.metadata } as Json,
  });
}

export const platformCostService = {
  async createCost(organizationId: string, actorId: string, rawInput: CreatePlatformCostInput) {
    const input = createPlatformCostSchema.parse(rawInput);

    const insert: TablesInsert<'platform_costs'> = {
      organization_id: organizationId,
      created_by: actorId,
      vendor: input.vendor,
      category: input.category,
      billing_frequency: input.billingFrequency,
      amount: input.amount,
      currency: input.currency.toUpperCase(),
      effective_from: input.effectiveFrom ?? new Date().toISOString().slice(0, 10),
      notes: input.notes ?? null,
    };

    const cost = await platformCostsRepository.create(insert);

    await recordCostActivity({
      organizationId,
      actorId,
      costId: cost.id,
      eventType: 'platform_cost.created',
      title: `Cost added: ${cost.vendor} (${cost.currency} ${cost.amount}/${cost.billing_frequency === 'annual' ? 'yr' : 'mo'})`,
      metadata: { action: 'created', category: cost.category },
    });

    return cost;
  },

  async updateCost(organizationId: string, actorId: string, costId: string, rawInput: UpdatePlatformCostInput) {
    const existing = await assertCostInOrg(organizationId, costId);
    const input = updatePlatformCostSchema.parse(rawInput);

    const patch: TablesUpdate<'platform_costs'> = {};
    if (input.vendor !== undefined) patch.vendor = input.vendor;
    if (input.category !== undefined) patch.category = input.category;
    if (input.billingFrequency !== undefined) patch.billing_frequency = input.billingFrequency;
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.currency !== undefined) patch.currency = input.currency.toUpperCase();
    if (input.effectiveFrom !== undefined) patch.effective_from = input.effectiveFrom;
    if (input.notes !== undefined) patch.notes = input.notes ?? null;

    if (Object.keys(patch).length === 0) {
      // No-op submission — write nothing, log nothing.
      return existing;
    }

    const updated = await platformCostsRepository.update(organizationId, costId, patch);

    await recordCostActivity({
      organizationId,
      actorId,
      costId,
      eventType: 'platform_cost.updated',
      title: `Cost updated: ${updated.vendor}`,
      metadata: { action: 'updated', changed_fields: Object.keys(patch) },
    });

    return updated;
  },

  /** Soft-cancel — the row stays in history for trend/audit purposes, same
   * "never hard-delete operational history" rule as milestones/tasks. */
  async cancelCost(organizationId: string, actorId: string, rawInput: CancelPlatformCostInput) {
    const input = cancelPlatformCostSchema.parse(rawInput);
    const existing = await assertCostInOrg(organizationId, input.costId);

    if (existing.cancelled_at) return existing;

    const cancelledAt = new Date().toISOString().slice(0, 10);
    const updated = await platformCostsRepository.update(organizationId, input.costId, { cancelled_at: cancelledAt });

    await recordCostActivity({
      organizationId,
      actorId,
      costId: input.costId,
      eventType: 'platform_cost.cancelled',
      title: `Cost cancelled: ${existing.vendor}`,
      metadata: { action: 'cancelled', cancelled_at: cancelledAt },
    });

    return updated;
  },

  /**
   * Rolls the category summary view up into a single true-monthly-burn
   * figure (annual costs amortized ÷12 are already handled inside the SQL
   * view itself — see migration `add_platform_costs`). This function only
   * sums what the view already computed; it never re-derives amortization
   * logic in application code, so there is exactly one place that decides
   * how an annual cost becomes a monthly figure.
   */
  async getBurnSummary(organizationId: string) {
    const rows = await platformCostsRepository.getMonthlySummary(organizationId);
    const totalMonthly = rows.reduce((sum, row) => sum + (row.monthly_amount ?? 0), 0);
    return {
      totalMonthly,
      byCategory: rows.map((row) => ({
        category: row.category as string,
        monthlyAmount: row.monthly_amount ?? 0,
        lineItemCount: row.line_item_count ?? 0,
      })),
    };
  },
};
