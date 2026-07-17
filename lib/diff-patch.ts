/**
 * Shared no-op-detection diffing, used by every mutation service
 * (projects, tasks, milestones, ...) so "did anything actually change"
 * logic lives in exactly one place rather than being reimplemented per
 * entity.
 *
 * IMPORTANT — this module only decides whether two *values* are the same.
 * It cannot fix a caller passing an incomplete `existing` row (a field
 * missing from a partial repository select shows up here as `undefined`
 * and will almost always compare as "changed"). That risk is addressed by
 * always diffing against a canonical, full-row read — see
 * projectsRepository.getProjectForMutation / tasksRepository.getTaskForMutation
 * / milestonesRepository.getMilestoneForMutation and the callers in
 * project.service.ts / task.service.ts / milestone.service.ts.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Requires a real calendar-shaped date at the start of the string
// (YYYY-MM-DD) before we ever attempt Date.parse — guards against
// coincidentally numeric-looking strings (e.g. UUID fragments) being
// treated as timestamps.
const DATE_LIKE_PATTERN = /^\d{4}-\d{2}-\d{2}([T ].*)?$/;
// A pure integer or decimal, optionally negative — matches what Postgres
// `numeric` columns come back as through supabase-js (strings like "50" or
// "1234.50"), so they can compare equal to a JS number/string of the same
// value.
const NUMERIC_STRING_PATTERN = /^-?\d+(\.\d+)?$/;

type NormalizedValue = string | number | boolean | null;

/**
 * Reduces a raw DB or patch value to a comparable primitive:
 *  - numeric strings ("50", "1234.50") -> number
 *  - ISO date/timestamp strings -> epoch milliseconds (so two different
 *    textual representations of the same instant compare equal)
 *  - everything else (including UUIDs, plain text, enums) -> itself,
 *    untouched
 * Never mutates null/undefined — callers handle those explicitly so a
 * meaningful `0` or `false` is never confused with "no value".
 */
function normalizeScalar(value: string | number | boolean): NormalizedValue {
  if (typeof value !== 'string') return value;

  if (UUID_PATTERN.test(value)) return value;

  if (NUMERIC_STRING_PATTERN.test(value.trim())) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }

  if (DATE_LIKE_PATTERN.test(value)) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return value;
}

function isAbsent(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/** Arrays (e.g. projects.business_impact) need order-independent value
 * comparison, not reference equality — otherwise a resubmitted-but-
 * unchanged array (possibly reordered by a multi-select control) would
 * always look "changed" and defeat no-op detection. Elements are compared
 * as strings, which is sufficient for every array field in this schema
 * (string-enum arrays only). */
function arraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = a.map(String).sort();
  const sortedB = b.map(String).sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

/**
 * Type-aware equality used by diffPatch. Explicit, tested comparison
 * behaviour per category (see lib/diff-patch.test.ts):
 *  - strings vs nullable strings: exact match after trimming is NOT
 *    applied (deliberate — whitespace differences are real edits)
 *  - booleans: exact match
 *  - numbers vs numeric strings (Postgres `numeric` columns round-trip as
 *    strings): compare by numeric value
 *  - dates/timestamps: compare by the instant they represent, not their
 *    textual formatting
 *  - string arrays: order-independent, element-wise
 *  - UUIDs: exact string match (never numeric/date-coerced)
 *  - null vs undefined: treated as equivalent "no value" markers
 *  - null/undefined vs a real `0`/`false`/`''`: never equal — the
 *    presence of a real falsy value is a meaningful change
 */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return arraysEqual(a, b);
  }

  if (a === b) return true;

  if (isAbsent(a) || isAbsent(b)) {
    // Only equal if BOTH sides are absent (null or undefined) — a real
    // falsy value (0, false, '') on either side is never treated as
    // equal to "no value".
    return isAbsent(a) && isAbsent(b);
  }

  // At this point neither side is null/undefined/array; only compare
  // scalars we know how to normalize (string/number/boolean). Anything
  // else (e.g. a nested object) falls back to reference/strict equality,
  // which was already checked above and failed.
  if (
    (typeof a === 'string' || typeof a === 'number' || typeof a === 'boolean') &&
    (typeof b === 'string' || typeof b === 'number' || typeof b === 'boolean')
  ) {
    return normalizeScalar(a) === normalizeScalar(b);
  }

  return false;
}

export interface DiffResult<TPatch extends Record<string, unknown>> {
  changedFields: string[];
  previousValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  finalPatch: TPatch;
}

/** Computes only the fields that actually changed between an existing row
 * and a requested patch — this is what makes no-op submissions a no-op
 * (empty diff, no repository write, no activity log entry) instead of a
 * hollow activity trail.
 *
 * `existing` MUST be a canonical, full-row read (every field the caller's
 * patch could possibly set). A partial-select row will misreport omitted
 * fields as "changed" every time, since `existing[key]` would be
 * `undefined` rather than the real stored value — see the module doc
 * comment above. */
export function diffPatch<TRow extends Record<string, unknown>, TPatch extends Record<string, unknown>>(
  existing: TRow,
  patch: TPatch,
): DiffResult<TPatch> {
  const changedFields: string[] = [];
  const previousValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  const finalPatch = {} as TPatch;

  for (const [key, newValue] of Object.entries(patch)) {
    const existingValue = existing[key];
    if (!valuesEqual(existingValue, newValue)) {
      changedFields.push(key);
      previousValues[key] = existingValue;
      newValues[key] = newValue;
      (finalPatch as Record<string, unknown>)[key] = newValue;
    }
  }

  return { changedFields, previousValues, newValues, finalPatch };
}
