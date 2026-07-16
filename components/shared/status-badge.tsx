import { cn } from '@/lib/utils';
import type { Database } from '@/types/database.types';

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

const FOCUS_LABELS: Record<number, string> = {
  1: 'Critical',
  2: 'Active',
  3: 'Development',
  4: 'Waiting',
  5: 'Parked',
};

export function FocusLevelBadge({ level }: { level: number }) {
  const label = FOCUS_LABELS[level] ?? 'Unknown';
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
      L{level} · {label}
    </span>
  );
}
