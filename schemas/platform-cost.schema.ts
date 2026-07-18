import { z } from 'zod';

/**
 * App-level category vocabulary. Mirrors the CHECK constraint on
 * platform_costs.category in migration `add_platform_costs` — kept as a
 * plain checked list (not a Postgres enum) deliberately, same choice the
 * chief_of_staff_briefings table made for briefing_type/status, since this
 * list is expected to grow as new vendor types show up and a checked text
 * column is a one-line migration to extend, not a type change.
 */
export const PLATFORM_COST_CATEGORY_VALUES = [
  'infra',
  'ai_llm',
  'integration',
  'observability',
  'comms',
  'dev_tooling',
  'people',
  'other',
] as const;
export const platformCostCategorySchema = z.enum(PLATFORM_COST_CATEGORY_VALUES);
export type PlatformCostCategory = z.infer<typeof platformCostCategorySchema>;

export const PLATFORM_COST_BILLING_FREQUENCY_VALUES = ['monthly', 'annual'] as const;
export const platformCostBillingFrequencySchema = z.enum(PLATFORM_COST_BILLING_FREQUENCY_VALUES);
export type PlatformCostBillingFrequency = z.infer<typeof platformCostBillingFrequencySchema>;

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

/**
 * Shared field shape for create/update. `organizationId` is never part of
 * this schema — resolved server-side via `getCurrentOrg()`, same rule as
 * every other entity in this codebase (projects, tasks, milestones).
 * `cancelledAt` is likewise never accepted here — only cancelPlatformCost
 * ever sets it, server-side, same pattern as milestone `completedAt`.
 */
const platformCostFieldsSchema = {
  vendor: z.string().trim().min(1, 'Vendor name is required').max(200),
  category: platformCostCategorySchema,
  billingFrequency: platformCostBillingFrequencySchema.default('monthly'),
  amount: z.coerce.number().nonnegative('Amount cannot be negative').max(10_000_000, 'That amount looks too large — double-check it.'),
  currency: z.string().trim().length(3, 'Use a 3-letter currency code, e.g. USD').default('USD'),
  effectiveFrom: z.string().date().optional(),
  notes: optionalText(1000),
};

export const createPlatformCostSchema = z.object(platformCostFieldsSchema);
export type CreatePlatformCostInput = z.infer<typeof createPlatformCostSchema>;

export const updatePlatformCostSchema = z.object(
  Object.fromEntries(
    Object.entries(platformCostFieldsSchema).map(([key, value]) => [key, (value as z.ZodTypeAny).optional()]),
  ) as { [K in keyof typeof platformCostFieldsSchema]: z.ZodOptional<(typeof platformCostFieldsSchema)[K]> },
);
export type UpdatePlatformCostInput = z.infer<typeof updatePlatformCostSchema>;

/** `cancelledAt` is deliberately not accepted here — the service sets it. */
export const cancelPlatformCostSchema = z.object({
  costId: z.string().uuid(),
});
export type CancelPlatformCostInput = z.infer<typeof cancelPlatformCostSchema>;

export const setActiveSitesSchema = z.object({
  activeSites: z.coerce.number().int().min(0).max(100_000),
});
export type SetActiveSitesInput = z.infer<typeof setActiveSitesSchema>;
