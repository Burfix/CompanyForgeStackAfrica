import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';

vi.mock('@/repositories/tasks.repository', () => ({
  tasksRepository: {
    getTaskForMutation: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    verifyOwnerBelongsToOrganisation: vi.fn(),
  },
}));

vi.mock('@/repositories/projects.repository', () => ({
  projectsRepository: {
    verifyProjectAccess: vi.fn(),
  },
}));

vi.mock('@/repositories/milestones.repository', () => ({
  milestonesRepository: {
    verifyMilestoneBelongsToProject: vi.fn(),
  },
}));

vi.mock('@/repositories/activity.repository', () => ({
  activityRepository: {
    record: vi.fn(),
  },
}));

vi.mock('@/services/milestone.service', () => ({
  milestoneService: {
    recalculateMilestoneProgress: vi.fn(),
  },
}));

const { tasksRepository } = await import('@/repositories/tasks.repository');
const { projectsRepository } = await import('@/repositories/projects.repository');
const { milestonesRepository } = await import('@/repositories/milestones.repository');
const { activityRepository } = await import('@/repositories/activity.repository');
const { milestoneService } = await import('@/services/milestone.service');
const { taskService, assertValidStatusTransition } = await import('./task.service');

const ORG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_ORG_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const ACTOR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TASK_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PROJECT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function baseTaskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    organization_id: ORG_ID,
    project_id: PROJECT_ID,
    title: 'Test Task',
    status: 'planned',
    priority: 'medium',
    assignee_id: null,
    attention_mode: 'no_attention',
    founder_required: false,
    due_at: null,
    completed_at: null,
    last_activity_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (projectsRepository.verifyProjectAccess as ReturnType<typeof vi.fn>).mockResolvedValue({ id: PROJECT_ID, organization_id: ORG_ID });
  (tasksRepository.verifyOwnerBelongsToOrganisation as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  (milestonesRepository.verifyMilestoneBelongsToProject as ReturnType<typeof vi.fn>).mockResolvedValue({ belongs: true, status: 'in_progress' });
});

describe('assertValidStatusTransition', () => {
  it('allows normal moves between non-terminal statuses', () => {
    expect(() => assertValidStatusTransition('inbox' as never, 'planned' as never)).not.toThrow();
    expect(() => assertValidStatusTransition('planned' as never, 'blocked' as never)).not.toThrow();
  });

  it('rejects moving directly to completed via a bare status change', () => {
    expect(() => assertValidStatusTransition('in_progress' as never, 'completed' as never)).toThrow(BusinessRuleError);
  });

  it('rejects a cancelled-to-completed transition (must reopen first)', () => {
    expect(() => assertValidStatusTransition('cancelled' as never, 'completed' as never)).toThrow(BusinessRuleError);
  });

  it('rejects moving a completed task to any other status without reopenTask', () => {
    expect(() => assertValidStatusTransition('completed' as never, 'planned' as never)).toThrow(BusinessRuleError);
  });

  it('rejects moving a cancelled task to any other status without reopenTask', () => {
    expect(() => assertValidStatusTransition('cancelled' as never, 'in_progress' as never)).toThrow(BusinessRuleError);
  });

  it('is a no-op when from === to', () => {
    expect(() => assertValidStatusTransition('completed' as never, 'completed' as never)).not.toThrow();
  });
});

describe('taskService.createTask', () => {
  it('creates a task and writes a single "created" activity record', async () => {
    (tasksRepository.create as ReturnType<typeof vi.fn>).mockResolvedValue(baseTaskRow());

    const result = await taskService.createTask(ORG_ID, ACTOR_ID, {
      title: 'Test Task',
      projectId: PROJECT_ID,
    } as never);

    expect(result.task.id).toBe(TASK_ID);
    expect(result.warning).toBeUndefined();
    expect(activityRepository.record).toHaveBeenCalledTimes(1);
    expect((activityRepository.record as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({
      event_type: 'task.created',
      entity_type: 'task',
      entity_id: TASK_ID,
    });
  });

  it('rejects a project that does not belong to this organization', async () => {
    (projectsRepository.verifyProjectAccess as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      taskService.createTask(ORG_ID, ACTOR_ID, { title: 'Test Task', projectId: PROJECT_ID } as never),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    expect(tasksRepository.create).not.toHaveBeenCalled();
  });

  it('rejects an owner who is not a member of the organization', async () => {
    (tasksRepository.verifyOwnerBelongsToOrganisation as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await expect(
      taskService.createTask(ORG_ID, ACTOR_ID, {
        title: 'Test Task',
        projectId: PROJECT_ID,
        ownerId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      } as never),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    expect(tasksRepository.create).not.toHaveBeenCalled();
  });

  it('rejects a milestone that does not belong to the selected project', async () => {
    (milestonesRepository.verifyMilestoneBelongsToProject as ReturnType<typeof vi.fn>).mockResolvedValue({ belongs: false, status: null });

    await expect(
      taskService.createTask(ORG_ID, ACTOR_ID, {
        title: 'Test Task',
        projectId: PROJECT_ID,
        milestoneId: 'ffffffff-eeee-eeee-eeee-eeeeeeeeeeee',
      } as never),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    expect(tasksRepository.create).not.toHaveBeenCalled();
  });

  it('rejects assigning a task to a cancelled milestone (cross-project-style rejection)', async () => {
    (milestonesRepository.verifyMilestoneBelongsToProject as ReturnType<typeof vi.fn>).mockResolvedValue({ belongs: true, status: 'cancelled' });

    await expect(
      taskService.createTask(ORG_ID, ACTOR_ID, {
        title: 'Test Task',
        projectId: PROJECT_ID,
        milestoneId: 'ffffffff-eeee-eeee-eeee-eeeeeeeeeeee',
      } as never),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    expect(tasksRepository.create).not.toHaveBeenCalled();
  });

  it('recalculates milestone progress after creating a task with a milestone', async () => {
    (tasksRepository.create as ReturnType<typeof vi.fn>).mockResolvedValue(baseTaskRow({ milestone_id: 'ffffffff-eeee-eeee-eeee-eeeeeeeeeeee' }));

    await taskService.createTask(ORG_ID, ACTOR_ID, {
      title: 'Test Task',
      projectId: PROJECT_ID,
      milestoneId: 'ffffffff-eeee-eeee-eeee-eeeeeeeeeeee',
    } as never);

    expect(milestoneService.recalculateMilestoneProgress).toHaveBeenCalledWith(ORG_ID, ACTOR_ID, 'ffffffff-eeee-eeee-eeee-eeeeeeeeeeee', 'task_rollup');
  });

  it('does not trigger any milestone recalculation for a task without a milestone', async () => {
    (tasksRepository.create as ReturnType<typeof vi.fn>).mockResolvedValue(baseTaskRow());

    await taskService.createTask(ORG_ID, ACTOR_ID, { title: 'Test Task', projectId: PROJECT_ID } as never);

    expect(milestoneService.recalculateMilestoneProgress).not.toHaveBeenCalled();
  });

  it('derives founder_required=true from attentionMode=founder', async () => {
    (tasksRepository.create as ReturnType<typeof vi.fn>).mockResolvedValue(baseTaskRow({ founder_required: true, attention_mode: 'founder' }));

    await taskService.createTask(ORG_ID, ACTOR_ID, {
      title: 'Test Task',
      projectId: PROJECT_ID,
      attentionMode: 'founder',
    } as never);

    const insertArg = (tasksRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(insertArg.attention_mode).toBe('founder');
    expect(insertArg.founder_required).toBe(true);
  });

  it('never lets founder_required be set directly from raw input', async () => {
    (tasksRepository.create as ReturnType<typeof vi.fn>).mockResolvedValue(baseTaskRow());

    await taskService.createTask(ORG_ID, ACTOR_ID, {
      title: 'Test Task',
      projectId: PROJECT_ID,
      founderRequired: true, // not a real schema field — must be ignored, not passed through
    } as never);

    const insertArg = (tasksRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(insertArg.founder_required).toBe(false);
  });
});

describe('taskService.updateTask — cross-organization access', () => {
  it('throws NotFoundError for a task outside the organization (or that does not exist)', async () => {
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      taskService.updateTask(ORG_ID, ACTOR_ID, TASK_ID, { title: 'New title' } as never),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(tasksRepository.update).not.toHaveBeenCalled();
  });

  it('never returns a task belonging to a different organization even if the id is guessed correctly', async () => {
    // Simulates RLS/getTaskForMutation correctly scoping by org: a task that
    // exists but under OTHER_ORG_ID is invisible to ORG_ID's lookup.
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockImplementation((orgId: string) =>
      orgId === OTHER_ORG_ID ? Promise.resolve(baseTaskRow({ organization_id: OTHER_ORG_ID })) : Promise.resolve(null),
    );

    await expect(taskService.updateTask(ORG_ID, ACTOR_ID, TASK_ID, { title: 'x' } as never)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('taskService.updateTask — no-op vs real changes', () => {
  it('does not write to the repository or activity log when nothing actually changed', async () => {
    const existing = baseTaskRow();
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await taskService.updateTask(ORG_ID, ACTOR_ID, TASK_ID, { title: existing.title } as never);

    expect(tasksRepository.update).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
  });

  it('writes an update and a matching activity record when a field actually changes', async () => {
    const existing = baseTaskRow();
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (tasksRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, title: 'Renamed' });

    await taskService.updateTask(ORG_ID, ACTOR_ID, TASK_ID, { title: 'Renamed' } as never);

    expect(tasksRepository.update).toHaveBeenCalledTimes(1);
    expect(activityRepository.record).toHaveBeenCalledTimes(1);
    const metadata = (activityRepository.record as ReturnType<typeof vi.fn>).mock.calls[0]![0].metadata;
    expect(metadata.changed_fields).toEqual(['title']);
  });

  it('rejects moving directly to completed through a bare updateTask call', async () => {
    const existing = baseTaskRow({ status: 'in_progress' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await expect(
      taskService.updateTask(ORG_ID, ACTOR_ID, TASK_ID, { status: 'completed' } as never),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    expect(tasksRepository.update).not.toHaveBeenCalled();
  });
});

describe('taskService.updateTaskStatus', () => {
  it('is a no-op when the status is unchanged', async () => {
    const existing = baseTaskRow({ status: 'in_progress' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await taskService.updateTaskStatus(ORG_ID, ACTOR_ID, { taskId: TASK_ID, status: 'in_progress' });

    expect(tasksRepository.update).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
  });

  it('sets blocked_reason and logs task.blocked when moving to blocked', async () => {
    const existing = baseTaskRow({ status: 'planned' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (tasksRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, status: 'blocked' });

    await taskService.updateTaskStatus(ORG_ID, ACTOR_ID, { taskId: TASK_ID, status: 'blocked', blockedReason: 'Waiting on legal.' });

    const patch = (tasksRepository.update as ReturnType<typeof vi.fn>).mock.calls[0]![2];
    expect(patch.blocked_reason).toBe('Waiting on legal.');
    expect(activityRepository.record).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'task.blocked' }));
  });

  it('logs task.unblocked when moving away from blocked', async () => {
    const existing = baseTaskRow({ status: 'blocked', blocked_reason: 'X' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (tasksRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, status: 'planned' });

    await taskService.updateTaskStatus(ORG_ID, ACTOR_ID, { taskId: TASK_ID, status: 'planned' });

    expect(activityRepository.record).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'task.unblocked' }));
  });

  it('rejects setting status to completed via updateTaskStatus (must use completeTask)', async () => {
    const existing = baseTaskRow({ status: 'in_progress' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await expect(
      taskService.updateTaskStatus(ORG_ID, ACTOR_ID, { taskId: TASK_ID, status: 'completed' }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe('taskService.completeTask', () => {
  it('sets status=completed and completed_at server-side, and logs activity with previous_status', async () => {
    const existing = baseTaskRow({ status: 'in_progress' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (tasksRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, status: 'completed', completed_at: new Date().toISOString() });

    await taskService.completeTask(ORG_ID, ACTOR_ID, { taskId: TASK_ID });

    const patch = (tasksRepository.update as ReturnType<typeof vi.fn>).mock.calls[0]![2];
    expect(patch.status).toBe('completed');
    expect(patch.completed_at).toEqual(expect.any(String));

    const metadata = (activityRepository.record as ReturnType<typeof vi.fn>).mock.calls[0]![0].metadata;
    expect(metadata.previous_status).toBe('in_progress');
  });

  it('is a no-op if already completed', async () => {
    const existing = baseTaskRow({ status: 'completed' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await taskService.completeTask(ORG_ID, ACTOR_ID, { taskId: TASK_ID });

    expect(tasksRepository.update).not.toHaveBeenCalled();
  });

  it('recalculates the milestone this task belongs to', async () => {
    const existing = baseTaskRow({ status: 'in_progress', milestone_id: 'ffffffff-eeee-eeee-eeee-eeeeeeeeeeee' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (tasksRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, status: 'completed' });

    await taskService.completeTask(ORG_ID, ACTOR_ID, { taskId: TASK_ID });

    expect(milestoneService.recalculateMilestoneProgress).toHaveBeenCalledWith(ORG_ID, ACTOR_ID, 'ffffffff-eeee-eeee-eeee-eeeeeeeeeeee', 'task_rollup');
  });
});

describe('taskService.reopenTask', () => {
  it('clears completed_at and moves to the target status, logging previous_status', async () => {
    const existing = baseTaskRow({ status: 'completed', completed_at: new Date().toISOString() });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (tasksRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, status: 'planned', completed_at: null });

    await taskService.reopenTask(ORG_ID, ACTOR_ID, { taskId: TASK_ID, targetStatus: 'planned' });

    const patch = (tasksRepository.update as ReturnType<typeof vi.fn>).mock.calls[0]![2];
    expect(patch.completed_at).toBeNull();
    expect(patch.status).toBe('planned');

    const metadata = (activityRepository.record as ReturnType<typeof vi.fn>).mock.calls[0]![0].metadata;
    expect(metadata.previous_status).toBe('completed');
  });

  it('rejects reopening a task that is not completed or cancelled', async () => {
    const existing = baseTaskRow({ status: 'in_progress' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await expect(
      taskService.reopenTask(ORG_ID, ACTOR_ID, { taskId: TASK_ID, targetStatus: 'planned' }),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    expect(tasksRepository.update).not.toHaveBeenCalled();
  });

  it('recalculates the milestone this task belongs to when reopened', async () => {
    const existing = baseTaskRow({ status: 'completed', completed_at: new Date().toISOString(), milestone_id: 'ffffffff-eeee-eeee-eeee-eeeeeeeeeeee' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (tasksRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, status: 'planned', completed_at: null });

    await taskService.reopenTask(ORG_ID, ACTOR_ID, { taskId: TASK_ID, targetStatus: 'planned' });

    expect(milestoneService.recalculateMilestoneProgress).toHaveBeenCalledWith(ORG_ID, ACTOR_ID, 'ffffffff-eeee-eeee-eeee-eeeeeeeeeeee', 'task_rollup');
  });
});

describe('taskService.cancelTask', () => {
  it('sets status to cancelled and logs activity', async () => {
    const existing = baseTaskRow({ status: 'planned' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (tasksRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, status: 'cancelled' });

    await taskService.cancelTask(ORG_ID, ACTOR_ID, { taskId: TASK_ID });

    expect(tasksRepository.update).toHaveBeenCalledWith(ORG_ID, TASK_ID, expect.objectContaining({ status: 'cancelled' }));
    expect(activityRepository.record).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'task.cancelled' }));
  });

  it('is a no-op if already cancelled', async () => {
    const existing = baseTaskRow({ status: 'cancelled' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await taskService.cancelTask(ORG_ID, ACTOR_ID, { taskId: TASK_ID });

    expect(tasksRepository.update).not.toHaveBeenCalled();
  });

  it('recalculates the milestone this task belongs to when cancelled', async () => {
    const existing = baseTaskRow({ status: 'planned', milestone_id: 'ffffffff-eeee-eeee-eeee-eeeeeeeeeeee' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (tasksRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, status: 'cancelled' });

    await taskService.cancelTask(ORG_ID, ACTOR_ID, { taskId: TASK_ID });

    expect(milestoneService.recalculateMilestoneProgress).toHaveBeenCalledWith(ORG_ID, ACTOR_ID, 'ffffffff-eeee-eeee-eeee-eeeeeeeeeeee', 'task_rollup');
  });
});

describe('taskService.updateTask — milestone roll-up triggers', () => {
  it('recalculates both milestones when a task moves from one to another', async () => {
    const existing = baseTaskRow({ milestone_id: 'aaaa1111-eeee-eeee-eeee-eeeeeeeeeeee' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (tasksRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, milestone_id: 'bbbb2222-eeee-eeee-eeee-eeeeeeeeeeee' });

    await taskService.updateTask(ORG_ID, ACTOR_ID, TASK_ID, { milestoneId: 'bbbb2222-eeee-eeee-eeee-eeeeeeeeeeee' } as never);

    expect(milestoneService.recalculateMilestoneProgress).toHaveBeenCalledWith(ORG_ID, ACTOR_ID, 'aaaa1111-eeee-eeee-eeee-eeeeeeeeeeee', 'task_rollup');
    expect(milestoneService.recalculateMilestoneProgress).toHaveBeenCalledWith(ORG_ID, ACTOR_ID, 'bbbb2222-eeee-eeee-eeee-eeeeeeeeeeee', 'task_rollup');
  });

  it('does not trigger any milestone recalculation when neither milestone_id nor status changes', async () => {
    const existing = baseTaskRow({ milestone_id: 'aaaa1111-eeee-eeee-eeee-eeeeeeeeeeee', title: 'Same' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (tasksRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, title: 'New' });

    await taskService.updateTask(ORG_ID, ACTOR_ID, TASK_ID, { title: 'New' } as never);

    expect(milestoneService.recalculateMilestoneProgress).not.toHaveBeenCalled();
  });
});

describe('taskService.assignTask', () => {
  it('assigns an owner and logs activity', async () => {
    const existing = baseTaskRow({ assignee_id: null });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (tasksRepository.verifyOwnerBelongsToOrganisation as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (tasksRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, assignee_id: ACTOR_ID });

    await taskService.assignTask(ORG_ID, ACTOR_ID, { taskId: TASK_ID, ownerId: ACTOR_ID });

    expect(tasksRepository.update).toHaveBeenCalledTimes(1);
    expect(activityRepository.record).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'task.assigned' }));
  });

  it('is a no-op when assigning the same owner already set', async () => {
    const existing = baseTaskRow({ assignee_id: ACTOR_ID });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await taskService.assignTask(ORG_ID, ACTOR_ID, { taskId: TASK_ID, ownerId: ACTOR_ID });

    expect(tasksRepository.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// Slice 4.5 — Risk 1 regression tests: updateTask must diff against a
// CANONICAL (full-row) read. Before the fix, assertTaskInOrg loaded
// existing via the slim verifyTaskAccess projection (9 columns), so
// resubmitting an unchanged value for any field outside that projection
// (notes, milestone_id, due_at, start_at, estimated/actual_minutes,
// blocked_reason, waiting_on, next_action, source_type/reference) would
// always register as "changed" — and, in milestone_id's case, would
// falsely re-trigger a milestone/project progress recalculation on every
// single edit. These tests exercise exactly the fields that used to be
// omitted.
// ---------------------------------------------------------------------
describe('taskService.updateTask — canonical-row no-op detection (Slice 4.5 Risk 1)', () => {
  it('is a no-op when notes/description is resubmitted unchanged', async () => {
    const existing = baseTaskRow({ notes: 'Some context.' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await taskService.updateTask(ORG_ID, ACTOR_ID, TASK_ID, { description: 'Some context.' } as never);

    expect(tasksRepository.update).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
  });

  it('is a no-op when moved to the SAME milestone_id it already has — no recalculation triggered', async () => {
    const existing = baseTaskRow({ milestone_id: 'aaaa1111-eeee-eeee-eeee-eeeeeeeeeeee' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (milestonesRepository.verifyMilestoneBelongsToProject as ReturnType<typeof vi.fn>).mockResolvedValue({ belongs: true, status: 'in_progress' });

    await taskService.updateTask(ORG_ID, ACTOR_ID, TASK_ID, { milestoneId: 'aaaa1111-eeee-eeee-eeee-eeeeeeeeeeee' } as never);

    expect(tasksRepository.update).not.toHaveBeenCalled();
    expect(milestoneService.recalculateMilestoneProgress).not.toHaveBeenCalled();
  });

  it('is a no-op when dueAt/startAt are resubmitted unchanged', async () => {
    const existing = baseTaskRow({ due_at: '2026-07-20T08:00:00.000Z', start_at: '2026-07-18T08:00:00.000Z' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await taskService.updateTask(ORG_ID, ACTOR_ID, TASK_ID, {
      dueAt: '2026-07-20T10:00:00.000+02:00', // same instant, different offset formatting
      startAt: '2026-07-18T08:00:00.000Z',
    } as never);

    expect(tasksRepository.update).not.toHaveBeenCalled();
  });

  it('is a no-op when estimatedMinutes/actualMinutes are resubmitted unchanged', async () => {
    const existing = baseTaskRow({ estimated_minutes: 60, actual_minutes: 45 });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await taskService.updateTask(ORG_ID, ACTOR_ID, TASK_ID, { estimatedMinutes: '60', actualMinutes: '45' } as never);

    expect(tasksRepository.update).not.toHaveBeenCalled();
  });

  it('is a no-op when blockedReason/waitingOn/nextAction are resubmitted unchanged', async () => {
    const existing = baseTaskRow({ blocked_reason: 'Waiting on vendor.', waiting_on: 'Legal sign-off', next_action: 'Follow up Friday' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await taskService.updateTask(ORG_ID, ACTOR_ID, TASK_ID, {
      blockedReason: 'Waiting on vendor.',
      waitingOn: 'Legal sign-off',
      nextAction: 'Follow up Friday',
    } as never);

    expect(tasksRepository.update).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
  });

  it('is a no-op when sourceType/sourceReference are resubmitted unchanged', async () => {
    const existing = baseTaskRow({ source_type: 'manual', source_reference: null });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await taskService.updateTask(ORG_ID, ACTOR_ID, TASK_ID, { sourceType: 'manual' } as never);

    expect(tasksRepository.update).not.toHaveBeenCalled();
  });

  it('still detects a genuine change to a field outside the old slim projection', async () => {
    const existing = baseTaskRow({ notes: 'Old context.' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (tasksRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, notes: 'New context.' });

    await taskService.updateTask(ORG_ID, ACTOR_ID, TASK_ID, { description: 'New context.' } as never);

    expect(tasksRepository.update).toHaveBeenCalledTimes(1);
    expect(activityRepository.record).toHaveBeenCalledTimes(1);
    const metadata = (activityRepository.record as ReturnType<typeof vi.fn>).mock.calls[0]![0].metadata;
    expect(metadata.changed_fields).toEqual(['notes']);
  });
});

// ---------------------------------------------------------------------
// Slice 4.5 — Part 9 warning/failure handling: a task mutation's primary
// write must never be reported as failed just because its milestone
// roll-up failed afterward.
// ---------------------------------------------------------------------
describe('taskService — roll-up failure isolation (Slice 4.5 Part 9)', () => {
  it('completeTask succeeds and returns no warning when the roll-up also succeeds', async () => {
    const existing = baseTaskRow({ status: 'in_progress', milestone_id: 'aaaa1111-eeee-eeee-eeee-eeeeeeeeeeee' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (tasksRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, status: 'completed' });
    (milestoneService.recalculateMilestoneProgress as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await taskService.completeTask(ORG_ID, ACTOR_ID, { taskId: TASK_ID });

    expect(result.task.status).toBe('completed');
    expect(result.warning).toBeUndefined();
  });

  it('completeTask still reports success but returns a warning when the roll-up throws', async () => {
    const existing = baseTaskRow({ status: 'in_progress', milestone_id: 'aaaa1111-eeee-eeee-eeee-eeeeeeeeeeee' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (tasksRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, status: 'completed' });
    (milestoneService.recalculateMilestoneProgress as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db unavailable'));

    const result = await taskService.completeTask(ORG_ID, ACTOR_ID, { taskId: TASK_ID });

    // The primary write is NOT undone or reported as failed — it already
    // succeeded (tasksRepository.update resolved). Only the roll-up
    // failed, and that must surface as a warning, never a thrown error
    // that would make the whole action look like it failed.
    expect(result.task.status).toBe('completed');
    expect(result.warning).toBeTruthy();
    expect(result.warning).not.toContain('db unavailable'); // never leak the raw error
  });

  it('updateTask surfaces a warning when moving between milestones and one roll-up fails', async () => {
    const existing = baseTaskRow({ milestone_id: 'aaaa1111-eeee-eeee-eeee-eeeeeeeeeeee' });
    (tasksRepository.getTaskForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (tasksRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, milestone_id: 'bbbb2222-eeee-eeee-eeee-eeeeeeeeeeee' });
    (milestoneService.recalculateMilestoneProgress as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(undefined);

    const result = await taskService.updateTask(ORG_ID, ACTOR_ID, TASK_ID, { milestoneId: 'bbbb2222-eeee-eeee-eeee-eeeeeeeeeeee' } as never);

    expect(result.task.milestone_id).toBe('bbbb2222-eeee-eeee-eeee-eeeeeeeeeeee');
    expect(result.warning).toBeTruthy();
  });

  it('createTask returns a warning without throwing when its milestone roll-up fails', async () => {
    (tasksRepository.create as ReturnType<typeof vi.fn>).mockResolvedValue(baseTaskRow({ milestone_id: 'aaaa1111-eeee-eeee-eeee-eeeeeeeeeeee' }));
    (milestoneService.recalculateMilestoneProgress as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));

    const result = await taskService.createTask(ORG_ID, ACTOR_ID, {
      title: 'Test Task',
      projectId: PROJECT_ID,
      milestoneId: 'aaaa1111-eeee-eeee-eeee-eeeeeeeeeeee',
    } as never);

    expect(result.task.id).toBe(TASK_ID);
    expect(result.warning).toBeTruthy();
  });
});
