'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FOCUS_LEVEL_META, PROJECT_STATUS_META, PROJECT_SORT_OPTIONS, CATEGORY_META } from '@/features/projects/constants';

interface ProjectFiltersProps {
  categories?: string[];
}

/**
 * Filters are encoded entirely in the URL (search params), not component
 * state — so a filtered view is bookmarkable/shareable and survives a
 * refresh, and the actual data fetch stays server-side in page.tsx.
 */
export function ProjectFilters({ categories }: ProjectFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function clearFilters() {
    startTransition(() => {
      router.push(pathname);
    });
  }

  const hasFilters = Array.from(searchParams.keys()).length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={isPending}>
      <Input
        placeholder="Search projects…"
        defaultValue={searchParams.get('q') ?? ''}
        onChange={(e) => updateParam('q', e.target.value)}
        className="w-56"
        aria-label="Search projects"
      />

      <select
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
        defaultValue={searchParams.get('focus') ?? ''}
        onChange={(e) => updateParam('focus', e.target.value)}
        aria-label="Filter by focus level"
      >
        <option value="">All focus levels</option>
        {Object.entries(FOCUS_LEVEL_META).map(([level, meta]) => (
          <option key={level} value={level}>
            L{level} · {meta.label}
          </option>
        ))}
      </select>

      <select
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
        defaultValue={searchParams.get('status') ?? ''}
        onChange={(e) => updateParam('status', e.target.value)}
        aria-label="Filter by status"
      >
        <option value="">All statuses</option>
        {Object.entries(PROJECT_STATUS_META).map(([value, meta]) => (
          <option key={value} value={value}>
            {meta.label}
          </option>
        ))}
      </select>

      <select
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
        defaultValue={searchParams.get('category') ?? ''}
        onChange={(e) => updateParam('category', e.target.value)}
        aria-label="Filter by category"
      >
        <option value="">All categories</option>
        {Object.entries(CATEGORY_META).map(([value, meta]) => (
          <option key={value} value={value}>
            {meta.label}
          </option>
        ))}
      </select>

      <select
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
        defaultValue={searchParams.get('sort') ?? 'priority_score'}
        onChange={(e) => updateParam('sort', e.target.value)}
        aria-label="Sort by"
      >
        {PROJECT_SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            Sort: {option.label}
          </option>
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
