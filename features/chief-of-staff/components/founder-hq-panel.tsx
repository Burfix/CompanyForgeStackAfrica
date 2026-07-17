import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FRESHNESS_META } from '@/features/chief-of-staff/constants';
import { parseBriefingContent } from '@/features/chief-of-staff/utils';
import { getLatestBriefing, getBriefingFreshness } from '@/services/chief-of-staff.service';
import { chiefOfStaffRepository } from '@/repositories/chief-of-staff.repository';

/**
 * Compact Chief of Staff summary for Founder HQ — top 3 priorities plus a
 * freshness indicator and a link through to the full read-only briefing.
 * Entirely read-only: no generate control lives here (that's on
 * /chief-of-staff itself) so this panel can never trigger an AI call as a
 * side effect of loading the homepage.
 */
export async function FounderHqChiefOfStaffPanel({ organizationId }: { organizationId: string }) {
  const briefing = await getLatestBriefing(organizationId);
  if (!briefing) {
    return (
      <Card>
        <CardHeader><CardTitle>Chief of Staff</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No briefing generated yet.</p>
          <Link href="/chief-of-staff" className="text-xs text-primary hover:underline">
            Generate one →
          </Link>
        </CardContent>
      </Card>
    );
  }

  const reconciliation = await chiefOfStaffRepository.loadLastReconciliationRun(organizationId);
  const failureCount = (reconciliation?.metadata as { failure_count?: number } | null)?.failure_count ?? 0;
  const freshness = getBriefingFreshness(briefing, briefing.source_latest_activity_at, failureCount === 0);
  const freshnessMeta = FRESHNESS_META[freshness];
  const content = parseBriefingContent(briefing);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Chief of Staff</CardTitle>
        <span className={`text-[11px] font-medium ${freshnessMeta.className}`}>{freshnessMeta.label}</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {content.topPriorities.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing requires founder attention right now.</p>
        ) : (
          content.topPriorities.slice(0, 3).map((p) => (
            <div key={p.id} className="rounded-md border border-border px-3 py-2">
              <p className="text-sm text-foreground">{p.title}</p>
              <p className="text-xs text-muted-foreground">{p.reason}</p>
            </div>
          ))
        )}
        <Link href="/chief-of-staff" className="text-xs text-primary hover:underline">
          View full briefing →
        </Link>
      </CardContent>
    </Card>
  );
}
