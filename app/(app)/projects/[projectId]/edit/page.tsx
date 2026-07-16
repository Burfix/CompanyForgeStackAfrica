import { notFound } from 'next/navigation';
import { getCurrentOrg } from '@/lib/auth/session';
import { projectsRepository } from '@/repositories/projects.repository';
import { organizationsRepository } from '@/repositories/organizations.repository';
import { ProjectForm, type ProjectFormValues } from '@/features/projects/components/project-form';
import { updateProject } from '@/features/projects/actions';

interface EditProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function EditProjectPage({ params }: EditProjectPageProps) {
  const { projectId } = await params;
  const org = await getCurrentOrg();

  const [project, memberRows] = await Promise.all([
    projectsRepository.getById(org.organizationId, projectId),
    organizationsRepository.listMembers(org.organizationId),
  ]);

  // verifyProjectAccess/RLS both scope by organization_id — a project that
  // belongs to another org (or doesn't exist) simply isn't returned here.
  if (!project) notFound();

  const members = memberRows.map((m) => ({
    id: m.user_id,
    full_name: Array.isArray(m.profiles) ? m.profiles[0]?.full_name ?? null : (m.profiles as { full_name: string | null } | null)?.full_name ?? null,
  }));

  const initialValues: ProjectFormValues = {
    name: project.name,
    category: project.category ?? '',
    description: project.description,
    ownerId: project.owner_id,
    status: project.status,
    focusLevel: project.focus_level,
    desiredOutcome: project.desired_outcome,
    successMetric: project.success_metric,
    targetValue: project.target_value,
    currentValue: project.current_value,
    startDate: project.start_date,
    targetDate: project.target_date,
    nextReviewAt: project.next_review_at ? project.next_review_at.slice(0, 10) : null,
    reviewCadence: project.review_cadence,
    blockedReason: project.blocked_reason,
    waitingOn: project.waiting_on,
    attentionMode: project.attention_mode,
    priorityLevel: project.priority_level,
    health: project.health,
    healthNote: project.health_note,
    businessImpact: project.business_impact ?? [],
    progressPercent: project.progress_percent,
  };

  const boundAction = updateProject.bind(null, projectId);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Edit Project</h1>
        <p className="text-sm text-muted-foreground">{project.name}</p>
      </div>
      <ProjectForm action={boundAction} initialValues={initialValues} members={members} submitLabel="Save Changes" />
    </div>
  );
}
