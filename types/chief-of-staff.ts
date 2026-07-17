/**
 * Chief of Staff type contracts (Slice 5).
 *
 * These types describe the READ-ONLY interpretive layer built on top of
 * the deterministic Projects → Milestones → Tasks → Activity hierarchy.
 * Nothing in this file (or anything that consumes it) is permitted to
 * write to projects/milestones/tasks — see services/chief-of-staff.service.ts
 * for the enforced boundary.
 *
 * Every conclusion the Chief of Staff produces (priority, risk, blocker,
 * decision, safe-to-ignore item, change) MUST carry at least one
 * ChiefOfStaffEvidenceReference pointing at a real record supplied in the
 * evidence packet — see services/chief-of-staff-evidence.service.ts and
 * the post-generation verification in services/ai/chief-of-staff-provider.ts.
 */

export type ChiefOfStaffUrgency = 'urgent' | 'high' | 'medium' | 'low';
export type ChiefOfStaffConfidence = 'high' | 'medium' | 'low';
export type ChiefOfStaffEvidenceEntityType = 'project' | 'milestone' | 'task' | 'activity';

export type ChiefOfStaffRiskCategory =
  | 'commercial'
  | 'customer'
  | 'delivery'
  | 'technical'
  | 'operational'
  | 'financial'
  | 'fundraising'
  | 'compliance'
  | 'founder_capacity'
  | 'data_integrity'
  | 'deadline'
  | 'dependency';

export type ChiefOfStaffBlockerKind = 'blocked' | 'waiting' | 'missing_information' | 'dependency' | 'founder_decision_required';

export type ChiefOfStaffChangeType =
  | 'new_project'
  | 'project_health_worsened'
  | 'project_health_improved'
  | 'project_became_founder_required'
  | 'new_overdue_milestone'
  | 'milestone_completed'
  | 'task_became_blocked'
  | 'task_completed'
  | 'priority_changed'
  | 'progress_changed'
  | 'deadline_changed'
  | 'waiting_on_changed'
  | 'reconciliation_discrepancy_appeared'
  | 'reconciliation_discrepancy_resolved'
  | 'risk_entered_top_set'
  | 'risk_left_top_set';

export interface ChiefOfStaffEvidenceReference {
  entity_type: ChiefOfStaffEvidenceEntityType;
  entity_id: string;
  label: string;
  field?: string;
  value?: string;
}

export interface ChiefOfStaffPriority {
  id: string;
  title: string;
  reason: string;
  recommended_focus: string;
  urgency: ChiefOfStaffUrgency;
  confidence: ChiefOfStaffConfidence;
  evidence: ChiefOfStaffEvidenceReference[];
}

export interface ChiefOfStaffRisk {
  id: string;
  title: string;
  category: ChiefOfStaffRiskCategory;
  severity: ChiefOfStaffUrgency;
  explanation: string;
  likely_consequence: string;
  confidence: ChiefOfStaffConfidence;
  time_horizon: string;
  evidence: ChiefOfStaffEvidenceReference[];
}

export interface ChiefOfStaffBlocker {
  id: string;
  kind: ChiefOfStaffBlockerKind;
  title: string;
  project_id?: string;
  reason: string;
  waiting_on?: string;
  age_days?: number;
  due_date?: string;
  suggested_attention: ChiefOfStaffUrgency;
  evidence: ChiefOfStaffEvidenceReference[];
}

export interface ChiefOfStaffDecision {
  id: string;
  title: string;
  question: string;
  why_now: string;
  deadline?: string;
  consequence_of_delay: string;
  missing_information?: string;
  confidence: ChiefOfStaffConfidence;
  evidence: ChiefOfStaffEvidenceReference[];
}

export interface ChiefOfStaffIgnoreItem {
  id: string;
  title: string;
  reason: string;
  valid_until?: string;
  reactivation_condition: string;
  evidence: ChiefOfStaffEvidenceReference[];
}

export interface ChiefOfStaffChange {
  id: string;
  change_type: ChiefOfStaffChangeType;
  description: string;
  previous_value?: string;
  new_value?: string;
  evidence: ChiefOfStaffEvidenceReference[];
}

/** The final, validated, stored shape of one briefing's content — this is
 * what both the AI path and the deterministic-fallback path produce, so
 * the UI never needs to know which one generated a given briefing. */
export interface ChiefOfStaffBriefingOutput {
  title: string;
  executive_summary: string;
  top_priorities: ChiefOfStaffPriority[];
  risks: ChiefOfStaffRisk[];
  blockers: ChiefOfStaffBlocker[];
  decisions_required: ChiefOfStaffDecision[];
  safe_to_ignore: ChiefOfStaffIgnoreItem[];
  changes_since_previous: ChiefOfStaffChange[];
  observations: string[];
}

export type ChiefOfStaffBriefingType = 'daily' | 'manual' | 'fallback';
export type ChiefOfStaffBriefingStatus = 'generating' | 'ready' | 'fallback_ready' | 'failed' | 'superseded';

export type ChiefOfStaffFreshness = 'current' | 'new_activity_available' | 'stale' | 'integrity_warning';

export interface ChiefOfStaffReconciliationHealth {
  lastRunAt: string | null;
  milestoneCorrections: number | null;
  projectCorrections: number | null;
  failureCount: number | null;
  isKnownConsistent: boolean;
}

/** Deterministic, scored candidates — computed entirely without AI (see
 * lib/chief-of-staff-scoring.ts / services/chief-of-staff-analysis.service.ts)
 * before any provider call. The LLM (when available) only rewords/
 * consolidates these; it never discovers overdue states or computes
 * health/severity itself. */
export interface DeterministicScoredEntity {
  entityType: ChiefOfStaffEvidenceEntityType;
  entityId: string;
  projectId?: string;
  milestoneId?: string;
  label: string;
  score: number;
  reasons: string[];
  evidence: ChiefOfStaffEvidenceReference[];
}

export interface DeterministicCompanyAnalysis {
  scoringVersion: string;
  dataAsOf: string;
  priorityCandidates: DeterministicScoredEntity[];
  risks: ChiefOfStaffRisk[];
  blockers: ChiefOfStaffBlocker[];
  decisions: ChiefOfStaffDecision[];
  safeToIgnore: ChiefOfStaffIgnoreItem[];
  reconciliation: ChiefOfStaffReconciliationHealth;
  sourceRecordCount: number;
  latestActivityAt: string | null;
}
