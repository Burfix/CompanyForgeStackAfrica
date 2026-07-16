import { getCurrentOrg } from '@/lib/auth/session';
import { organizationsRepository } from '@/repositories/organizations.repository';
import { ProjectForm } from '@/features/projects/components/project-form';
import { createProject } from '@/features/projects/actions';

export default async function NewProjectPage() {
  const org = await getCurrentOrg();
  const memberRows = await organizationsRepository.listMembers(org.organizationId);
  const members = memberRows.map((m) => ({
    id: m.user_id,
    full_name: Array.isArray(m.profiles) ? m.profiles[0]?.full_name ?? null : (m.profiles as { full_name: string | null } | null)?.full_name ?? null,
  }));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">New Project</h1>
        <p className="text-sm text-muted-foreground">{org.organizationName}</p>
      </div>
      <ProjectForm action={createProject} members={members} submitLabel="Create Project" />
    </div>
  );
}
