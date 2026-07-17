import { notFound } from 'next/navigation';
import { getCurrentOrg } from '@/lib/auth/session';
import { getBriefingById, getBriefingFreshness } from '@/services/chief-of-staff.service';
import { chiefOfStaffRepository } from '@/repositories/chief-of-staff.repository';
import { BriefingView } from '@/features/chief-of-staff/components/briefing-view';
import { NotFoundError } from '@/lib/errors';

export default async function ChiefOfStaffBriefingDetailPage({ params }: { params: Promise<{ briefingId: string }> }) {
  const { briefingId } = await params;
  const org = await getCurrentOrg();

  let briefing;
  try {
    briefing = await getBriefingById(org.organizationId, briefingId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const reconciliation = await chiefOfStaffRepository.loadLastReconciliationRun(org.organizationId);
  const failureCount = (reconciliation?.metadata as { failure_count?: number } | null)?.failure_count ?? 0;
  const freshness = getBriefingFreshness(briefing, briefing.source_latest_activity_at, failureCount === 0);

  return <BriefingView briefing={briefing} freshness={freshness} />;
}
