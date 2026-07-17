import { describe, it, expect } from 'vitest';
import { analyzeCompanyState, type EvidenceProjectRow, type EvidenceMilestoneRow, type EvidenceTaskRow } from './chief-of-staff-analysis.service';

const NOW = new Date('2026-07-17T12:00:00Z');
const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const PROJECT_ID_2 = '22222222-2222-2222-2222-222222222222';
const MILESTONE_ID = '33333333-3333-3333-3333-333333333333';
const TASK_ID = '44444444-4444-4444-4444-444444444444';

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

function milestone(overrides: Partial<EvidenceMilestoneRow> = {}): EvidenceMilestoneRow {
  return {
    id: MILESTONE_ID,
    project_id: PROJECT_ID,
    title: 'Sign contract',
    status: 'in_progress',
    health: 'healthy',
    health_note: null,
    priority: 'medium',
    progress_percent: 50,
    founder_required: false,
    due_date: null,
    waiting_on: null,
    blocked_reason: null,
    updated_at: '2026-07-15T00:00:00Z',
    ...overrides,
  };
}

function task(overrides: Partial<EvidenceTaskRow> = {}): EvidenceTaskRow {
  return {
    id: TASK_ID,
    project_id: PROJECT_ID,
    milestone_id: null,
    title: 'Send follow-up',
    status: 'in_progress',
    priority: 'medium',
    founder_required: false,
    due_at: null,
    next_action: 'Call back',
    assignee_id: null,
    assignee: null,
    waiting_on: null,
    blocked_reason: null,
    updated_at: '2026-07-15T00:00:00Z',
    ...overrides,
  };
}

describe('analyzeCompanyState', () => {
  it('excludes completed/cancelled projects entirely from priority candidates', () => {
    const analysis = analyzeCompanyState({
      projects: [project({ status: 'completed', founder_required: true, health: 'off_track' })],
      milestones: [],
      tasks: [],
      lastReconciliationRun: null,
      founderUserId: null,
      now: NOW,
    });
    expect(analysis.priorityCandidates).toHaveLength(0);
  });

  it('consolidates a project, its milestone, and its task into ONE priority candidate rather than three', () => {
    const analysis = analyzeCompanyState({
      projects: [project({ founder_required: true, health: 'off_track' })],
      milestones: [milestone({ founder_required: true, due_date: '2026-07-01' })],
      tasks: [task({ founder_required: true, due_at: '2026-07-01T00:00:00Z' })],
      lastReconciliationRun: null,
      founderUserId: null,
      now: NOW,
    });
    const candidatesForProject = analysis.priorityCandidates.filter((c) => c.projectId === PROJECT_ID);
    expect(candidatesForProject).toHaveLength(1);
    expect(candidatesForProject[0]!.reasons.some((r) => r.includes('Milestone'))).toBe(true);
    expect(candidatesForProject[0]!.reasons.some((r) => r.includes('Task'))).toBe(true);
  });

  it('ranks priority candidates by descending score', () => {
    const analysis = analyzeCompanyState({
      projects: [
        project({ id: PROJECT_ID, name: 'Low attention', health: 'healthy' }),
        project({ id: PROJECT_ID_2, name: 'High attention', founder_required: true, health: 'off_track', priority_level: 'urgent' }),
      ],
      milestones: [],
      tasks: [],
      lastReconciliationRun: null,
      founderUserId: null,
      now: NOW,
    });
    expect(analysis.priorityCandidates[0]!.label).toBe('High attention');
  });

  it('produces a deadline risk for an overdue project target date', () => {
    const analysis = analyzeCompanyState({
      projects: [project({ target_date: '2026-07-01' })],
      milestones: [],
      tasks: [],
      lastReconciliationRun: null,
      founderUserId: null,
      now: NOW,
    });
    expect(analysis.risks.some((r) => r.category === 'deadline')).toBe(true);
  });

  it('produces a data_integrity risk only when the last reconciliation run reported failures', () => {
    const withFailures = analyzeCompanyState({
      projects: [project()],
      milestones: [],
      tasks: [],
      lastReconciliationRun: { occurred_at: '2026-07-16T00:00:00Z', metadata: { failure_count: 2 } },
      founderUserId: null,
      now: NOW,
    });
    const withoutFailures = analyzeCompanyState({
      projects: [project()],
      milestones: [],
      tasks: [],
      lastReconciliationRun: { occurred_at: '2026-07-16T00:00:00Z', metadata: { failure_count: 0 } },
      founderUserId: null,
      now: NOW,
    });
    expect(withFailures.risks.some((r) => r.category === 'data_integrity')).toBe(true);
    expect(withoutFailures.risks.some((r) => r.category === 'data_integrity')).toBe(false);
    expect(withFailures.reconciliation.isKnownConsistent).toBe(false);
    expect(withoutFailures.reconciliation.isKnownConsistent).toBe(true);
  });

  it('classifies blocked and waiting as distinct blocker kinds — waiting is never auto-promoted to blocked', () => {
    const analysis = analyzeCompanyState({
      projects: [
        project({ id: PROJECT_ID, blocked_reason: 'Needs legal sign-off' }),
        project({ id: PROJECT_ID_2, name: 'Waiting project', waiting_on: 'Vendor response' }),
      ],
      milestones: [],
      tasks: [],
      lastReconciliationRun: null,
      founderUserId: null,
      now: NOW,
    });
    const blockedItem = analysis.blockers.find((b) => b.project_id === PROJECT_ID);
    const waitingItem = analysis.blockers.find((b) => b.project_id === PROJECT_ID_2);
    expect(blockedItem?.kind).toBe('blocked');
    expect(waitingItem?.kind).toBe('waiting');
  });

  it('surfaces a decision when a founder-required project is off track with no recovery note', () => {
    const analysis = analyzeCompanyState({
      projects: [project({ founder_required: true, health: 'off_track', health_note: null })],
      milestones: [],
      tasks: [],
      lastReconciliationRun: null,
      founderUserId: null,
      now: NOW,
    });
    expect(analysis.decisions.some((d) => d.id === `decision-project-recovery-${PROJECT_ID}`)).toBe(true);
  });

  it('does NOT surface a recovery decision when a health note already explains the plan', () => {
    const analysis = analyzeCompanyState({
      projects: [project({ founder_required: true, health: 'off_track', health_note: 'Recovery plan: re-scoping with vendor.' })],
      milestones: [],
      tasks: [],
      lastReconciliationRun: null,
      founderUserId: null,
      now: NOW,
    });
    expect(analysis.decisions.some((d) => d.id === `decision-project-recovery-${PROJECT_ID}`)).toBe(false);
  });

  it('marks a delegated, healthy, non-founder-required project as safe to ignore with a positive reason', () => {
    const analysis = analyzeCompanyState({
      projects: [project({ attention_mode: 'delegated', health: 'healthy', founder_required: false })],
      milestones: [],
      tasks: [],
      lastReconciliationRun: null,
      founderUserId: null,
      now: NOW,
    });
    const item = analysis.safeToIgnore.find((s) => s.id === `ignore-project-${PROJECT_ID}`);
    expect(item).toBeDefined();
    expect(item?.reason.length).toBeGreaterThan(0);
  });

  it('never marks a founder-required or blocked project as safe to ignore', () => {
    const analysis = analyzeCompanyState({
      projects: [project({ attention_mode: 'delegated', health: 'healthy', founder_required: true })],
      milestones: [],
      tasks: [],
      lastReconciliationRun: null,
      founderUserId: null,
      now: NOW,
    });
    expect(analysis.safeToIgnore.some((s) => s.id === `ignore-project-${PROJECT_ID}`)).toBe(false);
  });

  it('every emitted risk/blocker/decision/safe-to-ignore item carries at least one evidence reference', () => {
    const analysis = analyzeCompanyState({
      projects: [project({ founder_required: true, health: 'off_track', target_date: '2026-07-01', blocked_reason: 'Waiting on legal' })],
      milestones: [milestone({ founder_required: true, status: 'blocked', blocked_reason: 'Needs sign-off', due_date: '2026-07-01' })],
      tasks: [task({ founder_required: true, next_action: null })],
      lastReconciliationRun: { occurred_at: '2026-07-16T00:00:00Z', metadata: { failure_count: 1 } },
      founderUserId: null,
      now: NOW,
    });
    for (const risk of analysis.risks) expect(risk.evidence.length).toBeGreaterThan(0);
    for (const blocker of analysis.blockers) expect(blocker.evidence.length).toBeGreaterThan(0);
    for (const decision of analysis.decisions) expect(decision.evidence.length).toBeGreaterThan(0);
    for (const candidate of analysis.priorityCandidates) expect(candidate.evidence.length).toBeGreaterThan(0);
  });
});
