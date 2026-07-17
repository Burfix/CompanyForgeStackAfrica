import { z } from 'zod';

/**
 * Zod contracts for the Chief of Staff briefing output (Slice 5).
 *
 * This is the ONLY shape ever written to chief_of_staff_briefings — raw
 * model output is never stored (see services/ai/chief-of-staff-provider.ts).
 * Bounded lengths/counts here are deliberate cost and quality controls,
 * not arbitrary: they keep the evidence packet and stored briefing small,
 * and they are exactly what forces "maximum 3 top priorities" etc. to be
 * a real, enforced constraint rather than a prompt suggestion.
 */

const MAX_TEXT = 600;
const MAX_TITLE = 160;
const MAX_LIST_ITEMS = 8;

const shortText = (max = MAX_TEXT) => z.string().trim().min(1).max(max);
const title = z.string().trim().min(1).max(MAX_TITLE);

export const CHIEF_OF_STAFF_URGENCY_VALUES = ['urgent', 'high', 'medium', 'low'] as const;
export const chiefOfStaffUrgencySchema = z.enum(CHIEF_OF_STAFF_URGENCY_VALUES);

export const CHIEF_OF_STAFF_CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;
export const chiefOfStaffConfidenceSchema = z.enum(CHIEF_OF_STAFF_CONFIDENCE_VALUES);

export const CHIEF_OF_STAFF_EVIDENCE_ENTITY_TYPES = ['project', 'milestone', 'task', 'activity'] as const;
export const chiefOfStaffEvidenceEntityTypeSchema = z.enum(CHIEF_OF_STAFF_EVIDENCE_ENTITY_TYPES);

export const CHIEF_OF_STAFF_RISK_CATEGORIES = [
  'commercial',
  'customer',
  'delivery',
  'technical',
  'operational',
  'financial',
  'fundraising',
  'compliance',
  'founder_capacity',
  'data_integrity',
  'deadline',
  'dependency',
] as const;
export const chiefOfStaffRiskCategorySchema = z.enum(CHIEF_OF_STAFF_RISK_CATEGORIES);

export const CHIEF_OF_STAFF_BLOCKER_KINDS = ['blocked', 'waiting', 'missing_information', 'dependency', 'founder_decision_required'] as const;
export const chiefOfStaffBlockerKindSchema = z.enum(CHIEF_OF_STAFF_BLOCKER_KINDS);

export const CHIEF_OF_STAFF_CHANGE_TYPES = [
  'new_project',
  'project_health_worsened',
  'project_health_improved',
  'project_became_founder_required',
  'new_overdue_milestone',
  'milestone_completed',
  'task_became_blocked',
  'task_completed',
  'priority_changed',
  'progress_changed',
  'deadline_changed',
  'waiting_on_changed',
  'reconciliation_discrepancy_appeared',
  'reconciliation_discrepancy_resolved',
  'risk_entered_top_set',
  'risk_left_top_set',
] as const;
export const chiefOfStaffChangeTypeSchema = z.enum(CHIEF_OF_STAFF_CHANGE_TYPES);

export const CHIEF_OF_STAFF_BRIEFING_TYPES = ['daily', 'manual', 'fallback'] as const;
export const chiefOfStaffBriefingTypeSchema = z.enum(CHIEF_OF_STAFF_BRIEFING_TYPES);

export const CHIEF_OF_STAFF_BRIEFING_STATUSES = ['generating', 'ready', 'fallback_ready', 'failed', 'superseded'] as const;
export const chiefOfStaffBriefingStatusSchema = z.enum(CHIEF_OF_STAFF_BRIEFING_STATUSES);

export const CHIEF_OF_STAFF_FEEDBACK_TYPES = ['useful', 'inaccurate', 'missing_context', 'wrong_priority', 'too_verbose', 'too_vague'] as const;
export const chiefOfStaffFeedbackTypeSchema = z.enum(CHIEF_OF_STAFF_FEEDBACK_TYPES);

/** entity_id must be a real UUID from the operational tables — never a
 * free-form string the model invented. field/value are optional
 * annotations (e.g. "attention_mode" / "founder") for UI display only. */
export const chiefOfStaffEvidenceReferenceSchema = z.object({
  entity_type: chiefOfStaffEvidenceEntityTypeSchema,
  entity_id: z.string().uuid(),
  label: shortText(200),
  field: z.string().trim().max(60).optional(),
  value: z.string().trim().max(120).optional(),
});

const evidenceList = z.array(chiefOfStaffEvidenceReferenceSchema).min(1).max(6);

export const chiefOfStaffPrioritySchema = z.object({
  id: z.string().trim().min(1).max(100),
  title,
  reason: shortText(),
  recommended_focus: shortText(),
  urgency: chiefOfStaffUrgencySchema,
  confidence: chiefOfStaffConfidenceSchema,
  evidence: evidenceList,
});

export const chiefOfStaffRiskSchema = z.object({
  id: z.string().trim().min(1).max(100),
  title,
  category: chiefOfStaffRiskCategorySchema,
  severity: chiefOfStaffUrgencySchema,
  explanation: shortText(),
  likely_consequence: shortText(),
  confidence: chiefOfStaffConfidenceSchema,
  time_horizon: z.string().trim().min(1).max(80),
  evidence: evidenceList,
});

export const chiefOfStaffBlockerSchema = z.object({
  id: z.string().trim().min(1).max(100),
  kind: chiefOfStaffBlockerKindSchema,
  title,
  project_id: z.string().uuid().optional(),
  reason: shortText(),
  waiting_on: shortText(300).optional(),
  age_days: z.number().int().min(0).max(3650).optional(),
  due_date: z.string().date().optional(),
  suggested_attention: chiefOfStaffUrgencySchema,
  evidence: evidenceList,
});

export const chiefOfStaffDecisionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  title,
  question: shortText(),
  why_now: shortText(),
  deadline: z.string().date().optional(),
  consequence_of_delay: shortText(),
  missing_information: shortText(300).optional(),
  confidence: chiefOfStaffConfidenceSchema,
  evidence: evidenceList,
});

export const chiefOfStaffIgnoreItemSchema = z.object({
  id: z.string().trim().min(1).max(100),
  title,
  reason: shortText(),
  valid_until: z.string().date().optional(),
  reactivation_condition: shortText(),
  evidence: evidenceList,
});

export const chiefOfStaffChangeSchema = z.object({
  id: z.string().trim().min(1).max(100),
  change_type: chiefOfStaffChangeTypeSchema,
  description: shortText(),
  previous_value: z.string().trim().max(200).optional(),
  new_value: z.string().trim().max(200).optional(),
  evidence: evidenceList,
});

/**
 * The full structured output contract — this is what the AI provider must
 * return (see services/ai/chief-of-staff-provider.ts) and what the
 * deterministic fallback formatter also produces (see
 * lib/chief-of-staff-fallback.ts), so both paths are validated identically
 * before ever being stored.
 */
export const chiefOfStaffBriefingOutputSchema = z.object({
  title,
  executive_summary: shortText(1200),
  top_priorities: z.array(chiefOfStaffPrioritySchema).max(3),
  risks: z.array(chiefOfStaffRiskSchema).max(MAX_LIST_ITEMS),
  blockers: z.array(chiefOfStaffBlockerSchema).max(MAX_LIST_ITEMS),
  decisions_required: z.array(chiefOfStaffDecisionSchema).max(MAX_LIST_ITEMS),
  safe_to_ignore: z.array(chiefOfStaffIgnoreItemSchema).max(MAX_LIST_ITEMS),
  changes_since_previous: z.array(chiefOfStaffChangeSchema).max(MAX_LIST_ITEMS),
  observations: z.array(shortText(300)).max(MAX_LIST_ITEMS),
});
export type ChiefOfStaffBriefingOutputParsed = z.infer<typeof chiefOfStaffBriefingOutputSchema>;

// ---------------------------------------------------------------------
// Service-layer input schemas
// ---------------------------------------------------------------------

export const generateBriefingSchema = z.object({
  briefingType: z.enum(['daily', 'manual']).default('manual'),
  force: z.boolean().default(false),
});
export type GenerateBriefingInput = z.infer<typeof generateBriefingSchema>;

export const submitBriefingFeedbackSchema = z.object({
  briefingId: z.string().uuid(),
  feedbackType: chiefOfStaffFeedbackTypeSchema,
  rating: z.enum(['positive', 'negative']).optional(),
  comment: z.string().trim().max(1000).optional(),
});
export type SubmitBriefingFeedbackInput = z.infer<typeof submitBriefingFeedbackSchema>;
