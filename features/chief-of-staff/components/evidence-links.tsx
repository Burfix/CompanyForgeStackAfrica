import Link from 'next/link';
import { evidenceEntityRoute } from '@/features/chief-of-staff/constants';
import type { ChiefOfStaffEvidenceReference } from '@/types/chief-of-staff';

/**
 * Renders every evidence reference as a link back to the real record it
 * points at. The route is always derived server-side by
 * evidenceEntityRoute(entity_type, entity_id) — never taken from anything
 * the model returned — so a briefing can never link anywhere other than
 * a real project/milestone/task/activity page within this organization.
 */
export function EvidenceLinks({ evidence }: { evidence: ChiefOfStaffEvidenceReference[] }) {
  if (evidence.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {evidence.map((e, i) => {
        const href = evidenceEntityRoute(e.entity_type, e.entity_id);
        const key = `${e.entity_type}-${e.entity_id}-${i}`;
        const label = e.label;
        if (!href) {
          return (
            <span key={key} className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
              {label}
            </span>
          );
        }
        return (
          <Link
            key={key}
            href={href}
            className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground hover:border-primary/50"
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
