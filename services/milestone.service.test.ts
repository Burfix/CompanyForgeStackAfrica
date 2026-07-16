import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';

vi.mock('@/repositories/milestones.repository', () => ({
  milestonesRepository: {
    getMilestoneById: vi.fn(),
    verifyMilestoneAccess: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    countMilestonesByProject: vi.fn(),
    listByProject: vi.fn(),
    reorderProjectMilestones: vi.fn(),
    getTaskCompletionRollup: vi.fn(),
    updateMilestoneProgress: vi.fn(),
  },
}));

vi.mock('@/repositories/projects.repository', () => ({
  projectsRepository: {
    verifyProjectAccess: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/repositories/organizations.repository', () => ({
  organizationsRepository: {
    verifyOrganisationMember: vi.fn(),
  },
}));

vi.mock('@/repositories/activity.repository', () => ({
  activityRepository: {
    record: vi.fn(),
  },
}));

const { milestonesRepository } = await import('@/repositories/milestones.repository');
const { projectsRepository } = await import('@/repositories/projects.repository');
const { organizationsRepository } = await import('@/repositories/organizations.repository');
const { activityRepository } = await import('@/repositories/activity.repository');
const { milestoneService } = await import('./milestone.service');

const ORG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTOR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PROJECT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const MILESTONE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const OWNER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function baseMilestoneRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MILESTONE_ID,
    organization_id: ORG_ID,
    project_id: PROJECT_ID,
    title: 'Launch pilot',
    description: null,
    success_criteria: null,
    owner_id: null,
    status: 'pending',
    priority: 'medium',
    health: 'unknown',
    health_note: null,
    attention_mode: 'no_attention',
    founder_required: false,
    progress_mode: 'automatic',
    progress_percent: 0,
    target_value: null,
    current_value: null,
    start_date: null,
    due_date: null,
    next_review_at: null,
    blocked_reason: null,
    waiting_on: null,
    sort_order: 0,
    completed_at: null,
    last_activity_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function baseProjectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROJECT_ID,
    organization_id: ORG_ID,
    progress_mode: 'manual',
    progress_percent: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (projectsRepository.verifyProjectAccess as ReturnType<typeof vi.fn>).mockResolvedValue({ id: PROJECT_ID, organization_id: ORG_ID });
  (projectsRepository.getById as ReturnType<typeof vi.fn>).mockResolvedValue(baseProjectRow());
  (milestonesRepository.countMilestonesByProject as ReturnType<typeof vi.fn>).mockResolvedValue({ total: 0, open: 0, completed: 0, overdue: 0 });
  (organizationsRepository.verifyOrganisationMember as ReturnType<typeof vi.fn>).mockResolvedValue(true);
});

describe('milestoneService.createMilestone', () => {
  it('creates a milestone and writes a single "created" activity record', async () => {
    (milestonesRepository.create as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow());

    await milestoneService.createMilestone(ORG_ID, ACTOR_ID, { title: 'Launch pilot', projectId: PROJECT_ID } as never);

    expect(milestonesRepository.create).toHaveBeenCalledTimes(1);
    expect(activityRepository.record).toHaveBeenCalledTimes(1);
    expect((activityRepository.record as ReturnType<typeof vi.fn>).mock.calls[0]![0].event_type).toBe('milestone.created');
  });

  it('rejects a project that does not belong to this organization', async () => {
    (projectsRepository.verifyProjectAccess as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      milestoneService.createMilestone(ORG_ID, ACTOR_ID, { title: 'Launch pilot', projectId: PROJECT_ID } as never),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('rejects an owner who is not a member of this organization', async () => {
    (organizationsRepository.verifyOrganisationMember as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await expect(
      milestoneService.createMilestone(ORG_ID, ACTOR_ID, { title: 'Launch pilot', projectId: PROJECT_ID, ownerId: OWNER_ID } as never),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('derives founder_required=true from attentionMode=founder', async () => {
    (milestonesRepository.create as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ founder_required: true }));

    await milestoneService.createMilestone(ORG_ID, ACTOR_ID, { title: 'Launch pilot', projectId: PROJECT_ID, attentionMode: 'founder' } as never);

    const insertArg = (milestonesRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(insertArg.founder_required).toBe(true);
  });

  it('derives founder_required=false for a non-founder attentionMode', async () => {
    (milestonesRepository.create as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow());

    await milestoneService.createMilestone(ORG_ID, ACTOR_ID, { title: 'Launch pilot', projectId: PROJECT_ID, attentionMode: 'team' } as never);

    const insertArg = (milestonesRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(insertArg.founder_required).toBe(false);
  });
});

describe('milestoneService.updateMilestone', () => {
  it('throws NotFoundError when the milestone does not exist in this organization', async () => {
    (milestonesRepository.getMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(milestoneService.updateMilestone(ORG_ID, ACTOR_ID, MILESTONE_ID, {} as never)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('is a no-op when nothing actually changed — no write, no activity', async () => {
    (milestonesRepository.getMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ title: 'Same title' }));

    const result = await milestoneService.updateMilestone(ORG_ID, ACTOR_ID, MILESTONE_ID, { title: 'Same title' } as never);

    expect(milestonesRepository.update).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
    expect(result.title).toBe('Same title');
  });

  it('writes an update and logs exactly one activity record for a real change', async () => {
    (milestonesRepository.getMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow());
    (milestonesRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ title: 'New title' }));

    await milestoneService.updateMilestone(ORG_ID, ACTOR_ID, MILESTONE_ID, { title: 'New title' } as never);

    expect(milestonesRepository.update).toHaveBeenCalledTimes(1);
    expect(activityRepository.record).toHaveBeenCalledTimes(1);
  });

  it('rejects setting status directly to completed — must use completeMilestone', async () => {
    (milestonesRepository.getMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ status: 'in_progress' }));

    await expect(
      milestoneService.updateMilestone(ORG_ID, ACTOR_ID, MILESTONE_ID, { status: 'completed' } as never),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('rejects a bare status change out of completed — must use reopenMilestone', async () => {
    (milestonesRepository.getMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ status: 'completed' }));

    await expect(
      milestoneService.updateMilestone(ORG_ID, ACTOR_ID, MILESTONE_ID, { status: 'in_progress' } as never),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('rejects an invalid transition (e.g. pending -> missed)', async () => {
    (milestonesRepository.getMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ status: 'pending' }));

    await expect(
      milestoneService.updateMilestone(ORG_ID, ACTOR_ID, MILESTONE_ID, { status: 'missed' } as never),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('allows a valid transition (pending -> in_progress)', async () => {
    (milestonesRepository.getMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ status: 'pending' }));
    (milestonesRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ status: 'in_progress' }));

    const result = await milestoneService.updateMilestone(ORG_ID, ACTOR_ID, MILESTONE_ID, { status: 'in_progress' } as never);
    expect(result.status).toBe('in_progress');
  });
});

describe('milestoneService.completeMilestone / reopenMilestone / cancelMilestone', () => {
  it('completeMilestone forces progress to 100 and sets completed_at', async () => {
    (milestonesRepository.getMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ status: 'in_progress', progress_percent: 40 }));
    (milestonesRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ status: 'completed', progress_percent: 100 }));

    await milestoneService.completeMilestone(ORG_ID, ACTOR_ID, { milestoneId: MILESTONE_ID } as never);

    const patchArg = (milestonesRepository.update as ReturnType<typeof vi.fn>).mock.calls[0]![2];
    expect(patchArg.status).toBe('completed');
    expect(patchArg.progress_percent).toBe(100);
    expect(patchArg.completed_at).not.toBeNull();
  });

  it('completeMilestone is a no-op if already completed', async () => {
    (milestonesRepository.getMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ status: 'completed' }));

    await milestoneService.completeMilestone(ORG_ID, ACTOR_ID, { milestoneId: MILESTONE_ID } as never);
    expect(milestonesRepository.update).not.toHaveBeenCalled();
  });

  it('reopenMilestone rejects a milestone that is not completed or cancelled', async () => {
    (milestonesRepository.getMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ status: 'in_progress' }));

    await expect(
      milestoneService.reopenMilestone(ORG_ID, ACTOR_ID, { milestoneId: MILESTONE_ID, targetStatus: 'in_progress' } as never),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('reopenMilestone clears completed_at and recalculates progress for an automatic milestone', async () => {
    (milestonesRepository.getMilestoneById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(baseMilestoneRow({ status: 'completed', progress_mode: 'automatic', progress_percent: 100 }))
      .mockResolvedValueOnce(baseMilestoneRow({ status: 'in_progress', progress_mode: 'automatic', progress_percent: 100 }));
    (milestonesRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ status: 'in_progress', completed_at: null }));
    (milestonesRepository.getTaskCompletionRollup as ReturnType<typeof vi.fn>).mockResolvedValue({ totalEligibleTasks: 2, completedEligibleTasks: 1 });
    (milestonesRepository.updateMilestoneProgress as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ progress_percent: 50 }));
    (milestonesRepository.listByProject as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await milestoneService.reopenMilestone(ORG_ID, ACTOR_ID, { milestoneId: MILESTONE_ID, targetStatus: 'in_progress' } as never);

    expect(milestonesRepository.updateMilestoneProgress).toHaveBeenCalledWith(ORG_ID, MILESTONE_ID, 50);
  });

  it('cancelMilestone is a no-op if already cancelled', async () => {
    (milestonesRepository.getMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ status: 'cancelled' }));

    await milestoneService.cancelMilestone(ORG_ID, ACTOR_ID, { milestoneId: MILESTONE_ID } as never);
    expect(milestonesRepository.update).not.toHaveBeenCalled();
  });

  it('cancelMilestone writes the cancelled status and logs activity', async () => {
    (milestonesRepository.getMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ status: 'in_progress' }));
    (milestonesRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ status: 'cancelled' }));
    (milestonesRepository.listByProject as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await milestoneService.cancelMilestone(ORG_ID, ACTOR_ID, { milestoneId: MILESTONE_ID } as never);

    expect(milestonesRepository.update).toHaveBeenCalledTimes(1);
    expect(activityRepository.record).toHaveBeenCalled();
  });
});

describe('milestoneService.recalculateMilestoneProgress', () => {
  it('never overwrites a manual-mode milestone', async () => {
    (milestonesRepository.getMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ progress_mode: 'manual', progress_percent: 40 }));

    const result = await milestoneService.recalculateMilestoneProgress(ORG_ID, ACTOR_ID, MILESTONE_ID);

    expect(milestonesRepository.getTaskCompletionRollup).not.toHaveBeenCalled();
    expect(result.progress_percent).toBe(40);
  });

  it('is a no-op (no write, no activity) when the recalculated value is unchanged', async () => {
    (milestonesRepository.getMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ progress_mode: 'automatic', progress_percent: 50, status: 'in_progress' }));
    (milestonesRepository.getTaskCompletionRollup as ReturnType<typeof vi.fn>).mockResolvedValue({ totalEligibleTasks: 2, completedEligibleTasks: 1 });

    await milestoneService.recalculateMilestoneProgress(ORG_ID, ACTOR_ID, MILESTONE_ID);

    expect(milestonesRepository.updateMilestoneProgress).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
  });

  it('writes and logs exactly once when the recalculated value changes', async () => {
    (milestonesRepository.getMilestoneById as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ progress_mode: 'automatic', progress_percent: 0, status: 'in_progress' }));
    (milestonesRepository.getTaskCompletionRollup as ReturnType<typeof vi.fn>).mockResolvedValue({ totalEligibleTasks: 4, completedEligibleTasks: 3 });
    (milestonesRepository.updateMilestoneProgress as ReturnType<typeof vi.fn>).mockResolvedValue(baseMilestoneRow({ progress_percent: 75 }));
    (milestonesRepository.listByProject as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await milestoneService.recalculateMilestoneProgress(ORG_ID, ACTOR_ID, MILESTONE_ID);

    expect(milestonesRepository.updateMilestoneProgress).toHaveBeenCalledWith(ORG_ID, MILESTONE_ID, 75);
    expect(activityRepository.record).toHaveBeenCalledTimes(1);
  });
});

describe('milestoneService.recalculateProjectProgressFromMilestones', () => {
  it('does nothing when the project is in manual progress mode', async () => {
    (projectsRepository.getById as ReturnType<typeof vi.fn>).mockResolvedValue(baseProjectRow({ progress_mode: 'manual', progress_percent: 20 }));

    await milestoneService.recalculateProjectProgressFromMilestones(ORG_ID, ACTOR_ID, PROJECT_ID);

    expect(milestonesRepository.listByProject).not.toHaveBeenCalled();
    expect(projectsRepository.update).not.toHaveBeenCalled();
  });

  it('recalculates and writes when the project uses milestone-derived progress', async () => {
    (projectsRepository.getById as ReturnType<typeof vi.fn>).mockResolvedValue(baseProjectRow({ progress_mode: 'milestones', progress_percent: 0 }));
    (milestonesRepository.listByProject as ReturnType<typeof vi.fn>).mockResolvedValue([
      { progress_percent: 100, status: 'completed' },
      { progress_percent: 0, status: 'pending' },
    ]);

    await milestoneService.recalculateProjectProgressFromMilestones(ORG_ID, ACTOR_ID, PROJECT_ID);

    expect(projectsRepository.update).toHaveBeenCalledWith(ORG_ID, PROJECT_ID, expect.objectContaining({ progress_percent: 50 }));
    expect(activityRepository.record).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the recalculated value equals the current value', async () => {
    (projectsRepository.getById as ReturnType<typeof vi.fn>).mockResolvedValue(baseProjectRow({ progress_mode: 'milestones', progress_percent: 50 }));
    (milestonesRepository.listByProject as ReturnType<typeof vi.fn>).mockResolvedValue([{ progress_percent: 50, status: 'in_progress' }]);

    await milestoneService.recalculateProjectProgressFromMilestones(ORG_ID, ACTOR_ID, PROJECT_ID);

    expect(projectsRepository.update).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
  });
});
