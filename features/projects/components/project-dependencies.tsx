'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { StatusPill, HealthPill } from '@/components/shared/status-badge';
import { DEPENDENCY_TYPE_META } from '@/features/projects/constants';
import { addProjectDependencyAction, removeProjectDependencyAction } from '@/features/projects/actions';

interface DependencyRow {
  id: string;
  dependency_type: string;
  note: string | null;
  project: { id: string; name: string; status: string; health: string };
}

interface ProjectDependenciesProps {
  projectId: string;
  outgoing: DependencyRow[];
  incoming: DependencyRow[];
  selectableProjects: { id: string; name: string }[];
}

/**
 * "Depends on" (outgoing) and "depended on by" (incoming) are shown
 * separately — collapsing them into one list would hide which direction a
 * blocker actually runs, which is the whole point of tracking dependencies.
 */
export function ProjectDependencies({ projectId, outgoing, incoming, selectableProjects }: ProjectDependenciesProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dependsOnProjectId, setDependsOnProjectId] = useState('');
  const [dependencyType, setDependencyType] = useState('depends_on');

  function handleAdd() {
    if (!dependsOnProjectId) return;
    setError(null);
    startTransition(async () => {
      const result = await addProjectDependencyAction(projectId, dependsOnProjectId, dependencyType);
      if (result.formError) {
        setError(result.formError);
      } else {
        setDependsOnProjectId('');
        router.refresh();
      }
    });
  }

  function handleRemove(dependencyId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeProjectDependencyAction(projectId, dependencyId);
      if (result.formError) setError(result.formError);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">This project depends on</p>
        {outgoing.length === 0 ? (
          <p className="text-sm text-muted-foreground">No dependencies recorded.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {outgoing.map((dep) => (
              <div key={dep.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{DEPENDENCY_TYPE_META[dep.dependency_type as keyof typeof DEPENDENCY_TYPE_META]?.label ?? dep.dependency_type}</span>
                  <Link href={`/projects/${dep.project.id}`} className="text-foreground hover:underline">
                    {dep.project.name}
                  </Link>
                  <StatusPill status={dep.project.status} />
                  <HealthPill health={dep.project.health} />
                </div>
                <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => handleRemove(dep.id)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Depended on by</p>
        {incoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No other projects depend on this one.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {incoming.map((dep) => (
              <div key={dep.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <span className="text-xs text-muted-foreground">{DEPENDENCY_TYPE_META[dep.dependency_type as keyof typeof DEPENDENCY_TYPE_META]?.label ?? dep.dependency_type}</span>
                <Link href={`/projects/${dep.project.id}`} className="text-foreground hover:underline">
                  {dep.project.name}
                </Link>
                <StatusPill status={dep.project.status} />
                <HealthPill health={dep.project.health} />
              </div>
            ))}
          </div>
        )}
      </div>

      {selectableProjects.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <select
            value={dependencyType}
            onChange={(e) => setDependencyType(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
            aria-label="Dependency type"
          >
            {Object.entries(DEPENDENCY_TYPE_META).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
          <select
            value={dependsOnProjectId}
            onChange={(e) => setDependsOnProjectId(e.target.value)}
            className="h-9 flex-1 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
            aria-label="Select project"
          >
            <option value="">Select a project…</option>
            {selectableProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" disabled={isPending || !dependsOnProjectId} onClick={handleAdd}>
            Add dependency
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
