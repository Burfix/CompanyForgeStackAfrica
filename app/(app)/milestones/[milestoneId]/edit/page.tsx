import { notFound } from 'next/navigation';
import { getCurrentOrg } from '@/lib/auth/session';
import { milestonesRepository } from '@/repositories/milestones.repository';
import { projectsRepository } from '@/repositories/projects.repository';
import { organizationsRepository } from '@/repositories/organizations.repository';
import { MilestoneForm, type MilestoneFormValues } from '@/features/milestones/components/milestone-form';
import { updateMilestoneAction } from '@/features/milestones/actions';

interface EditMilestonePageProps {
  params: Promise<{ milestoneId: string }>;
}

export default async function EditMilestonePage({ params }: EditMilestonePageProps) {
  const { milestoneId } = await params;
  const org = await getCurrentOrg();

  const [milestone, projects, memberRows] = await Promise.all([
    milestonesRepository.getMilestoneById(org.organizationId, milestoneId),
    projectsRepository.listSelectable(org.organizationId),
    organizationsRepository.listMembers(org.organizationId),
  ]);

  if (!milestone) notFound();

  const members = memberRows.map((m) => ({
    id: m.user_id,
    full_name: Array.isArray(m.profiles) ? m.profiles[0]?.full_name ?? null : (m.profiles as { full_name: string | null } | null)?.full_name ?? null,
  }));

  const initialValues: MilestoneFormValues = {
    title: milestone.title,
    projectId: milestone.project_id,
    description: milestone.description,
    successCriteria: milestone.success_criteria,
    ownerId: milestone.owner_id,
    status: milestone.status,
    priority: milestone.priority,
    health: milestone.health,
    healthNote: milestone.health_note,
    attentionMode: milestone.attention_mode,
    progressMode: milestone.progress_mode,
    progressPercent: milestone.progress_percent,
    targetValue: milestone.target_value,
    currentValue: milestone.current_value,
    startDate: milestone.start_date,
    dueDate: milestone.due_date,
    nextReviewAt: milestone.next_review_at,
    blockedReason: milestone.blocked_reason,
    waitingOn: milestone.waiting_on,
  };

  const boundAction = updateMilestoneAction.bind(null, milestoneId);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Edit Milestone</h1>
        <p className="text-sm text-muted-foreground">{milestone.title}</p>
      </div>
      <MilestoneForm
        action={boundAction}
        initialValues={initialValues}
        members={members}
        projects={projects}
        submitLabel="Save Changes"
        lockProject
      />
    </div>
  );
}
