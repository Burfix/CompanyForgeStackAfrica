import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessRuleError } from '@/lib/errors';

const ORG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PROJECT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

vi.mock('@/repositories/chief-of-staff.repository', () => ({
  chiefOfStaffRepository: {
    listStaleGeneratingBriefings: vi.fn().mockResolvedValue([]),
    listActiveGeneratingBriefings: vi.fn().mockResolvedValue([]),
    markBriefingFailed: vi.fn(),
    loadEvidenceProjects: vi.fn().mockResolvedValue([
      {
        id: PROJECT_ID,
        name: 'Revenue Rollout',
        owner: null,
        status: 'active',
        health: 'off_track',
        health_note: null,
        priority_level: 'urgent',
        focus_level: 1,
        attention_mode: 'founder',
        founder_required: true,
        progress_percent: 20,
        progress_mode: 'manual',
        target_date: null,
        next_review_at: null,
        blocked_reason: null,
        waiting_on: null,
        business_impact: ['revenue'],
        updated_at: '2026-07-15T00:00:00Z',
        archived_at: null,
      },
    ]),
    loadEvidenceMilestones: vi.fn().mockResolvedValue([]),
    loadEvidenceTasks: vi.fn().mockResolvedValue([]),
    loadLastReconciliationRun: vi.fn().mockResolvedValue(null),
    getLatestReadyBriefing: vi.fn().mockResolvedValue(null),
    createGeneratingRecord: vi.fn().mockResolvedValue({ id: 'generating-id' }),
    finalizeBriefing: vi.fn().mockImplementation(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
    supersedePreviousBriefings: vi.fn(),
    getBriefingById: vi.fn(),
    recordFeedback: vi.fn(),
  },
}));

vi.mock('@/services/ai/chief-of-staff-provider', () => ({
  generateBriefingContent: vi.fn(),
  isAiProviderConfigured: vi.fn().mockReturnValue(false),
  ChiefOfStaffGenerationError: class ChiefOfStaffGenerationError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  PROMPT_VERSION: 'v1',
}));

const { chiefOfStaffRepository } = await import('@/repositories/chief-of-staff.repository');
const { isAiProviderConfigured } = await import('@/services/ai/chief-of-staff-provider');
const { generateBriefing, getBriefingFreshness } = await import('./chief-of-staff.service');

beforeEach(() => {
  vi.clearAllMocks();
  (chiefOfStaffRepository.listStaleGeneratingBriefings as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (chiefOfStaffRepository.listActiveGeneratingBriefings as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (isAiProviderConfigured as ReturnType<typeof vi.fn>).mockReturnValue(false);
});

describe('generateBriefing', () => {
  it('uses the deterministic fallback and stores status fallback_ready when the AI provider is not configured', async () => {
    const result = await generateBriefing({
      organizationId: ORG_ID,
      organizationName: 'ForgeStack Africa',
      userId: USER_ID,
      briefingType: 'manual',
    });

    expect(result.status).toBe('fallback_ready');
    expect(result.model_provider).toBeNull();
    expect(chiefOfStaffRepository.finalizeBriefing).toHaveBeenCalled();
  });

  it('refuses to start a second generation while one is already in progress, unless forced', async () => {
    (chiefOfStaffRepository.listActiveGeneratingBriefings as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'already-running', created_at: new Date().toISOString() }]);

    await expect(
      generateBriefing({ organizationId: ORG_ID, organizationName: 'ForgeStack Africa', userId: USER_ID, briefingType: 'manual' }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('recovers stale generating records before checking for an active generation', async () => {
    (chiefOfStaffRepository.listStaleGeneratingBriefings as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'stale-id', created_at: '2020-01-01T00:00:00Z' }]);

    await generateBriefing({ organizationId: ORG_ID, organizationName: 'ForgeStack Africa', userId: USER_ID, briefingType: 'manual' });

    expect(chiefOfStaffRepository.markBriefingFailed).toHaveBeenCalledWith('stale-id', 'generation_timed_out', expect.any(String));
  });

  it('supersedes previous daily briefings only for daily briefing type, never for manual', async () => {
    await generateBriefing({ organizationId: ORG_ID, organizationName: 'ForgeStack Africa', userId: USER_ID, briefingType: 'manual' });
    expect(chiefOfStaffRepository.supersedePreviousBriefings).not.toHaveBeenCalled();

    await generateBriefing({ organizationId: ORG_ID, organizationName: 'ForgeStack Africa', userId: USER_ID, briefingType: 'daily' });
    expect(chiefOfStaffRepository.supersedePreviousBriefings).toHaveBeenCalled();
  });
});

describe('getBriefingFreshness', () => {
  const NOW = new Date('2026-07-17T12:00:00Z');

  it('reports integrity_warning when reconciliation is not known consistent, regardless of recency', () => {
    const freshness = getBriefingFreshness({ data_as_of: '2026-07-17T11:00:00Z', generated_at: '2026-07-17T11:00:00Z' }, null, false, NOW);
    expect(freshness).toBe('integrity_warning');
  });

  it('reports stale once past the 24-hour window', () => {
    const freshness = getBriefingFreshness({ data_as_of: '2026-07-10T00:00:00Z', generated_at: '2026-07-10T00:00:00Z' }, null, true, NOW);
    expect(freshness).toBe('stale');
  });

  it('reports new_activity_available when activity occurred after data_as_of but the briefing is recent', () => {
    const freshness = getBriefingFreshness(
      { data_as_of: '2026-07-17T08:00:00Z', generated_at: '2026-07-17T08:00:00Z' },
      '2026-07-17T10:00:00Z',
      true,
      NOW,
    );
    expect(freshness).toBe('new_activity_available');
  });

  it('reports current when recent and no newer activity exists', () => {
    const freshness = getBriefingFreshness(
      { data_as_of: '2026-07-17T08:00:00Z', generated_at: '2026-07-17T08:00:00Z' },
      '2026-07-17T07:00:00Z',
      true,
      NOW,
    );
    expect(freshness).toBe('current');
  });
});
