import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';

vi.mock('@/repositories/projects.repository', () => ({
  projectsRepository: {
    verifyProjectAccess: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    countCriticalProjects: vi.fn(),
    slugExists: vi.fn(),
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

// Imported after the mocks so the mocked modules are what get wired in.
const { projectsRepository } = await import('@/repositories/projects.repository');
const { organizationsRepository } = await import('@/repositories/organizations.repository');
const { activityRepository } = await import('@/repositories/activity.repository');
const { projectService } = await import('./project.service');

const ORG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTOR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PROJECT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function baseProjectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROJECT_ID,
    organization_id: ORG_ID,
    name: 'Test Project',
    category: 'engineering',
    status: 'proposed',
    focus_level: 3,
    health: 'on_track',
    owner_id: null,
    desired_outcome: 'Ship it.',
    priority_score: 0,
    founder_attention_required: false,
    last_activity_at: new Date().toISOString(),
    blocked_reason: null,
    waiting_on: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('projectService.createProject', () => {
  it('creates a project and writes a single "created" activity record', async () => {
    (projectsRepository.slugExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (projectsRepository.create as ReturnType<typeof vi.fn>).mockResolvedValue(baseProjectRow());

    const result = await projectService.createProject(ORG_ID, ACTOR_ID, {
      name: 'Test Project',
      category: 'engineering',
      desiredOutcome: 'Ship it.',
    } as never);

    expect(result.id).toBe(PROJECT_ID);
    expect(activityRepository.record).toHaveBeenCalledTimes(1);
    expect((activityRepository.record as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({
      event_type: 'project.created',
      entity_type: 'project',
      entity_id: PROJECT_ID,
    });
  });

  it('rejects an owner who is not a member of the organization', async () => {
    (organizationsRepository.verifyOrganisationMember as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await expect(
      projectService.createProject(ORG_ID, ACTOR_ID, {
        name: 'Test Project',
        category: 'engineering',
        desiredOutcome: 'Ship it.',
        ownerId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      } as never),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    expect(projectsRepository.create).not.toHaveBeenCalled();
  });
});

describe('projectService.updateProject — access control', () => {
  it('throws NotFoundError for a project outside the organization (or that does not exist)', async () => {
    (projectsRepository.verifyProjectAccess as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, { name: 'New Name' } as never),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(projectsRepository.update).not.toHaveBeenCalled();
  });
});

describe('projectService.updateProject — no-op vs real changes', () => {
  it('does not write to the repository or activity log when nothing actually changed', async () => {
    const existing = baseProjectRow();
    (projectsRepository.verifyProjectAccess as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, {
      name: existing.name,
      category: existing.category,
    } as never);

    expect(projectsRepository.update).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
  });

  it('writes an update and a matching activity record when a field actually changes', async () => {
    const existing = baseProjectRow();
    (projectsRepository.verifyProjectAccess as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (projectsRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, name: 'Renamed' });

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, { name: 'Renamed' } as never);

    expect(projectsRepository.update).toHaveBeenCalledTimes(1);
    expect(activityRepository.record).toHaveBeenCalledTimes(1);
    const metadata = (activityRepository.record as ReturnType<typeof vi.fn>).mock.calls[0]![0].metadata;
    expect(metadata.changed_fields).toEqual(['name']);
    expect(metadata.previous_values.name).toBe('Test Project');
    expect(metadata.new_values.name).toBe('Renamed');
  });
});

describe('projectService.updateProjectFocusLevel — Critical limit', () => {
  it('rejects a 4th Critical project without an override', async () => {
    const existing = baseProjectRow({ focus_level: 3 });
    (projectsRepository.verifyProjectAccess as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (projectsRepository.countCriticalProjects as ReturnType<typeof vi.fn>).mockResolvedValue(3);

    await expect(
      projectService.updateProjectFocusLevel(ORG_ID, ACTOR_ID, {
        projectId: PROJECT_ID,
        focusLevel: 1,
        reason: 'Urgent.',
      } as never),
    ).rejects.toMatchObject({ code: 'CRITICAL_LIMIT_EXCEEDED' });

    expect(projectsRepository.update).not.toHaveBeenCalled();
  });

  it('allows a 4th Critical project with an explicit override', async () => {
    const existing = baseProjectRow({ focus_level: 3 });
    (projectsRepository.verifyProjectAccess as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (projectsRepository.countCriticalProjects as ReturnType<typeof vi.fn>).mockResolvedValue(3);
    (projectsRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, focus_level: 1 });

    await projectService.updateProjectFocusLevel(ORG_ID, ACTOR_ID, {
      projectId: PROJECT_ID,
      focusLevel: 1,
      reason: 'Urgent.',
      overrideCriticalLimit: true,
      overrideReason: 'Board deadline moved up.',
    } as never);

    expect(projectsRepository.update).toHaveBeenCalledTimes(1);
    const metadata = (activityRepository.record as ReturnType<typeof vi.fn>).mock.calls[0]![0].metadata;
    expect(metadata.override_applied).toBe(true);
    expect(metadata.override_reason).toBe('Board deadline moved up.');
  });

  it('allows Critical when under the limit, no override needed', async () => {
    const existing = baseProjectRow({ focus_level: 3 });
    (projectsRepository.verifyProjectAccess as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (projectsRepository.countCriticalProjects as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (projectsRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, focus_level: 1 });

    await expect(
      projectService.updateProjectFocusLevel(ORG_ID, ACTOR_ID, {
        projectId: PROJECT_ID,
        focusLevel: 1,
        reason: 'Urgent.',
      } as never),
    ).resolves.toBeDefined();
  });
});

describe('projectService.archiveOrParkProject', () => {
  it('parking sets status to parked and focus level to 5, and logs activity', async () => {
    const existing = baseProjectRow({ status: 'active', focus_level: 2 });
    (projectsRepository.verifyProjectAccess as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (projectsRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, status: 'parked', focus_level: 5 });

    await projectService.archiveOrParkProject(ORG_ID, ACTOR_ID, {
      projectId: PROJECT_ID,
      action: 'park',
      reason: 'Deprioritized.',
    });

    expect(projectsRepository.update).toHaveBeenCalledWith(
      ORG_ID,
      PROJECT_ID,
      expect.objectContaining({ status: 'parked', focus_level: 5 }),
    );
    expect(activityRepository.record).toHaveBeenCalledTimes(1);
  });

  it('archiving sets archived_at without requiring a reason', async () => {
    const existing = baseProjectRow({ status: 'completed' });
    (projectsRepository.verifyProjectAccess as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (projectsRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, archived_at: new Date().toISOString() });

    await projectService.archiveOrParkProject(ORG_ID, ACTOR_ID, { projectId: PROJECT_ID, action: 'archive' });

    expect(projectsRepository.update).toHaveBeenCalledWith(
      ORG_ID,
      PROJECT_ID,
      expect.objectContaining({ archived_at: expect.any(String) }),
    );
  });
});

describe('projectService.updateProjectStatus', () => {
  it('is a no-op when the status is unchanged', async () => {
    const existing = baseProjectRow({ status: 'active' });
    (projectsRepository.verifyProjectAccess as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await projectService.updateProjectStatus(ORG_ID, ACTOR_ID, { projectId: PROJECT_ID, status: 'active' });

    expect(projectsRepository.update).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
  });
});
