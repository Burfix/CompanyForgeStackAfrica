import type { Tables } from '@/types/database.types';
import type {
  ChiefOfStaffPriority,
  ChiefOfStaffRisk,
  ChiefOfStaffBlocker,
  ChiefOfStaffDecision,
  ChiefOfStaffIgnoreItem,
  ChiefOfStaffChange,
} from '@/types/chief-of-staff';

type BriefingRow = Tables<'chief_of_staff_briefings'>;

/**
 * Every jsonb column on chief_of_staff_briefings was written by
 * chiefOfStaffBriefingOutputSchema.parse(...) before storage (see
 * services/chief-of-staff.service.ts) — so casting here reflects an
 * already-validated shape, not a leap of faith on unchecked data.
 */
export interface ParsedBriefingContent {
  topPriorities: ChiefOfStaffPriority[];
  risks: ChiefOfStaffRisk[];
  blockers: ChiefOfStaffBlocker[];
  decisions: ChiefOfStaffDecision[];
  safeToIgnore: ChiefOfStaffIgnoreItem[];
  changes: ChiefOfStaffChange[];
  observations: string[];
}

export function parseBriefingContent(briefing: BriefingRow): ParsedBriefingContent {
  return {
    topPriorities: (briefing.top_priorities as unknown as ChiefOfStaffPriority[]) ?? [],
    risks: (briefing.risks as unknown as ChiefOfStaffRisk[]) ?? [],
    blockers: (briefing.blockers as unknown as ChiefOfStaffBlocker[]) ?? [],
    decisions: (briefing.decisions_required as unknown as ChiefOfStaffDecision[]) ?? [],
    safeToIgnore: (briefing.safe_to_ignore as unknown as ChiefOfStaffIgnoreItem[]) ?? [],
    changes: (briefing.changes_since_previous as unknown as ChiefOfStaffChange[]) ?? [],
    observations: (briefing.observations as unknown as string[]) ?? [],
  };
}
