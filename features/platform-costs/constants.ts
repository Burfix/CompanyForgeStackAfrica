import type { PlatformCostCategory, PlatformCostBillingFrequency } from '@/schemas/platform-cost.schema';

export const PLATFORM_COST_CATEGORY_META: Record<PlatformCostCategory, { label: string }> = {
  infra: { label: 'Infra' },
  ai_llm: { label: 'AI / LLM' },
  integration: { label: 'Integration' },
  observability: { label: 'Observability' },
  comms: { label: 'Comms' },
  dev_tooling: { label: 'Dev Tooling' },
  people: { label: 'People' },
  other: { label: 'Other' },
};

export const PLATFORM_COST_FREQUENCY_META: Record<PlatformCostBillingFrequency, { label: string; suffix: string }> = {
  monthly: { label: 'Monthly', suffix: '/mo' },
  annual: { label: 'Annual', suffix: '/yr' },
};
