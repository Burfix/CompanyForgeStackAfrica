import { describe, it, expect } from 'vitest';
import { valuesEqual, diffPatch } from './diff-patch';

describe('valuesEqual', () => {
  describe('strings', () => {
    it('matches identical strings', () => {
      expect(valuesEqual('Launch pilot', 'Launch pilot')).toBe(true);
    });

    it('does not match different strings', () => {
      expect(valuesEqual('Launch pilot', 'Launch pilot v2')).toBe(false);
    });

    it('treats whitespace differences as real changes', () => {
      expect(valuesEqual('Launch pilot', 'Launch pilot ')).toBe(false);
    });
  });

  describe('nullable strings', () => {
    it('matches two nulls', () => {
      expect(valuesEqual(null, null)).toBe(true);
    });

    it('treats null and undefined as equivalent absence markers', () => {
      expect(valuesEqual(null, undefined)).toBe(true);
      expect(valuesEqual(undefined, null)).toBe(true);
    });

    it('does not match null against a real empty string', () => {
      expect(valuesEqual(null, '')).toBe(false);
    });

    it('does not match undefined against a real value', () => {
      expect(valuesEqual(undefined, 'Waiting on legal')).toBe(false);
    });
  });

  describe('booleans', () => {
    it('matches identical booleans', () => {
      expect(valuesEqual(true, true)).toBe(true);
      expect(valuesEqual(false, false)).toBe(true);
    });

    it('does not match differing booleans', () => {
      expect(valuesEqual(true, false)).toBe(false);
    });

    it('does not match false against null', () => {
      expect(valuesEqual(false, null)).toBe(false);
    });

    it('does not match false against undefined', () => {
      expect(valuesEqual(undefined, false)).toBe(false);
    });
  });

  describe('numbers and numeric strings', () => {
    it('matches identical numbers', () => {
      expect(valuesEqual(50, 50)).toBe(true);
    });

    it('matches a number against its numeric-string Postgres representation', () => {
      expect(valuesEqual('50', 50)).toBe(true);
      expect(valuesEqual(50, '50')).toBe(true);
    });

    it('matches decimal numeric strings regardless of trailing zeros semantics', () => {
      expect(valuesEqual('1234.50', 1234.5)).toBe(true);
    });

    it('does not match different numeric values', () => {
      expect(valuesEqual('50', 51)).toBe(false);
    });

    it('does not match zero against null or false', () => {
      expect(valuesEqual(0, null)).toBe(false);
      expect(valuesEqual(0, undefined)).toBe(false);
    });

    it('does not match a plain non-numeric string as a number', () => {
      expect(valuesEqual('fifty', 50)).toBe(false);
    });
  });

  describe('dates and timestamps', () => {
    it('matches identical date-only strings', () => {
      expect(valuesEqual('2026-07-16', '2026-07-16')).toBe(true);
    });

    it('does not match different calendar dates', () => {
      expect(valuesEqual('2026-07-16', '2026-07-17')).toBe(false);
    });

    it('matches two timestamp strings representing the same instant in different formats', () => {
      expect(valuesEqual('2026-07-16T08:00:00.000Z', '2026-07-16T10:00:00+02:00')).toBe(true);
    });

    it('does not match timestamps representing different instants', () => {
      expect(valuesEqual('2026-07-16T08:00:00.000Z', '2026-07-16T09:00:00.000Z')).toBe(false);
    });
  });

  describe('UUIDs', () => {
    const idA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const idB = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

    it('matches identical UUIDs', () => {
      expect(valuesEqual(idA, idA)).toBe(true);
    });

    it('does not match different UUIDs', () => {
      expect(valuesEqual(idA, idB)).toBe(false);
    });

    it('never coerces a UUID into a number or date', () => {
      // Would be nonsensical if a UUID were parsed as a date/number and
      // happened to collide with another value's normalized form.
      expect(valuesEqual(idA, '12345678-0000-0000-0000-000000000000')).toBe(false);
    });
  });

  describe('string arrays', () => {
    it('matches identical arrays', () => {
      expect(valuesEqual(['revenue', 'compliance'], ['revenue', 'compliance'])).toBe(true);
    });

    it('matches the same elements in a different order', () => {
      expect(valuesEqual(['revenue', 'compliance'], ['compliance', 'revenue'])).toBe(true);
    });

    it('does not match arrays of different length', () => {
      expect(valuesEqual(['revenue'], ['revenue', 'compliance'])).toBe(false);
    });

    it('does not match arrays with different elements', () => {
      expect(valuesEqual(['revenue'], ['labour'])).toBe(false);
    });

    it('matches two empty arrays', () => {
      expect(valuesEqual([], [])).toBe(true);
    });
  });

  describe('null vs undefined vs meaningful falsy values', () => {
    it('distinguishes empty string from null', () => {
      expect(valuesEqual('', null)).toBe(false);
    });

    it('matches two empty strings', () => {
      expect(valuesEqual('', '')).toBe(true);
    });
  });
});

describe('diffPatch', () => {
  it('produces an empty diff when nothing changed', () => {
    const existing = { id: '1', title: 'Launch pilot', progress_percent: 50, health: 'healthy' };
    const patch = { title: 'Launch pilot', progress_percent: '50', health: 'healthy' };
    const result = diffPatch(existing, patch);
    expect(result.changedFields).toEqual([]);
  });

  it('captures previous and new values only for changed fields', () => {
    const existing = { id: '1', title: 'Launch pilot', progress_percent: 50 };
    const patch = { title: 'Launch pilot v2', progress_percent: '50' };
    const result = diffPatch(existing, patch);
    expect(result.changedFields).toEqual(['title']);
    expect(result.previousValues).toEqual({ title: 'Launch pilot' });
    expect(result.newValues).toEqual({ title: 'Launch pilot v2' });
    expect(result.finalPatch).toEqual({ title: 'Launch pilot v2' });
  });

  it('treats a reordered-but-identical array field as unchanged', () => {
    const existing = { id: '1', business_impact: ['revenue', 'compliance'] };
    const patch = { business_impact: ['compliance', 'revenue'] };
    const result = diffPatch(existing, patch);
    expect(result.changedFields).toEqual([]);
  });

  it('treats a same-instant timestamp in a different format as unchanged', () => {
    const existing = { id: '1', due_at: '2026-07-16T08:00:00.000Z' };
    const patch = { due_at: '2026-07-16T10:00:00+02:00' };
    const result = diffPatch(existing, patch);
    expect(result.changedFields).toEqual([]);
  });

  it('flags a field missing from the existing row as changed (documents the partial-select risk)', () => {
    // This is exactly the failure mode canonical-row loading exists to
    // prevent — diffPatch itself cannot distinguish "genuinely new value"
    // from "field was never selected", so a caller MUST pass a full row.
    const existingPartialRow = { id: '1' }; // e.g. verifyProjectAccess()-style partial select
    const patch = { description: 'Unchanged executive notes' };
    const result = diffPatch(existingPartialRow, patch);
    expect(result.changedFields).toEqual(['description']);
  });
});
