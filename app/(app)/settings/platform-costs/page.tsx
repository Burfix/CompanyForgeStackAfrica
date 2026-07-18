import { redirect } from 'next/navigation';
import { getCurrentOrg } from '@/lib/auth/session';
import { platformCostsRepository } from '@/repositories/platform-costs.repository';
import { platformCostService } from '@/services/platform-cost.service';
import { PlatformCostsPanel } from '@/features/platform-costs/components/platform-costs-panel';

/**
 * Deliberately NOT in the primary navigation (see app/(app)/layout.tsx) —
 * same status as /settings/system-health: a small, owner/admin-only
 * founder tool, not a customer-facing product surface. Reached by direct
 * URL only. This is ForgeStack's own operating cost, never customer data —
 * RLS on platform_costs additionally restricts reads/writes to
 * owner/admin regardless of what this page shows.
 */
export default async function PlatformCostsPage() {
  const org = await getCurrentOrg();

  if (org.role !== 'owner' && org.role !== 'admin') {
    redirect('/');
  }

  const [costs, summary] = await Promise.all([
    platformCostsRepository.listActive(org.organizationId),
    platformCostService.getBurnSummary(org.organizationId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Platform Costs</h1>
        <p className="text-sm text-muted-foreground">
          ForgeStack&rsquo;s own operating burn — infra, tooling, AI, integrations, and people. Not visible to any
          customer organization.
        </p>
      </div>
      <PlatformCostsPanel costs={costs} summary={summary} />
    </div>
  );
}
