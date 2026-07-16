import { cn } from '@/lib/utils';
import type { Database } from '@/types/database.types';
import type { ProjectStatus } from '@/schemas/project.schema';
import { FOCUS_LEVEL_META, PROJECT_STATUS_META } from '@/features/projects/constants';

type ProjectHealth = Database['public']['Enums']['project_health'];

const HEALTH_STYLES: Record<ProjectHealth, string> = {
  on_track: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  at_risk: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  off_track: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const HEALTH_LABELS: Record<ProjectHealth, string> = {
  on_track: 'On Track',
  at_risk: 'At Risk',
  off_track: 'Off Track',
};

/** Health pill used on project cards and Founder HQ. Color is the signal — keep labels short. */
export function HealthPill({ health }: { health: ProjectHealth }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', HEALTH_STYLES[health])}>
      {HEALTH_LABELS[health]}
    </span>
  );
}

export function FocusLevelBadge({ level }: { level: number }) {
  const meta = FOCUS_LEVEL_META[level as 1 | 2 | 3 | 4 | 5];
  return (
    <span
      title={meta?.description}
      className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
    >
      L{level} · {meta?.label ?? 'Unknown'}
    </span>
  );
}

const STATUS_TONE_STYLES: Record<string, string> = {
  neutral: 'bg-secondary text-secondary-foreground border-border',
  positive: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  danger: 'bg-red-500/15 text-red-400 border-red-500/30',
};

export function StatusPill({ status }: { status: ProjectStatus | string }) {
  const meta = PROJECT_STATUS_META[status as ProjectStatus];
  const tone = meta?.tone ?? 'neutral';
  return (
    <span
      title={meta?.description}
      className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_TONE_STYLES[tone])}
    >
      {meta?.label ?? status}
    </span>
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
