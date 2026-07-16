import Link from 'next/link';
import { Suspense } from 'react';
import { getCurrentOrg } from '@/lib/auth/session';
import { projectsRepository } from '@/repositories/projects.repository';
import { milestonesRepository } from '@/repositories/milestones.repository';
import { projectDependenciesRepository } from '@/repositories/project-dependencies.repository';
import { Button } from '@/components/ui/button';
import { ProjectFilters } from '@/features/projects/components/project-filters';
import { ProjectCard } from '@/features/projects/components/project-card';
import type { ProjectSortOption } from '@/features/projects/constants';
import type { Enums } from '@/types/database.types';

interface ProjectsPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const org = await getCurrentOrg();
  const params = await searchParams;

  const projects = await projectsRepository.listProjects(org.organizationId, {
    search: params.q,
    focusLevel: params.focus ? Number(params.focus) : undefined,
    status: params.status as Enums<'project_status'> | undefined,
    category: params.category,
    sort: (params.sort as ProjectSortOption) ?? 'priority_score',
  });

  const [nextMilestones, dependencyCounts] = await Promise.all([
    milestonesRepository.listNextForProjects(org.organizationId, projects.map((p) => p.id)),
    projectDependenciesRepository.countForProjects(org.organizationId, projects.map((p) => p.id)),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground">{org.organizationName} — operational portfolio</p>
        </div>
        <Button asChild>
          <Link href="/projects/new">New Project</Link>
        </Button>
      </div>

      <Suspense fallback={null}>
        <ProjectFilters />
      </Suspense>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {Object.values(params).some(Boolean) ? 'No projects match these filters.' : 'No projects yet — create the first one.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project as never}
              nextMilestone={nextMilestones.get(project.id)}
              dependencyCount={dependencyCounts.get(project.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
