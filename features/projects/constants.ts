import type {
  ProjectStatus,
  FocusLevel,
  ProjectCategory,
  PriorityLevel,
  ReviewCadence,
  AttentionMode,
  ProjectHealth,
  BusinessImpact,
  DependencyType,
} from '@/schemas/project.schema';
import { PRIORITY_LEVEL_SCORE_FALLBACK } from '@/schemas/project.schema';

export { PRIORITY_LEVEL_SCORE_FALLBACK };

/**
 * Visible hierarchy: "L1 · Critical" etc, each with a red/orange/yellow/
 * neutral/muted indicator class and a short description shown beneath the
 * selected value. Indicators are never the only signal — every usage pairs
 * the dot with the text label.
 */
export const FOCUS_LEVEL_META: Record<FocusLevel, { label: string; display: string; description: string; indicatorClass: string }> = {
  1: {
    label: 'Critical',
    display: 'L1 · Critical',
    description: 'Immediate company, customer, funding or production impact.',
    indicatorClass: 'bg-red-500',
  },
  2: {
    label: 'Active',
    display: 'L2 · Active',
    description: 'In motion, being worked day to day.',
    indicatorClass: 'bg-orange-500',
  },
  3: {
    label: 'Development',
    display: 'L3 · Development',
    description: 'Progressing at a normal, non-urgent pace.',
    indicatorClass: 'bg-yellow-500',
  },
  4: {
    label: 'Waiting',
    display: 'L4 · Waiting',
    description: 'Blocked on someone or something outside your control.',
    indicatorClass: 'bg-zinc-400',
  },
  5: {
    label: 'Parked',
    display: 'L5 · Parked',
    description: 'Deliberately not being worked right now.',
    indicatorClass: 'bg-zinc-700',
  },
};

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; description: string; tone: 'neutral' | 'positive' | 'warning' | 'danger' }> = {
  proposed: { label: 'Proposed', description: 'Not yet started.', tone: 'neutral' },
  active: { label: 'Active', description: 'Underway.', tone: 'positive' },
  at_risk: { label: 'At Risk', description: 'Underway but trending off track.', tone: 'warning' },
  blocked: { label: 'Blocked', description: 'Stalled on a specific blocker.', tone: 'danger' },
  completed: { label: 'Completed', description: 'Done.', tone: 'positive' },
  parked: { label: 'Parked', description: 'Deliberately paused.', tone: 'neutral' },
  cancelled: { label: 'Cancelled', description: 'Will not be pursued.', tone: 'neutral' },
};

export const CATEGORY_META: Record<ProjectCategory, { label: string }> = {
  fundraising: { label: 'Fundraising' },
  pilot: { label: 'Pilot' },
  customer: { label: 'Customer' },
  engineering: { label: 'Engineering' },
  product: { label: 'Product' },
  marketing: { label: 'Marketing' },
  partnership: { label: 'Partnership' },
  operations: { label: 'Operations' },
  research: { label: 'Research' },
  finance: { label: 'Finance' },
};

export const PRIORITY_LEVEL_META: Record<PriorityLevel, { label: string; tone: 'neutral' | 'positive' | 'warning' | 'danger' }> = {
  urgent: { label: 'Urgent', tone: 'danger' },
  high: { label: 'High', tone: 'warning' },
  medium: { label: 'Medium', tone: 'neutral' },
  low: { label: 'Low', tone: 'neutral' },
};

export const REVIEW_CADENCE_META: Record<ReviewCadence, { label: string }> = {
  weekly: { label: 'Weekly' },
  biweekly: { label: 'Every two weeks' },
  monthly: { label: 'Monthly' },
  quarterly: { label: 'Quarterly' },
  milestone_based: { label: 'At milestones' },
  none: { label: 'No fixed cadence' },
};

export const ATTENTION_MODE_META: Record<AttentionMode, { label: string; description: string; tone: 'neutral' | 'positive' | 'warning' | 'danger' }> = {
  founder: { label: 'Founder required', description: 'Needs the founder’s direct attention right now.', tone: 'danger' },
  delegated: { label: 'Delegated', description: 'Handed off to a named owner; founder is not blocking it.', tone: 'warning' },
  team: { label: 'Team-owned', description: 'Running through normal team process.', tone: 'positive' },
  no_attention: { label: 'No active attention required', description: 'Nothing outstanding right now.', tone: 'neutral' },
};

/** Kept in sync with attentionMode by the service layer — founder maps to
 * true, every other value maps to false. See project.service.ts. */
export function attentionModeRequiresFounder(mode: AttentionMode): boolean {
  return mode === 'founder';
}

export const HEALTH_META: Record<ProjectHealth, { label: string; tone: 'neutral' | 'positive' | 'warning' | 'danger'; requiresNote: boolean }> = {
  healthy: { label: 'Healthy', tone: 'positive', requiresNote: false },
  needs_attention: { label: 'Needs Attention', tone: 'warning', requiresNote: false },
  at_risk: { label: 'At Risk', tone: 'warning', requiresNote: true },
  off_track: { label: 'Off Track', tone: 'danger', requiresNote: true },
  unknown: { label: 'Not Assessed', tone: 'neutral', requiresNote: false },
};

/** Legacy DB value `on_track` (pre-0006 rows) displays exactly like `healthy`. */
export function normalizeHealth(health: string): ProjectHealth {
  if (health === 'on_track') return 'healthy';
  if (health in HEALTH_META) return health as ProjectHealth;
  return 'unknown';
}

export const BUSINESS_IMPACT_META: Record<BusinessImpact, { label: string }> = {
  revenue: { label: 'Revenue' },
  customer: { label: 'Customer' },
  fundraising: { label: 'Fundraising' },
  product: { label: 'Product' },
  strategic: { label: 'Strategic' },
  operational: { label: 'Operational' },
  reputational: { label: 'Reputational' },
  compliance: { label: 'Compliance' },
};

export const DEPENDENCY_TYPE_META: Record<DependencyType, { label: string }> = {
  blocks: { label: 'Blocks' },
  depends_on: { label: 'Depends on' },
  related_to: { label: 'Related to' },
};

export const PROJECT_SORT_OPTIONS = [
  { value: 'priority_score', label: 'Priority score' },
  { value: 'target_date', label: 'Target date' },
  { value: 'last_activity_at', label: 'Last activity' },
  { value: 'next_review_at', label: 'Next review' },
  { value: 'progress_percent', label: 'Progress' },
] as const;

export type ProjectSortOption = (typeof PROJECT_SORT_OPTIONS)[number]['value'];
