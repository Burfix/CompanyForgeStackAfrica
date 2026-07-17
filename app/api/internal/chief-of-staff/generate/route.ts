import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireUser, getCurrentOrg } from '@/lib/auth/session';
import { generateBriefing } from '@/services/chief-of-staff.service';
import { generateBriefingSchema } from '@/schemas/chief-of-staff.schema';
import { BusinessRuleError } from '@/lib/errors';

/**
 * POST /api/internal/chief-of-staff/generate
 *
 * Route-handler entry point for briefing generation, alongside the
 * features/chief-of-staff/actions.ts Server Action — this exists for the
 * daily scheduled generation (invoked by a cron/scheduler, not the UI) and
 * for parity with the existing internal reconciliation route's security
 * posture:
 *  - authentication required before anything else runs
 *  - organization is resolved server-side from the session, never from
 *    the request body
 *  - only 'owner' or 'admin' may invoke this
 *  - every response carries a request id; no raw error ever reaches the
 *    caller
 */
export async function POST(request: Request) {
  const requestId = randomUUID();

  const user = await requireUser();
  const org = await getCurrentOrg();

  if (org.role !== 'owner' && org.role !== 'admin') {
    return NextResponse.json(
      { requestId, error: 'FORBIDDEN', message: 'Only an organization owner or admin may generate a Chief of Staff briefing.' },
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

  const parsed = generateBriefingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { requestId, error: 'VALIDATION_ERROR', message: 'Invalid request.', fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const briefing = await generateBriefing({
      organizationId: org.organizationId,
      organizationName: org.organizationName,
      userId: user.id,
      briefingType: parsed.data.briefingType,
      force: parsed.data.force,
    });

    return NextResponse.json({ requestId, briefingId: briefing.id, status: briefing.status });
  } catch (error) {
    if (error instanceof BusinessRuleError) {
      return NextResponse.json({ requestId, error: error.code, message: error.message }, { status: 409 });
    }
    console.error(`[chief-of-staff-generate:${requestId}]`, error);
    return NextResponse.json(
      { requestId, error: 'GENERATION_FAILED', message: 'Could not generate a briefing right now. Please try again.' },
      { status: 500 },
    );
  }
}
