import { describe, it, expect } from 'vitest';
import { PROJECTS, buildInsertRows } from './seed-projects';

describe('seed-projects data', () => {
  it('has exactly the seven expected projects', () => {
    expect(PROJECTS).toHaveLength(7);
  });

  it('has no duplicate slugs', () => {
    const slugs = PROJECTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('uses the stable slugs specified in the brief', () => {
    expect(PROJECTS.map((p) => p.slug).sort()).toEqual(
      [
        'booking-com-hotel-opportunity',
        'core-platform-hardening',
        'forgestack-content-pr',
        'forgestack-fundraising',
        'life-and-brand-pilot-group-rollout',
        'sea-castle-hotel',
        'tourvest-rollout',
      ].sort(),
    );
  });

  it('does not invent target dates, owners, or metrics on any project', () => {
    for (const p of PROJECTS) {
      expect(p).not.toHaveProperty('targetDate');
      expect(p).not.toHaveProperty('ownerId');
      expect(p).not.toHaveProperty('priorityScore');
      expect(p).not.toHaveProperty('successMetric');
    }
  });
});

describe('buildInsertRows', () => {
  it('produces one row per project, all status "proposed", all keyed to the given org', () => {
    const rows = buildInsertRows('org-123', 'owner-456');
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(row.organization_id).toBe('org-123');
      expect(row.created_by).toBe('owner-456');
      expect(row.status).toBe('proposed');
    }
  });

  it('is deterministic — running it twice with the same input produces identical rows', () => {
    const first = buildInsertRows('org-123', 'owner-456');
    const second = buildInsertRows('org-123', 'owner-456');
    expect(first).toEqual(second);
  });

  it('every row has a slug, matching the upsert onConflict target used for idempotency', () => {
    const rows = buildInsertRows('org-123', null);
    for (const row of rows) {
      expect(typeof row.slug).toBe('string');
      expect(row.slug.length).toBeGreaterThan(0);
    }
  });
});
