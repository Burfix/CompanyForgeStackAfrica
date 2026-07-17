import Link from 'next/link';
import { getCurrentOrg } from '@/lib/auth/session';
import { getLatestBriefing, getBriefingFreshness } from '@/services/chief-of-staff.service';
import { chiefOfStaffRepository } from '@/repositories/chief-of-staff.repository';
import { BriefingView } from '@/features/chief-of-staff/components/briefing-view';
import { GenerateBriefingControl } from '@/features/chief-of-staff/components/generate-briefing-control';
import { Button } from '@/components/ui/button';

/**
 * /chief-of-staff — the full read-only briefing view. Renders the latest
 * ready/fallback_ready briefing for the org, or an empty state with a
 * generate control if none exists yet. Nothing on this page can mutate a
 * Project/Milestone/Task (see services/chief-of-staff.service.ts header).
 */
export default async function ChiefOfStaffPage() {
  const org = await getCurrentOrg();
  const canGenerate = org.role === 'owner' || org.role === 'admin';

  const briefing = await getLatestBriefing(org.organizationId);

  if (!briefing) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Chief of Staff</h1>
          <p className="text-sm text-muted-foreground">
            No briefing has been generated yet. Chief of Staff is read-only — it never edits Projects, Milestones, or Tasks;
            it only summarizes what&rsquo;s already recorded.
          </p>
        </div>
        <GenerateBriefingControl canGenerate={canGenerate} />
        {!canGenerate ? <p className="text-xs text-muted-foreground">Only an organization owner or admin can generate a briefing.</p> : null}
      </div>
    );
  }

  const [reconciliation] = await Promise.all([chiefOfStaffRepository.loadLastReconciliationRun(org.organizationId)]);
  const failureCount = (reconciliation?.metadata as { failure_count?: number } | null)?.failure_count ?? 0;
  const freshness = getBriefingFreshness(briefing, briefing.source_latest_activity_at, failureCount === 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <GenerateBriefingControl canGenerate={canGenerate} />
        <Button asChild size="sm" variant="outline">
          <Link href="/chief-of-staff/briefings">Briefing history</Link>
        </Button>
      </div>
      <BriefingView briefing={briefing} freshness={freshness} />
    </div>
  );
}
