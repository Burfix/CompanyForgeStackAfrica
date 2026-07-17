import { NextResponse } from 'next/server';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { organizationsRepository } from '@/repositories/organizations.repository';
import { generateScheduledDailyBriefing } from '@/services/chief-of-staff.service';
import { isValidTimeZone } from '@/lib/chief-of-staff-timezone';
import { NotFoundError } from '@/lib/errors';

/**
 * GET /api/cron/chief-of-staff
 *
 * Unattended daily Chief of Staff briefing generation (Slice 5.1),
 * invoked by Vercel Cron (see vercel.json) — never by a browser.
 *
 * This route is DELIBERATELY separate from the existing browser-session
 * manual generation route (POST /api/internal/chief-of-staff/generate).
 * It never calls requireUser()/getCurrentOrg() and has no concept of a
 * signed-in user; every safeguard here is either the CRON_SECRET check
 * below or explicit server-side configuration (never anything read from
 * the incoming request). The manual route is untouched and still requires
 * an authenticated owner/admin exactly as before.
 *
 * Security posture:
 *  - GET only, matching Vercel Cron's invocation method.
 *  - `force-dynamic` + `revalidate = 0`: never cached, every invocation
 *    actually runs.
 *  - Authentication is a single exact-match bearer token compare against
 *    CRON_SECRET, using a fixed-length digest comparison via
 *    node:crypto.timingSafeEqual so response timing doesn't leak whether
 *    a prefix matched. Missing secret, missing header, wrong scheme, or
 *    wrong value are all indistinguishable 401s with a generic body — the
 *    response never reveals which failure mode occurred.
 *  - The target organisation is never read from the request (no query
 *    param, header, cookie, or body is consulted for it) — it comes
 *    exclusively from CHIEF_OF_STAFF_CRON_ORGANIZATION_ID, validated as a
 *    UUID and confirmed to reference a real organisation before any
 *    generation work begins.
 *  - The route itself never touches Projects/Milestones/Tasks — it only
 *    calls generateScheduledDailyBriefing, whose own service file
 *    documents the identical read-only-of-everything-else boundary as the
 *    rest of Slice 5.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs'; // node:crypto (timingSafeEqual) requires the Node runtime, not Edge.
export const maxDuration = 60;

type CronErrorCode =
  | 'CHIEF_OF_STAFF_CRON_UNAUTHORIZED'
  | 'CHIEF_OF_STAFF_CRON_NOT_CONFIGURED'
  | 'CHIEF_OF_STAFF_CRON_ORGANIZATION_INVALID'
  | 'CHIEF_OF_STAFF_CRON_FAILED';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fixed-length digest comparison — never compares raw variable-length
 * strings directly (which would let `timingSafeEqual` throw on a length
 * mismatch, or a naive `===` leak timing by input length). Hashing both
 * sides to a 32-byte SHA-256 digest first means the comparison is always
 * equal-length and constant-time regardless of the actual secret length. */
function safeEqual(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a).digest();
  const digestB = createHash('sha256').update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

function jsonError(requestId: string, error: CronErrorCode, status: number) {
  return NextResponse.json({ ok: false, error, requestId }, { status });
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  const startedAt = Date.now();

  console.log(`[chief-of-staff-cron:${requestId}] request received`);

  // --- 1. Authentication -------------------------------------------------
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Fail closed: an unconfigured secret must never be treated as "no
    // auth required." Logged as a configuration problem, not an auth
    // attempt, but the response to the caller is identical to any other
    // 401 so nothing about the server's configuration is observable.
    console.error(`[chief-of-staff-cron:${requestId}] CRON_SECRET is not configured`);
    return jsonError(requestId, 'CHIEF_OF_STAFF_CRON_UNAUTHORIZED', 401);
  }

  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${cronSecret}`;
  if (!authHeader || !authHeader.startsWith('Bearer ') || !safeEqual(authHeader, expected)) {
    return jsonError(requestId, 'CHIEF_OF_STAFF_CRON_UNAUTHORIZED', 401);
  }

  console.log(`[chief-of-staff-cron:${requestId}] authentication accepted`);

  // --- 2. Configuration ----------------------------------------------------
  // Organisation and timezone come exclusively from server environment
  // configuration — never from query params, headers, cookies, or the
  // request body. There is no "first organisation in the database"
  // fallback: this version schedules exactly one configured organisation.
  // Multi-organisation scheduling is out of scope for this slice.
  const organizationId = process.env.CHIEF_OF_STAFF_CRON_ORGANIZATION_ID;
  const timeZone = process.env.CHIEF_OF_STAFF_TIME_ZONE;

  if (!organizationId || !timeZone) {
    console.error(`[chief-of-staff-cron:${requestId}] missing configuration (organizationId or timeZone)`);
    return jsonError(requestId, 'CHIEF_OF_STAFF_CRON_NOT_CONFIGURED', 500);
  }

  if (!UUID_PATTERN.test(organizationId)) {
    console.error(`[chief-of-staff-cron:${requestId}] CHIEF_OF_STAFF_CRON_ORGANIZATION_ID is not a valid UUID`);
    return jsonError(requestId, 'CHIEF_OF_STAFF_CRON_ORGANIZATION_INVALID', 500);
  }

  if (!isValidTimeZone(timeZone)) {
    console.error(`[chief-of-staff-cron:${requestId}] CHIEF_OF_STAFF_TIME_ZONE is not a valid IANA timezone`);
    return jsonError(requestId, 'CHIEF_OF_STAFF_CRON_NOT_CONFIGURED', 500);
  }

  let organizationName: string;
  try {
    // Service-role read: no Supabase-authenticated session exists for a
    // cron invocation, so RLS (which depends on auth.uid()) cannot
    // evaluate — this is the same narrow, documented exception described
    // in repositories/organizations.repository.ts. Organisation
    // *authorization* here is the explicit env var above, resolved
    // server-side only; this call merely confirms that id refers to a
    // real organisation before any generation work begins.
    const organization = await organizationsRepository.getById(organizationId, true);
    organizationName = organization.name;
  } catch {
    console.error(`[chief-of-staff-cron:${requestId}] configured organization ${organizationId} could not be loaded`);
    return jsonError(requestId, 'CHIEF_OF_STAFF_CRON_ORGANIZATION_INVALID', 500);
  }

  console.log(`[chief-of-staff-cron:${requestId}] target organisation resolved`);

  // --- 3. Generation -------------------------------------------------------
  try {
    const result = await generateScheduledDailyBriefing({
      organizationId,
      organizationName,
      timeZone,
      requestId,
    });

    const durationMs = Date.now() - startedAt;

    if (result.skipped) {
      console.log(`[chief-of-staff-cron:${requestId}] skipped — daily briefing already exists (durationMs=${durationMs})`);
      return NextResponse.json({
        ok: true,
        generated: false,
        skipped: true,
        reason: 'daily_briefing_exists',
        briefingId: result.briefingId ?? null,
        briefingDate: result.briefingDate,
        requestId,
      });
    }

    console.log(
      `[chief-of-staff-cron:${requestId}] generation completed status=${result.briefing?.status} durationMs=${durationMs}`,
    );
    return NextResponse.json({
      ok: true,
      generated: true,
      skipped: false,
      briefingId: result.briefingId,
      status: result.briefing?.status,
      briefingDate: result.briefingDate,
      requestId,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (error instanceof NotFoundError) {
      console.error(`[chief-of-staff-cron:${requestId}] organization not found (durationMs=${durationMs})`);
      return jsonError(requestId, 'CHIEF_OF_STAFF_CRON_ORGANIZATION_INVALID', 500);
    }
    // Never log or return the raw error — only a safe code, the request
    // id, and duration. The full error is available server-side via
    // Vercel's own log capture of this console.error call, never in the
    // HTTP response body.
    console.error(`[chief-of-staff-cron:${requestId}] generation failed (durationMs=${durationMs})`, error);
    return jsonError(requestId, 'CHIEF_OF_STAFF_CRON_FAILED', 500);
  }
}
