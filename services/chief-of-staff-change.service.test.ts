import { describe, it, expect } from 'vitest';
import { detectChanges, buildEvidenceSnapshot } from './chief-of-staff-change.service';
import type { EvidenceProjectRow, EvidenceMilestoneRow, EvidenceTaskRow } from './chief-of-staff-analysis.service';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';

function project(overrides: Partial<EvidenceProjectRow> = {}): EvidenceProjectRow {
  return {
    id: PROJECT_ID,
    name: 'Revenue Rollout',
    owner: null,
    status: 'active',
    health: 'healthy',
    health_note: null,
    priority_level: 'medium',
    focus_level: 3,
    attention_mode: 'delegated',
    founder_required: false,
    progress_percent: 50,
    progress_mode: 'manual',
    target_date: null,
    next_review_at: null,
    blocked_reason: null,
    waiting_on: null,
    business_impact: [],
    updated_at: '2026-07-15T00:00:00Z',
    archived_at: null,
    ...overrides,
  };
}

describe('detectChanges', () => {
  it('returns no changes when there is no previous snapshot (first-ever briefing)', () => {
    const changes = detectChanges([project()], [], [], [], null);
    expect(changes).toHaveLength(0);
  });

  it('detects a new project that did not exist in the previous snapshot', () => {
    const previous = buildEvidenceSnapshot([], [], [], null, []);
    const changes = detectChanges([project()], [], [], [], previous);
    expect(changes.some((c) => c.change_type === 'new_project')).toBe(true);
  });

  it('detects health worsening but not improving in the same comparison, and vice versa', () => {
    const previous = buildEvidenceSnapshot([project({ health: 'healthy' })], [], [], null, []);
    const worsened = detectChanges([project({ health: 'off_track' })], [], [], [], previous);
    expect(worsened.some((c) => c.change_type === 'project_health_worsened')).toBe(true);
    expect(worsened.some((c) => c.change_type === 'project_health_improved')).toBe(false);

    const previousBad = buildEvidenceSnapshot([project({ health: 'off_track' })], [], [], null, []);
    const improved = detectChanges([project({ health: 'healthy' })], [], [], [], previousBad);
    expect(improved.some((c) => c.change_type === 'project_health_improved')).toBe(true);
  });

  it('detects a project newly becoming founder-required', () => {
    const previous = buildEvidenceSnapshot([project({ founder_required: false })], [], [], null, []);
    const changes = detectChanges([project({ founder_required: true })], [], [], [], previous);
    expect(changes.some((c) => c.change_type === 'project_became_founder_required')).toBe(true);
  });

  it('ignores progress changes below the 15-point threshold and detects ones above it', () => {
    const previous = buildEvidenceSnapshot([project({ progress_percent: 50 })], [], [], null, []);
    const smallChange = detectChanges([project({ progress_percent: 55 })], [], [], [], previous);
    const bigChange = detectChanges([project({ progress_percent: 70 })], [], [], [], previous);
    expect(smallChange.some((c) => c.change_type === 'progress_changed')).toBe(false);
    expect(bigChange.some((c) => c.change_type === 'progress_changed')).toBe(true);
  });

  it('detects reconciliation discrepancies appearing and resolving', () => {
    const cleanPrevious = buildEvidenceSnapshot([project()], [], [], null, []);
    const appeared = detectChanges([project()], [], [], [], cleanPrevious, 2);
    expect(appeared.some((c) => c.change_type === 'reconciliation_discrepancy_appeared')).toBe(true);

    const dirtyPrevious = buildEvidenceSnapshot([project()], [], [], { occurred_at: 'x', metadata: { failure_count: 3 } }, []);
    const resolved = detectChanges([project()], [], [], [], dirtyPrevious, 0);
    expect(resolved.some((c) => c.change_type === 'reconciliation_discrepancy_resolved')).toBe(true);
  });

  it('caps the total number of reported changes at 8', () => {
    const projects: EvidenceProjectRow[] = Array.from({ length: 15 }, (_, i) =>
      project({ id: `00000000-0000-0000-0000-00000000000${i}`.slice(0, 36), name: `Project ${i}` }),
    );
    const previous = buildEvidenceSnapshot([], [], [], null, []);
    const changes = detectChanges(projects, [], [], [], previous);
    expect(changes.length).toBeLessThanOrEqual(8);
  });
});

describe('buildEvidenceSnapshot', () => {
  it('captures the reconciliation failure count and top risk ids for next comparison', () => {
    const snapshot = buildEvidenceSnapshot(
      [project()],
      [],
      [],
      { occurred_at: '2026-07-16T00:00:00Z', metadata: { failure_count: 1 } },
      [{ id: 'risk-1', title: 'x', category: 'delivery', severity: 'high', explanation: 'x', likely_consequence: 'x', confidence: 'high', time_horizon: 'x', evidence: [] }],
    );
    expect(snapshot.reconciliationFailureCount).toBe(1);
    expect(snapshot.topRiskIds).toEqual(['risk-1']);
    expect(snapshot.projects[PROJECT_ID]).toBeDefined();
  });
});
