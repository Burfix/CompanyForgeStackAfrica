/**
 * Shared no-op-detection diffing, used by every mutation service
 * (projects, tasks, ...) so "did anything actually change" logic lives in
 * exactly one place rather than being reimplemented per entity.
 */

/** Arrays (e.g. projects.business_impact) need value comparison, not
 * reference equality — otherwise a resubmitted-but-unchanged array would
 * always look "changed" and defeat no-op detection. */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((v, i) => v === sortedB[i]);
  }
  return a === b;
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
 * hollow activity trail. */
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
