import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError } from '@/lib/errors';

vi.mock('@/repositories/milestones.repository', () => ({
  milestonesRepository: {
    getMilestoneForMutation: vi.fn(),
    listByProject: vi.fn(),
    getTaskCompletionRollup: vi.fn(),
    updateMilestoneProgress: vi.fn(),
  },
}));

vi.mock('@/repositories/projects.repository', () => ({
  projectsRepository: {
    getProjectForMutation: vi.fn(),
    listByOrg: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/repositories/activity.repository', () => ({
  activityRepository: {
    record: vi.fn(),
  },
}));

const { milestonesRepository } = await import('@/repositories/milestones.repository');
const { projectsRepository } = await import('@/repositories/projects.repository');
const { activityRepository } = await import('@/repositories/activity.repository');
const { executionReconciliationService } = await import('./execution-reconciliation.service');

const ORG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTOR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PROJECT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PROJECT_ID_2 = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const MILESTONE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

function baseMilestoneRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MILESTONE_ID,
    project_id: PROJECT_ID,
    status: 'in_progress',
    progress_mode: 'automatic',
    progress_percent: 0,
    ...overrides,
  };
}

function baseProjectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROJECT_ID,
    progress_mode: 'milestones',
    progress_percent: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('executionReconciliationService.reconcileMilestoneProgress', () => {
  it('skips a manual-mode milestone without evaluating task counts', async () => {
    (milestonesRepository.getMilestoneForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(
      baseMilestoneRow({ progress_mode: 'manual', progress_percent: 40 }),
    );

    const result = await executionReconciliationService.reconcileMilestoneProgress(ORG_ID, ACTOR_ID, MILESTONE_ID);

    expect(result.skipped).toBe(true);
    expect(result.corrected).toBe(false);
    expect(milestonesRepository.getTaskCompletionRollup).not.toHaveBeenCalled();
    expect(milestonesRepository.updateMilestoneProgress).not.toHaveBeenCalled();
  });

  it('detects and corrects an automatic milestone mismatch', async () => {
    (milestonesRepository.getMilestoneForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(
      baseMilestoneRow({ progress_mode: 'automatic', progress_percent: 0, status: 'in_progress' }),
    );
    (milestonesRepository.getTaskCompletionRollup as ReturnType<typeof vi.fn>).mockResolvedValue({ totalEligibleTasks: 4, completedEligibleTasks: 3 });

    const result = await executionReconciliationService.reconcileMilestoneProgress(ORG_ID, ACTOR_ID, MILESTONE_ID);

    expect(result.corrected).toBe(true);
    expect(result.expectedProgress).toBe(75);
    expect(milestonesRepository.updateMilestoneProgress).toHaveBeenCalledWith(ORG_ID, MILESTONE_ID, 75);
    expect(activityRepository.record).toHaveBeenCalledTimes(1);
    const event = (activityRepository.record as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(event.metadata.source).toBe('reconciliation');
  });

  it('is idempotent — a repeated reconciliation of an already-correct milestone writes nothing', async () => {
    (milestonesRepository.getMilestoneForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(
      baseMilestoneRow({ progress_mode: 'automatic', progress_percent: 75, status: 'in_progress' }),
    );
    (milestonesRepository.getTaskCompletionRollup as ReturnType<typeof vi.fn>).mockResolvedValue({ totalEligibleTasks: 4, completedEligibleTasks: 3 });

    const result = await executionReconciliationService.reconcileMilestoneProgress(ORG_ID, ACTOR_ID, MILESTONE_ID);

    expect(result.corrected).toBe(false);
    expect(milestonesRepository.updateMilestoneProgress).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
  });

  it('a zero-task milestone reconciles to 0%, never 100%', async () => {
    (milestonesRepository.getMilestoneForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(
      baseMilestoneRow({ progress_mode: 'automatic', progress_percent: 100, status: 'in_progress' }),
    );
    (milestonesRepository.getTaskCompletionRollup as ReturnType<typeof vi.fn>).mockResolvedValue({ totalEligibleTasks: 0, completedEligibleTasks: 0 });

    const result = await executionReconciliationService.reconcileMilestoneProgress(ORG_ID, ACTOR_ID, MILESTONE_ID);

    expect(result.expectedProgress).toBe(0);
    expect(result.corrected).toBe(true);
  });

  it('a legacy "done" status still counts as completed in the roll-up basis', async () => {
    (milestonesRepository.getMilestoneForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(
      baseMilestoneRow({ progress_mode: 'automatic', progress_percent: 0, status: 'in_progress' }),
    );
    // getTaskCompletionRollup already folds 'done' into completedEligibleTasks
    // (see milestonesRepository.getTaskCompletionRollup) — this test just
    // confirms the reconciliation service trusts that basis rather than
    // recomputing its own notion of "completed".
    (milestonesRepository.getTaskCompletionRollup as ReturnType<typeof vi.fn>).mockResolvedValue({ totalEligibleTasks: 2, completedEligibleTasks: 2 });

    const result = await executionReconciliationService.reconcileMilestoneProgress(ORG_ID, ACTOR_ID, MILESTONE_ID);

    expect(result.expectedProgress).toBe(100);
  });

  it('throws NotFoundError for a milestone outside the organization', async () => {
    (milestonesRepository.getMilestoneForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(executionReconciliationService.reconcileMilestoneProgress(ORG_ID, ACTOR_ID, MILESTONE_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('dry run reports the discrepancy but writes nothing', async () => {
    (milestonesRepository.getMilestoneForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(
      baseMilestoneRow({ progress_mode: 'automatic', progress_percent: 0, status: 'in_progress' }),
    );
    (milestonesRepository.getTaskCompletionRollup as ReturnType<typeof vi.fn>).mockResolvedValue({ totalEligibleTasks: 2, completedEligibleTasks: 1 });

    const result = await executionReconciliationService.reconcileMilestoneProgress(ORG_ID, ACTOR_ID, MILESTONE_ID, { dryRun: true });

    expect(result.corrected).toBe(true);
    expect(result.expectedProgress).toBe(50);
    expect(milestonesRepository.updateMilestoneProgress).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
  });
});

describe('executionReconciliationService.reconcileProjectProgress', () => {
  it('skips a manually-managed project', async () => {
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(baseProjectRow({ progress_mode: 'manual' }));

    const result = await executionReconciliationService.reconcileProjectProgress(ORG_ID, ACTOR_ID, PROJECT_ID);

    expect(result.skipped).toBe(true);
    expect(milestonesRepository.listByProject).not.toHaveBeenCalled();
  });

  it('excludes cancelled milestones from the recomputed roll-up', async () => {
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(baseProjectRow({ progress_mode: 'milestones', progress_percent: 0 }));
    (milestonesRepository.listByProject as ReturnType<typeof vi.fn>).mockResolvedValue([
      { progress_percent: 100, status: 'completed' },
      { progress_percent: 0, status: 'cancelled' }, // must not drag the average down
    ]);

    const result = await executionReconciliationService.reconcileProjectProgress(ORG_ID, ACTOR_ID, PROJECT_ID);

    expect(result.expectedProgress).toBe(100);
    expect(result.corrected).toBe(true);
  });

  it('is idempotent when already correct', async () => {
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(baseProjectRow({ progress_mode: 'milestones', progress_percent: 50 }));
    (milestonesRepository.listByProject as ReturnType<typeof vi.fn>).mockResolvedValue([{ progress_percent: 50, status: 'in_progress' }]);

    const result = await executionReconciliationService.reconcileProjectProgress(ORG_ID, ACTOR_ID, PROJECT_ID);

    expect(result.corrected).toBe(false);
    expect(projectsRepository.update).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
  });
});

describe('executionReconciliationService.reconcileProjectExecution', () => {
  it('reconciles every non-cancelled milestone then the project roll-up', async () => {
    (milestonesRepository.listByProject as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'm1', status: 'in_progress' },
      { id: 'm2', status: 'cancelled' }, // excluded entirely
    ]);
    (milestonesRepository.getMilestoneForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(
      baseMilestoneRow({ id: 'm1', progress_mode: 'automatic', progress_percent: 0, status: 'in_progress' }),
    );
    (milestonesRepository.getTaskCompletionRollup as ReturnType<typeof vi.fn>).mockResolvedValue({ totalEligibleTasks: 1, completedEligibleTasks: 1 });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(baseProjectRow({ progress_mode: 'milestones', progress_percent: 0 }));

    const result = await executionReconciliationService.reconcileProjectExecution(ORG_ID, ACTOR_ID, PROJECT_ID);

    expect(result.milestonesChecked).toBe(1); // cancelled milestone excluded
    expect(result.milestoneCorrections).toBe(1);
    expect(result.projectResult).toBeDefined();
  });
});

describe('executionReconciliationService.reconcileOrganisationExecution', () => {
  it('rejects a cross-organization projectId', async () => {
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      executionReconciliationService.reconcileOrganisationExecution(ORG_ID, ACTOR_ID, { projectId: PROJECT_ID }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('continues processing unrelated projects when one project fails', async () => {
    (projectsRepository.listByOrg as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: PROJECT_ID }, { id: PROJECT_ID_2 }]);
    (milestonesRepository.listByProject as ReturnType<typeof vi.fn>).mockImplementation((_org: string, projectId: string) => {
      if (projectId === PROJECT_ID) throw new Error('simulated failure');
      return Promise.resolve([]);
    });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(baseProjectRow({ progress_mode: 'manual' }));

    const result = await executionReconciliationService.reconcileOrganisationExecution(ORG_ID, ACTOR_ID, { dryRun: true });

    expect(result.projectsChecked).toBe(1); // only PROJECT_ID_2 completed
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.projectId).toBe(PROJECT_ID);
  });

  it('dry run writes no summary activity; a real run writes exactly one', async () => {
    (projectsRepository.listByOrg as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: PROJECT_ID }]);
    (milestonesRepository.listByProject as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(baseProjectRow({ progress_mode: 'manual' }));

    await executionReconciliationService.reconcileOrganisationExecution(ORG_ID, ACTOR_ID, { dryRun: true });
    expect(activityRepository.record).not.toHaveBeenCalled();

    vi.clearAllMocks();
    (projectsRepository.listByOrg as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: PROJECT_ID }]);
    (milestonesRepository.listByProject as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(baseProjectRow({ progress_mode: 'manual' }));

    await executionReconciliationService.reconcileOrganisationExecution(ORG_ID, ACTOR_ID, { dryRun: false });
    expect(activityRepository.record).toHaveBeenCalledTimes(1);
    expect((activityRepository.record as ReturnType<typeof vi.fn>).mock.calls[0]![0].event_type).toBe('execution.reconciliation_run');
  });

  it('never touches a project outside the given organization boundary', async () => {
    // listByOrg is itself org-scoped at the repository layer (mocked here),
    // so the service has no path to cross organizations even in principle.
    (projectsRepository.listByOrg as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await executionReconciliationService.reconcileOrganisationExecution(ORG_ID, ACTOR_ID, { dryRun: true });

    expect(projectsRepository.listByOrg).toHaveBeenCalledWith(ORG_ID);
    expect(result.projectsChecked).toBe(0);
  });
});
