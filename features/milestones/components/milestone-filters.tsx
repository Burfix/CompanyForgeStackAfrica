'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MILESTONE_STATUS_META, MILESTONE_HEALTH_META, MILESTONE_PRIORITY_META, ATTENTION_MODE_META } from '@/features/milestones/constants';

interface MilestoneFiltersProps {
  projects: { id: string; name: string }[];
  members: { id: string; full_name: string | null }[];
}

/** Same URL-params-as-state pattern as TaskFilters/ProjectFilters. */
export function MilestoneFilters({ projects, members }: MilestoneFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function clearFilters() {
    startTransition(() => router.push(pathname));
  }

  const hasFilters = Array.from(searchParams.keys()).length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={isPending}>
      <Input
        placeholder="Search milestones…"
        defaultValue={searchParams.get('q') ?? ''}
        onChange={(e) => updateParam('q', e.target.value)}
        className="w-56"
        aria-label="Search milestones"
      />

      <select className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground" defaultValue={searchParams.get('project') ?? ''} onChange={(e) => updateParam('project', e.target.value)} aria-label="Filter by project">
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      <select className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground" defaultValue={searchParams.get('owner') ?? ''} onChange={(e) => updateParam('owner', e.target.value)} aria-label="Filter by owner">
        <option value="">All owners</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.full_name ?? m.id}</option>
        ))}
      </select>

      <select className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground" defaultValue={searchParams.get('status') ?? ''} onChange={(e) => updateParam('status', e.target.value)} aria-label="Filter by status">
        <option value="">All statuses</option>
        {Object.entries(MILESTONE_STATUS_META).map(([value, meta]) => (
          <option key={value} value={value}>{meta.label}</option>
        ))}
      </select>

      <select className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground" defaultValue={searchParams.get('health') ?? ''} onChange={(e) => updateParam('health', e.target.value)} aria-label="Filter by health">
        <option value="">All health</option>
        {Object.entries(MILESTONE_HEALTH_META).map(([value, meta]) => (
          <option key={value} value={value}>{meta.label}</option>
        ))}
      </select>

      <select className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground" defaultValue={searchParams.get('priority') ?? ''} onChange={(e) => updateParam('priority', e.target.value)} aria-label="Filter by priority">
        <option value="">All priorities</option>
        {Object.entries(MILESTONE_PRIORITY_META).map(([value, meta]) => (
          <option key={value} value={value}>{meta.label}</option>
        ))}
      </select>

      <select className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground" defaultValue={searchParams.get('attention') ?? ''} onChange={(e) => updateParam('attention', e.target.value)} aria-label="Filter by attention mode">
        <option value="">All attention modes</option>
        {Object.entries(ATTENTION_MODE_META).map(([value, meta]) => (
          <option key={value} value={value}>{meta.label}</option>
        ))}
      </select>

      {hasFilters ? (
        <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
