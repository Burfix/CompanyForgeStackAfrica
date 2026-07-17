'use server';

import { requireUser, getCurrentOrg } from '@/lib/auth/session';
import { executionReconciliationService, type OrganisationExecutionReconciliationResult } from '@/services/execution-reconciliation.service';
import { revalidatePath } from 'next/cache';

export interface ReconciliationActionState {
  formError?: string;
  result?: OrganisationExecutionReconciliationResult;
}

/**
 * Server Action backing the System Health "Run reconciliation" control —
 * see app/(app)/settings/system-health/page.tsx. Deliberately owner/admin
 * gated at this layer too (not just the API route), since a Server Action
 * is a second, independent entry point into the same service.
 */
export async function runExecutionReconciliationAction(
  _prevState: ReconciliationActionState,
  formData: FormData,
): Promise<ReconciliationActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  if (org.role !== 'owner' && org.role !== 'admin') {
    return { formError: 'Only an organization owner or admin may run execution reconciliation.' };
  }

  const dryRun = formData.get('dryRun') !== 'false';
  const projectIdRaw = formData.get('projectId');
  const projectId = typeof projectIdRaw === 'string' && projectIdRaw.trim() !== '' ? projectIdRaw.trim() : undefined;

  try {
    const result = await executionReconciliationService.reconcileOrganisationExecution(org.organizationId, user.id, {
      dryRun,
      projectId,
    });

    if (!dryRun) {
      revalidatePath('/');
      revalidatePath('/projects');
      revalidatePath('/milestones');
    }

    return { result };
  } catch {
    return { formError: 'Could not complete reconciliation. Please try again.' };
  }
}
