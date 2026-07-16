import { getCurrentOrg } from '@/lib/auth/session';
import { projectsRepository } from '@/repositories/projects.repository';
import { organizationsRepository } from '@/repositories/organizations.repository';
import { MilestoneForm } from '@/features/milestones/components/milestone-form';
import { createMilestoneAction } from '@/features/milestones/actions';

interface NewMilestonePageProps {
  searchParams: Promise<{ projectId?: string; returnTo?: string }>;
}

export default async function NewMilestonePage({ searchParams }: NewMilestonePageProps) {
  const org = await getCurrentOrg();
  const params = await searchParams;

  const [projects, memberRows] = await Promise.all([
    projectsRepository.listSelectable(org.organizationId),
    organizationsRepository.listMembers(org.organizationId),
  ]);

  const members = memberRows.map((m) => ({
    id: m.user_id,
    full_name: Array.isArray(m.profiles) ? m.profiles[0]?.full_name ?? null : (m.profiles as { full_name: string | null } | null)?.full_name ?? null,
  }));

  // Preselected from a project detail page's "New Milestone" button —
  // locked so a milestone created from a project can't accidentally be
  // filed elsewhere. The project ID is still re-verified server-side by
  // milestoneService.createMilestone regardless of what the client sends.
  const lockProject = Boolean(params.projectId && projects.some((p) => p.id === params.projectId));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">New Milestone</h1>
        <p className="text-sm text-muted-foreground">{org.organizationName}</p>
      </div>
      <MilestoneForm
        action={createMilestoneAction}
        members={members}
        projects={projects}
        submitLabel="Create Milestone"
        initialValues={lockProject ? { projectId: params.projectId } : undefined}
        lockProject={lockProject}
        returnTo={params.returnTo}
      />
    </div>
  );
}
