import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EvidenceLinks } from '@/features/chief-of-staff/components/evidence-links';
import { FeedbackForm } from '@/features/chief-of-staff/components/feedback-form';
import { URGENCY_META, CONFIDENCE_META, RISK_CATEGORY_META, BLOCKER_KIND_META, CHANGE_TYPE_META, FRESHNESS_META, getBriefingSourceLabel } from '@/features/chief-of-staff/constants';
import { parseBriefingContent } from '@/features/chief-of-staff/utils';
import type { ChiefOfStaffFreshness } from '@/types/chief-of-staff';
import type { Tables } from '@/types/database.types';

type BriefingRow = Tables<'chief_of_staff_briefings'>;

function UrgencyBadge({ urgency }: { urgency: keyof typeof URGENCY_META }) {
  const meta = URGENCY_META[urgency];
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}>{meta.label}</span>;
}

/**
 * Full-briefing renderer, shared by /chief-of-staff and
 * /chief-of-staff/briefings/[briefingId] — this is a pure read view. No
 * button here can create/edit/complete/cancel a Project/Milestone/Task;
 * the only interactive element is feedback (FeedbackForm), which writes
 * exclusively to chief_of_staff_feedback.
 */
export function BriefingView({ briefing, freshness, showFeedback = true }: { briefing: BriefingRow; freshness: ChiefOfStaffFreshness; showFeedback?: boolean }) {
  const content = parseBriefingContent(briefing);
  const freshnessMeta = FRESHNESS_META[freshness];
  const isFallback = briefing.status === 'fallback_ready';
  const sourceLabel = getBriefingSourceLabel(briefing.generation_source, briefing.status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{briefing.title}</h1>
          <p className="text-sm text-muted-foreground">
            Data as of {new Date(briefing.data_as_of).toLocaleString()} · {briefing.briefing_type} briefing · {sourceLabel}
            {isFallback ? ' (AI unavailable)' : !isFallback && briefing.model_name ? ` · ${briefing.model_name}` : ''}
          </p>
        </div>
        <span className={`text-xs font-medium ${freshnessMeta.className}`}>{freshnessMeta.label}</span>
      </div>

      <Card>
        <CardHeader><CardTitle>Executive Summary</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-foreground">{briefing.executive_summary}</p></CardContent>
      </Card>

      {content.topPriorities.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Top Priorities</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {content.topPriorities.map((p) => (
              <div key={p.id} className="flex flex-col gap-1.5 rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{p.title}</p>
                  <UrgencyBadge urgency={p.urgency} />
                </div>
                <p className="text-xs text-muted-foreground">{p.reason}</p>
                <p className="text-xs text-foreground">Recommended focus: {p.recommended_focus}</p>
                <EvidenceLinks evidence={p.evidence} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {content.decisions.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Decisions Required</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {content.decisions.map((d) => (
              <div key={d.id} className="flex flex-col gap-1.5 rounded-md border border-border p-3">
                <p className="text-sm font-medium text-foreground">{d.title}</p>
                <p className="text-xs text-foreground">{d.question}</p>
                <p className="text-xs text-muted-foreground">Why now: {d.why_now}</p>
                <p className="text-xs text-muted-foreground">If delayed: {d.consequence_of_delay}</p>
                {d.deadline ? <p className="text-xs text-muted-foreground">Deadline: {d.deadline}</p> : null}
                <EvidenceLinks evidence={d.evidence} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {content.risks.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Risks</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {content.risks.map((r) => (
              <div key={r.id} className="flex flex-col gap-1.5 rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{r.title}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                      {RISK_CATEGORY_META[r.category].label}
                    </span>
                    <UrgencyBadge urgency={r.severity} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{r.explanation}</p>
                <p className="text-xs text-foreground">Likely consequence: {r.likely_consequence}</p>
                <p className="text-[11px] text-muted-foreground">{CONFIDENCE_META[r.confidence].label} · {r.time_horizon}</p>
                <EvidenceLinks evidence={r.evidence} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {content.blockers.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Blockers &amp; Waiting Items</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {content.blockers.map((b) => (
              <div key={b.id} className="flex flex-col gap-1.5 rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{b.title}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                      {BLOCKER_KIND_META[b.kind].label}
                    </span>
                    <UrgencyBadge urgency={b.suggested_attention} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{b.reason}</p>
                {b.due_date ? <p className="text-xs text-muted-foreground">Due: {b.due_date}</p> : null}
                <EvidenceLinks evidence={b.evidence} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {content.changes.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Changes Since Previous Briefing</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {content.changes.map((c) => (
              <div key={c.id} className="flex flex-col gap-1.5 rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-foreground">{c.description}</p>
                  <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                    {CHANGE_TYPE_META[c.change_type].label}
                  </span>
                </div>
                <EvidenceLinks evidence={c.evidence} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {content.safeToIgnore.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Safe to Ignore</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {content.safeToIgnore.map((s) => (
              <div key={s.id} className="flex flex-col gap-1.5 rounded-md border border-border p-3">
                <p className="text-sm text-foreground">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.reason}</p>
                <p className="text-[11px] text-muted-foreground">Reactivates if: {s.reactivation_condition}</p>
                <EvidenceLinks evidence={s.evidence} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {content.observations.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Observations</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {content.observations.map((o, i) => (
              <p key={i} className="text-xs text-muted-foreground">{o}</p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {showFeedback ? <FeedbackForm briefingId={briefing.id} /> : null}
    </div>
  );
}
