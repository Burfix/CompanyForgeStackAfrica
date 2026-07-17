import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireUser, getCurrentOrg } from '@/lib/auth/session';
import { executionReconciliationService } from '@/services/execution-reconciliation.service';
import { NotFoundError } from '@/lib/errors';

/**
 * POST /api/internal/execution/reconcile
 *
 * Manual, admin-triggered reconciliation of milestone/project progress
 * roll-ups (Slice 4.5, Part 7). Deliberately NOT wired to any scheduler —
 * this is the human-in-the-loop repair path, invoked from the
 * System Health settings control (see app/(app)/settings/system-health).
 *
 * Security posture:
 *  - authentication is required (requireUser) before anything else runs
 *  - the organisation is resolved server-side from the session
 *    (getCurrentOrg) — organization_id is NEVER accepted from the request
 *    body, so a caller can never point this at another org's data
 *  - only 'owner' or 'admin' org roles may invoke this — 'member'/'viewer'
 *    get a 403 before the service layer is ever touched
 *  - an optional `projectId` narrows the run to one project; it is
 *    validated as a UUID and, like every other mutation in this codebase,
 *    resolved through an org-scoped repository read, so a foreign-org
 *    project id fails closed as "not found" rather than leaking anything
 *  - `dryRun` defaults to true — callers must explicitly opt into writes
 *  - every response carries a request id for support/observability, and
 *    no raw database error or stack trace is ever included in the body
 */

const RequestBodySchema = z.object({
  projectId: z.string().uuid().optional(),
  dryRun: z.boolean().optional().default(true),
  batchSize: z.number().int().min(1).max(50).optional(),
});

export async function POST(request: Request) {
  const requestId = randomUUID();

  const user = await requireUser();
  const org = await getCurrentOrg();

  if (org.role !== 'owner' && org.role !== 'admin') {
    return NextResponse.json(
      { requestId, error: 'FORBIDDEN', message: 'Only an organization owner or admin may run execution reconciliation.' },
      { status: 403 },
    );
  }

  let body: unknown = {};
  try {
    const raw = await request.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ requestId, error: 'INVALID_BODY', message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = RequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { requestId, error: 'VALIDATION_ERROR', message: 'Invalid request.', fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const result = await executionReconciliationService.reconcileOrganisationExecution(org.organizationId, user.id, {
      dryRun: parsed.data.dryRun,
      projectId: parsed.data.projectId,
      batchSize: parsed.data.batchSize,
    });

    return NextResponse.json({ requestId, ...result });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ requestId, error: 'NOT_FOUND', message: error.message }, { status: 404 });
    }
    // Never surface a raw driver/infrastructure error to the caller —
    // the real cause is still logged server-side by Next.js/Vercel with
    // the request id for correlation.
    console.error(`[execution-reconcile:${requestId}]`, error);
    return NextResponse.json(
      { requestId, error: 'RECONCILIATION_FAILED', message: 'Could not complete reconciliation. Please try again.' },
      { status: 500 },
    );
  }
}
