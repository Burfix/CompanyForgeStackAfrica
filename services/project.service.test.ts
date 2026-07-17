import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';

vi.mock('@/repositories/projects.repository', () => ({
  projectsRepository: {
    getProjectForMutation: vi.fn(),
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

vi.mock('@/repositories/project-dependencies.repository', () => ({
  projectDependenciesRepository: {
    exists: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  },
}));

// Imported after the mocks so the mocked modules are what get wired in.
const { projectsRepository } = await import('@/repositories/projects.repository');
const { organizationsRepository } = await import('@/repositories/organizations.repository');
const { activityRepository } = await import('@/repositories/activity.repository');
const { projectDependenciesRepository } = await import('@/repositories/project-dependencies.repository');
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
    description: null,
    status: 'proposed',
    focus_level: 3,
    health: 'unknown',
    health_note: null,
    owner_id: null,
    desired_outcome: 'Ship it.',
    success_metric: null,
    target_value: null,
    current_value: null,
    start_date: null,
    target_date: null,
    next_review_at: null,
    priority_score: 0,
    priority_level: 'medium',
    review_cadence: 'none',
    attention_mode: 'no_attention',
    business_impact: [],
    progress_mode: 'manual',
    progress_percent: 0,
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
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, { name: 'New Name' } as never),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(projectsRepository.update).not.toHaveBeenCalled();
  });
});

describe('projectService.updateProject — no-op vs real changes', () => {
  it('does not write to the repository or activity log when nothing actually changed', async () => {
    const existing = baseProjectRow();
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, {
      name: existing.name,
      category: existing.category,
    } as never);

    expect(projectsRepository.update).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
  });

  it('writes an update and a matching activity record when a field actually changes', async () => {
    const existing = baseProjectRow();
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
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
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
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
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
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
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
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
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
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
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
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
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await projectService.updateProjectStatus(ORG_ID, ACTOR_ID, { projectId: PROJECT_ID, status: 'active' });

    expect(projectsRepository.update).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
  });
});

describe('projectService.updateProject — attention mode sync', () => {
  it('setting attentionMode to founder also sets founder_attention_required true', async () => {
    const existing = baseProjectRow({ attention_mode: 'no_attention', founder_attention_required: false });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (projectsRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, attention_mode: 'founder', founder_attention_required: true });

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, { attentionMode: 'founder' } as never);

    const patch = (projectsRepository.update as ReturnType<typeof vi.fn>).mock.calls[0]![2];
    expect(patch.attention_mode).toBe('founder');
    expect(patch.founder_attention_required).toBe(true);
  });

  it('setting attentionMode to delegated sets founder_attention_required false', async () => {
    const existing = baseProjectRow({ attention_mode: 'founder', founder_attention_required: true });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (projectsRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, attention_mode: 'delegated', founder_attention_required: false });

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, { attentionMode: 'delegated' } as never);

    const patch = (projectsRepository.update as ReturnType<typeof vi.fn>).mock.calls[0]![2];
    expect(patch.founder_attention_required).toBe(false);
  });
});

describe('projectService.updateProject — business_impact no-op detection', () => {
  it('does not treat a resubmitted identical array as a change', async () => {
    const existing = baseProjectRow({ business_impact: ['revenue', 'product'] });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, { businessImpact: ['product', 'revenue'] } as never);

    expect(projectsRepository.update).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
  });

  it('logs a change when business impact values actually differ', async () => {
    const existing = baseProjectRow({ business_impact: ['revenue'] });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (projectsRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, business_impact: ['revenue', 'customer'] });

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, { businessImpact: ['revenue', 'customer'] } as never);

    expect(projectsRepository.update).toHaveBeenCalledTimes(1);
    expect(activityRepository.record).toHaveBeenCalledTimes(1);
  });
});

describe('projectService.updateProject — health/priority/progress activity descriptions', () => {
  it('describes a health change with before/after labels', async () => {
    // health_note is pre-populated and resubmitted unchanged so this is a
    // genuine single-field (health) diff — at_risk/off_track both require a
    // note, so a fresh transition into either always changes two fields at
    // once, which is exercised separately below.
    const existing = baseProjectRow({ health: 'at_risk', health_note: 'Already known issue.' });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (projectsRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, health: 'off_track' });

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, { health: 'off_track', healthNote: 'Already known issue.' } as never);

    const call = (activityRepository.record as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.title).toContain('At Risk');
    expect(call.title).toContain('Off Track');
  });

  it('a fresh at_risk transition changes both health and health_note together', async () => {
    const existing = baseProjectRow({ health: 'healthy', health_note: null });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (projectsRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, health: 'at_risk', health_note: 'Slipping.' });

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, { health: 'at_risk', healthNote: 'Slipping.' } as never);

    const call = (activityRepository.record as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.metadata.changed_fields.sort()).toEqual(['health', 'health_note']);
  });

  it('describes a progress change with before/after percentages', async () => {
    const existing = baseProjectRow({ progress_percent: 40 });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (projectsRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, progress_percent: 60 });

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, { progressPercent: 60 } as never);

    const call = (activityRepository.record as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.title).toContain('40%');
    expect(call.title).toContain('60%');
  });

  it('a same-value progress resubmission is a no-op', async () => {
    const existing = baseProjectRow({ progress_percent: 50 });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, { progressPercent: 50 } as never);

    expect(projectsRepository.update).not.toHaveBeenCalled();
  });
});

describe('projectService.addProjectDependency', () => {
  const OTHER_PROJECT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  it('rejects a self-dependency before touching the repository', async () => {
    await expect(
      projectService.addProjectDependency(ORG_ID, ACTOR_ID, {
        projectId: PROJECT_ID,
        dependsOnProjectId: PROJECT_ID,
        dependencyType: 'depends_on',
      } as never),
    ).rejects.toThrow();

    expect(projectDependenciesRepository.create).not.toHaveBeenCalled();
  });

  it('rejects when the depends-on project is not in the same organization (getProjectForMutation returns null)', async () => {
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(baseProjectRow())
      .mockResolvedValueOnce(null);

    await expect(
      projectService.addProjectDependency(ORG_ID, ACTOR_ID, {
        projectId: PROJECT_ID,
        dependsOnProjectId: OTHER_PROJECT_ID,
        dependencyType: 'depends_on',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(projectDependenciesRepository.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate dependency', async () => {
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(baseProjectRow())
      .mockResolvedValueOnce(baseProjectRow({ id: OTHER_PROJECT_ID, name: 'Other' }));
    (projectDependenciesRepository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await expect(
      projectService.addProjectDependency(ORG_ID, ACTOR_ID, {
        projectId: PROJECT_ID,
        dependsOnProjectId: OTHER_PROJECT_ID,
        dependencyType: 'depends_on',
      } as never),
    ).rejects.toMatchObject({ code: 'DUPLICATE_DEPENDENCY' });

    expect(projectDependenciesRepository.create).not.toHaveBeenCalled();
  });

  it('creates the dependency and logs activity when valid', async () => {
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(baseProjectRow())
      .mockResolvedValueOnce(baseProjectRow({ id: OTHER_PROJECT_ID, name: 'Other' }));
    (projectDependenciesRepository.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (projectDependenciesRepository.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' });

    await projectService.addProjectDependency(ORG_ID, ACTOR_ID, {
      projectId: PROJECT_ID,
      dependsOnProjectId: OTHER_PROJECT_ID,
      dependencyType: 'blocks',
    } as never);

    expect(projectDependenciesRepository.create).toHaveBeenCalledTimes(1);
    expect(activityRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'project.dependency_added' }),
    );
  });
});

describe('projectService.removeProjectDependency', () => {
  it('logs activity when a dependency is removed', async () => {
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(baseProjectRow());
    (projectDependenciesRepository.remove as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' });

    await projectService.removeProjectDependency(ORG_ID, ACTOR_ID, {
      projectId: PROJECT_ID,
      dependencyId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    });

    expect(activityRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'project.dependency_removed' }),
    );
  });

  it('throws NotFoundError when the dependency does not exist', async () => {
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(baseProjectRow());
    (projectDependenciesRepository.remove as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      projectService.removeProjectDependency(ORG_ID, ACTOR_ID, {
        projectId: PROJECT_ID,
        dependencyId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ---------------------------------------------------------------------
// Slice 4.5 — Risk 1 regression tests: updateProject must diff against a
// CANONICAL (full-row) read. Before the fix, assertProjectInOrg loaded
// existing via the slim verifyProjectAccess projection (6 columns), so
// resubmitting an unchanged value for any field outside that projection
// (description, success_metric, target_value, current_value, start_date,
// target_date, next_review_at, business_impact, health_note, waiting_on,
// blocked_reason, progress_mode, ...) would always register as "changed"
// and trigger a spurious write + activity record. These tests exercise
// exactly the fields that used to be omitted.
// ---------------------------------------------------------------------
describe('projectService.updateProject — canonical-row no-op detection (Slice 4.5 Risk 1)', () => {
  it('is a no-op when description is resubmitted unchanged', async () => {
    const existing = baseProjectRow({ description: 'Executive notes here.' });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, { description: 'Executive notes here.' } as never);

    expect(projectsRepository.update).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
  });

  it('is a no-op when successMetric/targetValue/currentValue are resubmitted unchanged', async () => {
    const existing = baseProjectRow({ success_metric: 'Signed contracts', target_value: '100', current_value: '40' });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, {
      successMetric: 'Signed contracts',
      targetValue: '100',
      currentValue: '40',
    } as never);

    expect(projectsRepository.update).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
  });

  it('is a no-op when a numeric-text value is resubmitted with an equivalent-but-differently-formatted representation', async () => {
    const existing = baseProjectRow({ target_value: '100' });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, { targetValue: '100.0' } as never);

    expect(projectsRepository.update).not.toHaveBeenCalled();
  });

  it('is a no-op when startDate/targetDate/nextReviewAt are resubmitted unchanged', async () => {
    const existing = baseProjectRow({ start_date: '2026-01-01', target_date: '2026-12-31', next_review_at: '2026-08-01T09:00:00.000Z' });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, {
      startDate: '2026-01-01',
      targetDate: '2026-12-31',
      nextReviewAt: '2026-08-01T09:00:00.000Z',
    } as never);

    expect(projectsRepository.update).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
  });

  it('is a no-op when reviewCadence is resubmitted unchanged', async () => {
    const existing = baseProjectRow({ review_cadence: 'weekly' });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, { reviewCadence: 'weekly' } as never);

    expect(projectsRepository.update).not.toHaveBeenCalled();
  });

  it('is a no-op when progressMode is resubmitted unchanged', async () => {
    const existing = baseProjectRow({ progress_mode: 'milestones' });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, { progressMode: 'milestones' } as never);

    expect(projectsRepository.update).not.toHaveBeenCalled();
  });

  it('is a no-op when ownerId is resubmitted as the same owner already set', async () => {
    const OWNER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const existing = baseProjectRow({ owner_id: OWNER_ID });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (organizationsRepository.verifyOrganisationMember as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, { ownerId: OWNER_ID } as never);

    expect(projectsRepository.update).not.toHaveBeenCalled();
  });

  it('still detects a genuine change to a field outside the old slim projection', async () => {
    const existing = baseProjectRow({ description: 'Old notes.' });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (projectsRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, description: 'New notes.' });

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, { description: 'New notes.' } as never);

    expect(projectsRepository.update).toHaveBeenCalledTimes(1);
    expect(activityRepository.record).toHaveBeenCalledTimes(1);
    const metadata = (activityRepository.record as ReturnType<typeof vi.fn>).mock.calls[0]![0].metadata;
    expect(metadata.changed_fields).toEqual(['description']);
  });

  it('a genuinely unchanged full resubmission of every mapped field writes nothing at all', async () => {
    const existing = baseProjectRow({
      name: 'Test Project',
      category: 'engineering',
      description: 'Notes.',
      owner_id: null,
      status: 'active',
      focus_level: 2,
      desired_outcome: 'Ship it.',
      success_metric: 'Signed deals',
      target_value: '100',
      current_value: '40',
      start_date: '2026-01-01',
      target_date: '2026-12-31',
      next_review_at: null,
      review_cadence: 'weekly',
      blocked_reason: null,
      waiting_on: null,
      attention_mode: 'team',
      priority_level: 'high',
      priority_score: 10,
      health: 'healthy',
      health_note: null,
      business_impact: ['revenue', 'compliance'],
      progress_mode: 'manual',
      progress_percent: 40,
    });
    (projectsRepository.getProjectForMutation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    await projectService.updateProject(ORG_ID, ACTOR_ID, PROJECT_ID, {
      name: 'Test Project',
      category: 'engineering',
      description: 'Notes.',
      status: 'active',
      focusLevel: 2,
      desiredOutcome: 'Ship it.',
      successMetric: 'Signed deals',
      targetValue: '100',
      currentValue: '40',
      startDate: '2026-01-01',
      targetDate: '2026-12-31',
      reviewCadence: 'weekly',
      attentionMode: 'team',
      priorityLevel: 'high',
      priorityScore: 10,
      health: 'healthy',
      businessImpact: ['compliance', 'revenue'],
      progressMode: 'manual',
      progressPercent: 40,
    } as never);

    expect(projectsRepository.update).not.toHaveBeenCalled();
    expect(activityRepository.record).not.toHaveBeenCalled();
  });
});
