# Slice 5.1 Completion Report — Unattended Daily Chief of Staff Briefings

## 1. Existing generation route audit

`POST /api/internal/chief-of-staff/generate` authenticates via `requireUser()` + `getCurrentOrg()` — both read the Supabase session cookie. A cron request has no cookie, so this route structurally cannot serve as the scheduled trigger; it needed a separate route, not a modification. `services/chief-of-staff.service.ts`'s `generateBriefing` already had stale-generation recovery (>10 min stuck `generating` records auto-failed) and an org-wide "already generating" guard, both reusable as-is. `generated_by` was already nullable at the schema level (`references profiles(id) on delete set null`, no `NOT NULL`) — no migration was needed for that specifically. The database already had a unique partial index (`chief_of_staff_briefings_one_current_daily` on `(organization_id, briefing_date)` where `briefing_type='daily' and status<>'superseded'`) from Slice 5, which turned out to be the ready-made atomic backstop for daily idempotency. No `vercel.json` existed. No environment-schema module exists in this codebase — env vars are read and validated inline at the point of use (the same convention `lib/supabase/server.ts` already follows), so this slice follows that convention rather than introducing a new one. `getCurrentOrg()` picks the first membership row per signed-in user (documented "Phase 1 has exactly one organization per user"); this says nothing about cron, which has no user at all — confirmed via direct query that the database currently contains exactly one organisation (`ForgeStack Africa`, `6428cb24-4504-4b14-bf51-317cfa346196`), so an explicit single-organisation env var is safe and does not silently paper over a multi-org reality.

## 2. Why a separate cron route was chosen

Modifying the existing route to accept two auth modes would have meant a session-optional code path sitting next to a session-required one in the same handler — exactly the kind of ambiguity that erodes an auth boundary over time. A dedicated `GET /api/cron/chief-of-staff` keeps the manual route's requirement (authenticated owner/admin, unchanged) structurally incapable of being bypassed by a machine caller, and keeps the cron route incapable of being reached by a browser session bypassing CRON_SECRET.

## 3. Cron authentication implementation

Exact-match `Authorization: Bearer ${CRON_SECRET}` check. Both sides are SHA-256 hashed to a fixed 32-byte digest before `node:crypto.timingSafeEqual` compares them — this makes the comparison genuinely constant-time and avoids ever branching on raw secret length. Missing `CRON_SECRET`, missing header, wrong scheme, or wrong value all return an identical generic 401 (`{ ok: false, error: 'CHIEF_OF_STAFF_CRON_UNAUTHORIZED', requestId }`) — no variation in status, body shape, or timing that would let an attacker distinguish failure modes. The secret is read only from the `Authorization` header; query params, cookies, body, and URL path are never consulted.

## 4. Organisation targeting strategy

`CHIEF_OF_STAFF_CRON_ORGANIZATION_ID`, validated as a UUID by regex before use, then confirmed to reference a real organisation via a service-role lookup before any generation work begins. No "first organisation in the database" fallback exists anywhere in the route. This version schedules exactly one configured organisation; multi-organisation scheduling (iterating a list, or reading from a dedicated cron-schedule table) is explicitly deferred, matching the instruction not to build it now.

## 5. Timezone and briefing-date behaviour

New `lib/chief-of-staff-timezone.ts`: `isValidTimeZone` asks `Intl.DateTimeFormat` to construct a formatter with the given IANA identifier (throws for anything invalid — more reliable than a hand-maintained allow-list). `getOrganizationLocalDate` formats a UTC instant into `YYYY-MM-DD` using the `en-CA` locale specifically, which is the one built-in Intl locale guaranteed to already format as ISO-8601 date order, avoiding any manual string-slicing. `CHIEF_OF_STAFF_TIME_ZONE` is required and validated at request time with no default — an invalid or missing value fails configuration loudly (500 `CHIEF_OF_STAFF_CRON_NOT_CONFIGURED`) rather than silently assuming UTC. No offset is ever hardcoded. `briefing_date` is stored as the organisation-local calendar date; every other timestamp on the row remains UTC, unchanged from Slice 5.

## 6. Environment variables added

`CRON_SECRET`, `CHIEF_OF_STAFF_CRON_ORGANIZATION_ID`, `CHIEF_OF_STAFF_TIME_ZONE` — added to `.env.example` with comments (no real values committed). No environment-schema module exists in the codebase to update; validation happens inline in the cron route, matching the existing convention.

## 7. Service changes

`services/chief-of-staff.service.ts`: `GenerateBriefingParams.userId` renamed to `generatedBy: string | null` plus a new `generationSource: 'manual' | 'cron'` field, an optional `briefingDate` override (manual path still defaults to the server's UTC date, unchanged behaviour), and an optional `useServiceRole` flag (default `false`, so every existing caller is byte-for-byte unaffected). New exported `generateScheduledDailyBriefing({ organizationId, organizationName, timeZone, requestId })` — computes the org-local date, performs the read-side idempotency check, and delegates to the *same* `generateBriefing` function the manual route calls, with `generatedBy: null`, `generationSource: 'cron'`, `briefingType: 'daily'`, `useServiceRole: true`. No generation logic is duplicated. The two existing manual call sites (`features/chief-of-staff/actions.ts`, `app/api/internal/chief-of-staff/generate/route.ts`) were updated only for the renamed field names.

## 8. Schema/migration changes

One additive migration (`0011_chief_of_staff_generation_source.sql`): a single new column, `generation_source text not null default 'manual' check (generation_source in ('manual','cron'))`, on `chief_of_staff_briefings`. No existing column, constraint, or policy touched. Types regenerated via the Supabase MCP. `generated_by` needed no migration — it was already nullable.

## 9. `generated_by` behaviour

Cron-generated briefings: `generated_by = null`, `generation_source = 'cron'`, `briefing_type = 'daily'`. No user is fabricated or impersonated — `finalizeBriefing`'s patch type was widened from `generated_by: string` to `generated_by: string | null` to make this the type-checked, not just runtime-hoped-for, behaviour.

## 10. Daily idempotency implementation

Two layers, per the instruction to prefer atomic over read-then-write where possible:
1. **Read-side pre-check**: `chiefOfStaffRepository.getDailyBriefingForDate` looks for a `ready` or `fallback_ready` daily row for the organisation/date. If found, the AI provider is never called and no new row is written — the route returns `skipped: true` immediately. A `failed` row for the same date does *not* count as existing, so a prior failed attempt can retry.
2. **Atomic backstop**: the pre-existing unique partial index on `(organization_id, briefing_date)` for non-superseded daily rows. If two concurrent cron invocations both pass check #1 (the real, narrow race window), exactly one `INSERT` into `chief_of_staff_briefings` succeeds; the other hits Postgres error `23505`, which the repository catches and re-throws as `BusinessRuleError('DUPLICATE_DAILY_BRIEFING')` — the service and route both treat this as `skipped: true`, never as a failure.

The existing org-wide "active generating" guard (unchanged from Slice 5) provides a coarser, additional layer: cron and manual generation cannot run for the same org at the same instant regardless of type.

## 11. Concurrency strategy

Database uniqueness is the real guarantee (see above) — no Redis or advisory-lock mechanism was added, matching the instruction. Limitation, stated plainly: the org-wide "active generating" check is read-then-act and has its own narrow race window, but it only ever produces a *skip*, never data corruption, because the unique index is the actual backstop underneath it. Stale-generation recovery (>10 minutes) runs before every generation attempt, cron or manual, so a crashed invocation cannot permanently wedge the daily slot.

## 12. Cron/manual interaction rules

Cron generates the canonical `daily` briefing (`generation_source='cron'`). The manual UI/action always sends `briefingType: 'manual'` (unchanged) — it never produces a `daily`-type row, so it can never collide with the unique daily index and never blocks or gets blocked by cron. History and the UI show both `briefing_type` and the new `generation_source`-derived label (Scheduled / Manual / Fallback) side by side. Nothing overwrites a manual briefing; nothing regenerates a historical record in place — `finalizeBriefing` only ever transitions a single row's own lifecycle (`generating` → `ready`/`fallback_ready`/`failed`), and `supersedePreviousBriefings` only marks *other* same-date daily rows `superseded`, never manual ones (unchanged filter: `briefing_type = 'daily'`).

## 13. Fallback behaviour

Unchanged from Slice 5, reused as-is: if the AI provider is unset or fails for any reason, `generateBriefing` (called by both the manual and scheduled paths) falls back to the deterministic formatter and persists a `fallback_ready` briefing. The cron route treats this as success (`ok: true, generated: true, status: 'fallback_ready'`) — a useful briefing was produced. Only a genuine infrastructure failure (DB unavailable, evidence load failure, persistence failure) returns the route's 500.

## 14. Route response contract

Exactly matches the specified shapes: `{ ok, generated, skipped, briefingId, status, briefingDate, requestId }` on success, `{ ok: true, generated: false, skipped: true, reason: 'daily_briefing_exists', briefingId, briefingDate, requestId }` when skipped, `{ ok: false, error, requestId }` on failure. Verified by test that the response never contains evidence packets, prompts, provider responses, deterministic snapshots, or raw errors — only the bounded fields above.

## 15. Observability and safe error codes

Logged (console, safe fields only): request received, authentication accepted, target organisation resolved, generation completed/skipped/failed, and total duration — all tagged with the request id. Error codes implemented: `CHIEF_OF_STAFF_CRON_UNAUTHORIZED`, `CHIEF_OF_STAFF_CRON_NOT_CONFIGURED`, `CHIEF_OF_STAFF_CRON_ORGANIZATION_INVALID`, `CHIEF_OF_STAFF_CRON_FAILED`. The bearer token, `CRON_SECRET`, API keys, evidence packets, prompts, and model responses are never logged. Verified by test that a raw underlying error message (e.g. a database connection string fragment) never appears in the logged safe-error line's returned response, and that the secret never appears in any response body regardless of outcome.

## 16. UI changes

Small, as instructed — no cron administration dashboard. `getBriefingSourceLabel(generationSource, status)` added to `features/chief-of-staff/constants.ts` (Fallback takes precedence over source in display, since AI-unavailable matters more to a founder than who triggered it). Wired into the full briefing view's subtitle line and the briefing history list. No changes to `/chief-of-staff` or the Founder HQ panel's data-loading logic — a cron-generated `daily` briefing surfaces through the exact same `getLatestBriefing`/`listBriefings` calls as any other, so it appears automatically with no additional wiring.

## 17. `vercel.json` changes

No pre-existing `vercel.json` — created fresh with the exact `crons` entry specified: `{ "path": "/api/cron/chief-of-staff", "schedule": "30 4 * * *" }` (04:30 UTC = 06:30 SAST, UTC+2 year-round, well ahead of a working morning).

## 18. Tests added

45 new tests, all passing, no real provider or network calls:
- `lib/chief-of-staff-timezone.test.ts` (8 tests) — valid/invalid IANA timezones, the exact 04:30 UTC → Johannesburg local-date mapping, a UTC-midnight-boundary case, a timezone-behind-UTC case producing a different calendar date, and a throw for an unrecognized zone.
- `app/api/cron/chief-of-staff/route.test.ts` (18 tests) — every authentication case (missing secret, missing header, wrong token, wrong scheme, valid token, secret never in response), every configuration failure case (missing/invalid org id, missing/invalid timezone, valid config resolves, org id cannot be supplied via query param, org lookup failure), generation cases (fresh generation, skip-without-error, safe 500 without leaking the raw error), bounded response shape, and `dynamic`/`revalidate` route configuration.
- `services/chief-of-staff.service.test.ts` (+10 tests for `generateScheduledDailyBriefing`) — generates when nothing exists, sets `generated_by: null`/`generation_source: 'cron'`, skips for both `ready` and `fallback_ready` existing daily rows, does not block on a manual briefing existing for the same date, recovers a stale generating record and still proceeds, treats an active (non-stale) generating record as a skip not a failure, treats the unique-constraint race as a skip, allows retry after a prior `failed` attempt, never calls the AI provider when skipped, and computes a valid `YYYY-MM-DD` briefing date.
- Existing Slice 5 tests updated only for the renamed `generatedBy`/`generationSource` fields and the new `useServiceRole` parameter position — no behavioural assertions were weakened.

## 19. Typecheck result

Clean (`tsc --noEmit`), full project, zero errors.

## 20. Lint result

Clean (`eslint . --max-warnings=0`), zero warnings or errors.

## 21. Test result

409/409 passing (364 pre-existing + 45 new), zero failures.

## 22. Build result

Successful (`next build`, run in a clean scratch copy due to the same sandbox filesystem permission quirk on `.next` noted in prior slices — not a code issue). All 21 routes generated, including the new `/api/cron/chief-of-staff`, alongside the unchanged `/api/internal/chief-of-staff/generate` and every existing Chief of Staff, Founder HQ, and System Health route.

## 23. Security advisor result

No new findings. Only the same pre-existing "leaked password protection disabled" warning present since Slice 1. Confirmed no server secret (`CRON_SECRET`, `AI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) appears anywhere in the built client bundle, and confirmed the cron route and its service path import nothing from the Projects/Milestones/Tasks mutation layer.

## 24. Required Vercel configuration

Three new environment variables must be set in Vercel before this goes live (names only, per instruction — values not included here):
- `CRON_SECRET`
- `CHIEF_OF_STAFF_CRON_ORGANIZATION_ID`
- `CHIEF_OF_STAFF_TIME_ZONE`

`AI_API_KEY` is unchanged from Slice 5 and remains optional.

## 25–28. Manual production invocation, duplicate-invocation, Vercel Cron registration, deployment status

Pending your deployment. Git push is blocked by the same sandbox filesystem limitation as every prior slice — exact commands (plus the looked-up organisation id) are in the handoff file alongside this report. Once you've pushed and set the three env vars, tell me and I will: confirm the cron job is registered under the Vercel project's Cron Jobs tab, confirm deployment status and zero runtime errors, walk you through invoking the route once from your own terminal with your real `CRON_SECRET` (I won't ask you to paste it in chat), confirm the second invocation returns `skipped: true` with no duplicate row, and confirm the next scheduled execution time.

## 29. Remaining risks

- This slice schedules exactly one organisation by design. If a second organisation is ever created, it will not automatically get a daily briefing — multi-org scheduling needs its own design pass.
- `useServiceRole` is a real, deliberate RLS-bypass path threaded through ~13 repository methods. It's narrowly scoped (only `generateScheduledDailyBriefing` and the cron route's org lookup ever pass `true`) and every default is `false`, but it is the kind of surface that deserves a second look in any future security review specifically for this slice.
- The route logs are safe today; if log verbosity is ever increased for debugging, review before doing so that no evidence-packet or prompt content gets pulled into a broader logging call by accident.

## 30. Calibration go/no-go recommendation

**Go.** Unattended generation is verified end-to-end in tests (auth, configuration, idempotency, fallback, response contract) and the build is clean. The one remaining gate before the 7–14 day calibration period can start for real is operational, not code: set the three env vars in Vercel and confirm one live cron invocation produces a briefing and a second one skips. Once you confirm that, calibration can begin the next morning — no further code changes needed to start it.
