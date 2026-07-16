import { cn } from '@/lib/utils';
import type { ProjectStatus, PriorityLevel, AttentionMode, BusinessImpact } from '@/schemas/project.schema';
import {
  FOCUS_LEVEL_META,
  PROJECT_STATUS_META,
  HEALTH_META,
  PRIORITY_LEVEL_META,
  ATTENTION_MODE_META,
  BUSINESS_IMPACT_META,
  normalizeHealth,
} from '@/features/projects/constants';

const TONE_STYLES: Record<string, string> = {
  neutral: 'bg-secondary text-secondary-foreground border-border',
  positive: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  danger: 'bg-red-500/15 text-red-400 border-red-500/30',
};

/** Health pill used on project cards, Founder HQ, and the detail summary.
 * Accepts any raw DB value (including the legacy `on_track`) and normalizes
 * it — color is never the only signal, the label is always shown too. */
export function HealthPill({ health }: { health: string }) {
  const normalized = normalizeHealth(health);
  const meta = HEALTH_META[normalized];
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', TONE_STYLES[meta.tone])}>
      {meta.label}
    </span>
  );
}

/** Focus level: always the full "L1 · Critical" label plus a colored dot —
 * never color alone. */
export function FocusLevelBadge({ level, showDescription = false }: { level: number; showDescription?: boolean }) {
  const meta = FOCUS_LEVEL_META[level as 1 | 2 | 3 | 4 | 5];
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span
        title={meta?.description}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
      >
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta?.indicatorClass ?? 'bg-zinc-500')} aria-hidden="true" />
        {meta?.display ?? `L${level}`}
      </span>
      {showDescription && meta ? <span className="text-xs text-muted-foreground">{meta.description}</span> : null}
    </span>
  );
}

export function StatusPill({ status }: { status: ProjectStatus | string }) {
  const meta = PROJECT_STATUS_META[status as ProjectStatus];
  const tone = meta?.tone ?? 'neutral';
  return (
    <span
      title={meta?.description}
      className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', TONE_STYLES[tone])}
    >
      {meta?.label ?? status}
    </span>
  );
}

export function PriorityBadge({ level, score }: { level: PriorityLevel | string; score?: number | null }) {
  const meta = PRIORITY_LEVEL_META[level as PriorityLevel];
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', TONE_STYLES[meta?.tone ?? 'neutral'])}>
      {meta?.label ?? level}
      {score !== undefined && score !== null ? <span className="ml-1 text-[10px] opacity-70">P{score}</span> : null}
    </span>
  );
}

export function AttentionModeBadge({ mode }: { mode: AttentionMode | string }) {
  const meta = ATTENTION_MODE_META[mode as AttentionMode];
  return (
    <span
      title={meta?.description}
      className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', TONE_STYLES[meta?.tone ?? 'neutral'])}
    >
      {meta?.label ?? mode}
    </span>
  );
}

export function BusinessImpactBadges({ impact }: { impact: string[] | null | undefined }) {
  if (!impact?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {impact.map((value) => (
        <span key={value} className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {BUSINESS_IMPACT_META[value as BusinessImpact]?.label ?? value}
        </span>
      ))}
    </div>
  );
}

/** Manual progress for now — see progress_percent comment in
 * schemas/project.schema.ts about milestone-derived progress replacing
 * this in a future slice. */
export function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${clamped}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-xs text-muted-foreground">{clamped}%</span>
    </div>
  );
}

/** Small dot indicator for founder_attention_required — deliberately not a
 * pill, so it reads as an alert marker rather than another status label. */
export function AttentionIndicator({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span
      title="Founder attention required"
      className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500"
      aria-label="Founder attention required"
    />
  );
}
