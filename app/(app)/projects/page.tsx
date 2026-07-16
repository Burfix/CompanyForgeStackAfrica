import { getCurrentOrg } from '@/lib/auth/session';
import { projectsRepository } from '@/repositories/projects.repository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HealthPill, FocusLevelBadge } from '@/components/shared/status-badge';

/** Full projects CRUD (create/edit forms, filters) ships in Slice 2. This is read-only for now. */
export default async function ProjectsPage() {
  const org = await getCurrentOrg();
  const projects = await projectsRepository.listByOrg(org.organizationId);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Projects</h1>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {projects.map((project) => (
          <Card key={project.id}>
            <CardHeader>
              <CardTitle className="text-base text-foreground">{project.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <FocusLevelBadge level={project.focus_level} />
              <HealthPill health={project.health} />
            </CardContent>
          </Card>
        ))}
        {projects.length === 0 ? <p className="text-sm text-muted-foreground">No projects yet.</p> : null}
      </div>
    </div>
  );
}
