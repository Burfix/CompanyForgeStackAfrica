import type { ProjectStatus, FocusLevel } from '@/schemas/project.schema';

export const FOCUS_LEVEL_META: Record<FocusLevel, { label: string; description: string }> = {
  1: { label: 'Critical', description: 'Needs founder attention now — actively blocking or highest-stakes.' },
  2: { label: 'Active', description: 'In motion, being worked day to day.' },
  3: { label: 'Development', description: 'Progressing at a normal, non-urgent pace.' },
  4: { label: 'Waiting', description: 'Blocked on someone or something outside your control.' },
  5: { label: 'Parked', description: 'Deliberately not being worked right now.' },
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

export const PROJECT_SORT_OPTIONS = [
  { value: 'priority_score', label: 'Priority score' },
  { value: 'target_date', label: 'Target date' },
  { value: 'last_activity_at', label: 'Last activity' },
] as const;

export type ProjectSortOption = (typeof PROJECT_SORT_OPTIONS)[number]['value'];
