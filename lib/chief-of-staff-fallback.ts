/**
 * Deterministic fallback formatter (Slice 5).
 *
 * Produces a valid ChiefOfStaffBriefingOutput directly from the
 * deterministic analysis, with no AI call at all. Used whenever:
 *  - AI_API_KEY / AI_PROVIDER / AI_MODEL aren't configured,
 *  - the provider call fails, times out, or returns output that fails
 *    schema/evidence validation,
 *  - or generation is explicitly requested without AI (cost control).
 *
 * The output of this function must satisfy the exact same
 * chiefOfStaffBriefingOutputSchema as the AI path, so the UI never needs
 * to know which path produced a given briefing — only the stored
 * briefing_type/status ('fallback_ready') and model_provider=null tell
 * that story, for the founder's own transparency.
 */

import type { DeterministicCompanyAnalysis, ChiefOfStaffBriefingOutput, ChiefOfStaffChange } from '@/types/chief-of-staff';

function formatPriorityCandidate(candidate: DeterministicCompanyAnalysis['priorityCandidates'][number]) {
  return {
    id: candidate.entityId,
    title: candidate.label,
    reason: candidate.reasons[0] ?? 'Flagged by deterministic scoring.',
    recommended_focus: candidate.reasons.slice(0, 2).join(' '),
    urgency: (candidate.score >= 60 ? 'urgent' : candidate.score >= 35 ? 'high' : candidate.score >= 15 ? 'medium' : 'low') as
      | 'urgent'
      | 'high'
      | 'medium'
      | 'low',
    confidence: 'high' as const,
    evidence: candidate.evidence,
  };
}

function summarize(analysis: DeterministicCompanyAnalysis, changes: ChiefOfStaffChange[]): string {
  const parts: string[] = [];
  parts.push(`${analysis.priorityCandidates.length} project${analysis.priorityCandidates.length === 1 ? '' : 's'} carry active attention score.`);
  if (analysis.risks.length > 0) parts.push(`${analysis.risks.length} risk${analysis.risks.length === 1 ? '' : 's'} identified.`);
  if (analysis.blockers.length > 0) parts.push(`${analysis.blockers.length} blocked/waiting item${analysis.blockers.length === 1 ? '' : 's'}.`);
  if (analysis.decisions.length > 0) parts.push(`${analysis.decisions.length} decision${analysis.decisions.length === 1 ? '' : 's'} need founder input.`);
  if (changes.length > 0) parts.push(`${changes.length} change${changes.length === 1 ? '' : 's'} since the previous briefing.`);
  if (!analysis.reconciliation.isKnownConsistent && analysis.reconciliation.lastRunAt) {
    parts.push('Execution reconciliation reported outstanding data-integrity issues.');
  }
  return parts.length > 0 ? parts.join(' ') : 'No items currently require founder attention based on recorded data.';
}

export function buildFallbackBriefing(analysis: DeterministicCompanyAnalysis, changes: ChiefOfStaffChange[]): ChiefOfStaffBriefingOutput {
  return {
    title: 'Operational Briefing (Deterministic)',
    executive_summary: summarize(analysis, changes),
    top_priorities: analysis.priorityCandidates.slice(0, 3).map(formatPriorityCandidate),
    risks: analysis.risks.slice(0, 8),
    blockers: analysis.blockers.slice(0, 8),
    decisions_required: analysis.decisions.slice(0, 8),
    safe_to_ignore: analysis.safeToIgnore.slice(0, 8),
    changes_since_previous: changes.slice(0, 8),
    observations:
      analysis.priorityCandidates.length === 0 && analysis.risks.length === 0 && analysis.blockers.length === 0
        ? ['No projects currently require founder attention based on recorded data.']
        : [],
  };
}
