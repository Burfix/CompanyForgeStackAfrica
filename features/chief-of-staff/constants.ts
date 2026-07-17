import type {
  ChiefOfStaffUrgency,
  ChiefOfStaffConfidence,
  ChiefOfStaffRiskCategory,
  ChiefOfStaffBlockerKind,
  ChiefOfStaffChangeType,
  ChiefOfStaffFreshness,
  ChiefOfStaffEvidenceEntityType,
} from '@/types/chief-of-staff';

export const URGENCY_META: Record<ChiefOfStaffUrgency, { label: string; className: string }> = {
  urgent: { label: 'Urgent', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
  high: { label: 'High', className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  medium: { label: 'Medium', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  low: { label: 'Low', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
};

export const CONFIDENCE_META: Record<ChiefOfStaffConfidence, { label: string }> = {
  high: { label: 'High confidence' },
  medium: { label: 'Medium confidence' },
  low: { label: 'Low confidence' },
};

export const RISK_CATEGORY_META: Record<ChiefOfStaffRiskCategory, { label: string }> = {
  commercial: { label: 'Commercial' },
  customer: { label: 'Customer' },
  delivery: { label: 'Delivery' },
  technical: { label: 'Technical' },
  operational: { label: 'Operational' },
  financial: { label: 'Financial' },
  fundraising: { label: 'Fundraising' },
  compliance: { label: 'Compliance' },
  founder_capacity: { label: 'Founder capacity' },
  data_integrity: { label: 'Data integrity' },
  deadline: { label: 'Deadline' },
  dependency: { label: 'Dependency' },
};

export const BLOCKER_KIND_META: Record<ChiefOfStaffBlockerKind, { label: string }> = {
  blocked: { label: 'Blocked' },
  waiting: { label: 'Waiting' },
  missing_information: { label: 'Missing information' },
  dependency: { label: 'Dependency' },
  founder_decision_required: { label: 'Founder decision required' },
};

export const CHANGE_TYPE_META: Record<ChiefOfStaffChangeType, { label: string }> = {
  new_project: { label: 'New project' },
  project_health_worsened: { label: 'Project health worsened' },
  project_health_improved: { label: 'Project health improved' },
  project_became_founder_required: { label: 'Project became founder-required' },
  new_overdue_milestone: { label: 'New overdue milestone' },
  milestone_completed: { label: 'Milestone completed' },
  task_became_blocked: { label: 'Task became blocked' },
  task_completed: { label: 'Task completed' },
  priority_changed: { label: 'Priority changed' },
  progress_changed: { label: 'Progress changed' },
  deadline_changed: { label: 'Deadline changed' },
  waiting_on_changed: { label: 'Waiting-on changed' },
  reconciliation_discrepancy_appeared: { label: 'Reconciliation discrepancy appeared' },
  reconciliation_discrepancy_resolved: { label: 'Reconciliation discrepancy resolved' },
  risk_entered_top_set: { label: 'New top risk' },
  risk_left_top_set: { label: 'Risk resolved' },
};

export const FRESHNESS_META: Record<ChiefOfStaffFreshness, { label: string; className: string }> = {
  current: { label: 'Current', className: 'text-green-400' },
  new_activity_available: { label: 'New activity available', className: 'text-yellow-400' },
  stale: { label: 'Stale', className: 'text-orange-400' },
  integrity_warning: { label: 'Integrity warning', className: 'text-red-400' },
};

/** Bounds referenced consistently by the evidence repository, evidence
 * packet builder, and the analysis engine — centralised here so "how much
 * data does the Chief of Staff look at" is answerable in one place. */
export const CHIEF_OF_STAFF_BOUNDS = {
  maxProjects: 60,
  maxMilestones: 150,
  maxOpenTasks: 300,
  maxRecentlyCompletedTasks: 100,
  recentlyCompletedTaskWindowDays: 14,
  maxActivityEvents: 200,
  activityWindowDays: 7,
  maxTextFieldLength: 400,
  staleGenerationRecoveryMinutes: 10,
} as const;

/**
 * Small display label for how a briefing was triggered (Slice 5.1) —
 * "Fallback" takes precedence over source, since a founder reading a
 * fallback_ready briefing cares first that it's deterministic-only, not
 * whether cron or a person kicked it off.
 */
export function getBriefingSourceLabel(generationSource: string, status: string): 'Scheduled' | 'Manual' | 'Fallback' {
  if (status === 'fallback_ready') return 'Fallback';
  return generationSource === 'cron' ? 'Scheduled' : 'Manual';
}

/** Server-validated route builder for evidence links — the model never
 * supplies a URL; the UI always derives it from entity_type/entity_id
 * through this single function, so an arbitrary or cross-organisation URL
 * from a model response is structurally impossible. */
export function evidenceEntityRoute(entityType: ChiefOfStaffEvidenceEntityType, entityId: string): string | null {
  switch (entityType) {
    case 'project':
      return `/projects/${entityId}`;
    case 'milestone':
      return `/milestones/${entityId}`;
    case 'task':
      return `/tasks/${entityId}`;
    case 'activity':
      return '/activity';
    default:
      return null;
  }
}
