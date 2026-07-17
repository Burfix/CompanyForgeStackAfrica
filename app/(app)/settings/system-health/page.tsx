import { redirect } from 'next/navigation';
import { getCurrentOrg } from '@/lib/auth/session';
import { ReconciliationPanel } from '@/features/admin/components/reconciliation-panel';

/**
 * Deliberately NOT in the primary navigation (see app/(app)/layout.tsx) —
 * per Slice 4.5 Part 7, this is a small, owner/admin-only control, not a
 * prominent product surface. Reached by direct URL only for now.
 */
export default async function SystemHealthPage() {
  const org = await getCurrentOrg();

  if (org.role !== 'owner' && org.role !== 'admin') {
    redirect('/');
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">System Health</h1>
        <p className="text-sm text-muted-foreground">
          Execution roll-up reconciliation — recomputes milestone and project progress from eligible tasks/milestones and
          reports any drift from what&rsquo;s stored. Dry run makes no changes.
        </p>
      </div>
      <ReconciliationPanel />
    </div>
  );
}
