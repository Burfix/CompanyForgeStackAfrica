/**
 * Organisation-local date resolution for the Chief of Staff daily briefing
 * (Slice 5.1).
 *
 * Vercel Cron schedules run in UTC, and Postgres/JS timestamps are stored
 * and compared in UTC throughout this codebase. But `briefing_date` is a
 * calendar date — "today" for the founder reading it — which only means
 * something relative to a timezone. This module is the single place that
 * turns a UTC instant into an organisation-local calendar date, so that
 * concept is never hand-rolled with a hardcoded offset (e.g. "+02:00")
 * anywhere else in the application.
 *
 * No default timezone is applied silently: the codebase has no prior
 * concept of an organisation timezone, so CHIEF_OF_STAFF_TIME_ZONE must be
 * configured explicitly for scheduled generation, and an invalid value
 * fails configuration loudly rather than quietly assuming UTC.
 */

/** Validates a string as a real IANA timezone identifier by asking the
 * platform's own Intl implementation to construct a formatter with it —
 * this throws a RangeError for anything Intl doesn't recognize, which is
 * a more reliable check than a hardcoded allow-list. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    Intl.DateTimeFormat('en-CA', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the calendar date (YYYY-MM-DD) that `instant` falls on within
 * `timeZone` — e.g. 2026-07-17T04:30:00Z in Africa/Johannesburg (UTC+2)
 * is 2026-07-17 local; the same instant in America/Los_Angeles would be
 * 2026-07-16 local. Uses the en-CA locale specifically because it's the
 * one built-in Intl locale guaranteed to format as YYYY-MM-DD, avoiding
 * any manual string-slicing of a locale-formatted date.
 *
 * Throws if `timeZone` is not a recognized IANA identifier — callers must
 * validate with `isValidTimeZone` first (or accept the throw as
 * configuration failure, which is the desired behaviour for the cron
 * route: fail loudly rather than silently default to UTC).
 */
export function getOrganizationLocalDate(instant: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(instant);
}
