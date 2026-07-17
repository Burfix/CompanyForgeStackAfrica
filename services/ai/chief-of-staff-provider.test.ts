import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildEvidencePacket } from '@/services/chief-of-staff-evidence.service';
import type { DeterministicCompanyAnalysis } from '@/types/chief-of-staff';

/**
 * These tests mock @anthropic-ai/sdk entirely — no real network call is
 * ever made in CI. That's the whole point of the provider abstraction:
 * everything above this boundary (analysis, evidence, fallback) is
 * testable without touching a real AI provider, and this file proves the
 * boundary itself (config gating, response validation, evidence
 * cross-checking) without spending a real API call.
 */

const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  class MockAPIConnectionTimeoutError extends Error {}
  class Anthropic {
    messages = { create: createMock };
    constructor(_opts: unknown) {}
    static APIConnectionTimeoutError = MockAPIConnectionTimeoutError;
  }
  return { default: Anthropic };
});

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const ORIGINAL_ENV = { ...process.env };

function baseAnalysis(): DeterministicCompanyAnalysis {
  return {
    scoringVersion: '1.0',
    dataAsOf: '2026-07-17T00:00:00Z',
    priorityCandidates: [
      {
        entityType: 'project',
        entityId: PROJECT_ID,
        projectId: PROJECT_ID,
        label: 'Revenue Rollout',
        score: 40,
        reasons: ['Off track'],
        evidence: [{ entity_type: 'project', entity_id: PROJECT_ID, label: 'Revenue Rollout' }],
      },
    ],
    risks: [],
    blockers: [],
    decisions: [],
    safeToIgnore: [],
    reconciliation: { lastRunAt: null, milestoneCorrections: null, projectCorrections: null, failureCount: null, isKnownConsistent: true },
    sourceRecordCount: 1,
    latestActivityAt: null,
  };
}

function validOutput() {
  return {
    title: 'Weekly Briefing',
    executive_summary: 'One project needs attention.',
    top_priorities: [
      {
        id: PROJECT_ID,
        title: 'Revenue Rollout',
        reason: 'Off track',
        recommended_focus: 'Review budget',
        urgency: 'high',
        confidence: 'high',
        evidence: [{ entity_type: 'project', entity_id: PROJECT_ID, label: 'Revenue Rollout' }],
      },
    ],
    risks: [],
    blockers: [],
    decisions_required: [],
    safe_to_ignore: [],
    changes_since_previous: [],
    observations: [],
  };
}

beforeEach(() => {
  createMock.mockReset();
  process.env.AI_PROVIDER = 'anthropic';
  process.env.AI_MODEL = 'claude-sonnet-4-5';
  process.env.AI_API_KEY = 'test-key';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('isAiProviderConfigured', () => {
  it('is false when any of AI_PROVIDER/AI_MODEL/AI_API_KEY is missing', async () => {
    delete process.env.AI_API_KEY;
    vi.resetModules();
    const { isAiProviderConfigured } = await import('./chief-of-staff-provider');
    expect(isAiProviderConfigured()).toBe(false);
  });

  it('is true when all three are set', async () => {
    vi.resetModules();
    const { isAiProviderConfigured } = await import('./chief-of-staff-provider');
    expect(isAiProviderConfigured()).toBe(true);
  });
});

describe('generateBriefingContent', () => {
  it('throws provider_not_configured when env vars are missing, without ever calling the SDK', async () => {
    delete process.env.AI_API_KEY;
    vi.resetModules();
    const { generateBriefingContent, ChiefOfStaffGenerationError } = await import('./chief-of-staff-provider');
    const analysis = baseAnalysis();
    const packet = buildEvidencePacket('ForgeStack Africa', analysis, [], [], [], []);

    await expect(generateBriefingContent({ evidencePacket: packet })).rejects.toBeInstanceOf(ChiefOfStaffGenerationError);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('returns validated output and evidence check passes when the model response is well-formed', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(validOutput()) }] });
    vi.resetModules();
    process.env.AI_PROVIDER = 'anthropic';
    process.env.AI_MODEL = 'claude-sonnet-4-5';
    process.env.AI_API_KEY = 'test-key';
    const { generateBriefingContent } = await import('./chief-of-staff-provider');
    const analysis = baseAnalysis();
    const packet = buildEvidencePacket('ForgeStack Africa', analysis, [], [], [], []);

    const result = await generateBriefingContent({ evidencePacket: packet });
    expect(result.output.title).toBe('Weekly Briefing');
    expect(result.modelProvider).toBe('anthropic');
  });

  it('rejects a response that references an evidence id not present in the packet', async () => {
    const output = validOutput();
    output.top_priorities[0]!.evidence = [{ entity_type: 'project', entity_id: '99999999-9999-9999-9999-999999999999', label: 'Fake' }];
    createMock.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(output) }] });
    vi.resetModules();
    process.env.AI_PROVIDER = 'anthropic';
    process.env.AI_MODEL = 'claude-sonnet-4-5';
    process.env.AI_API_KEY = 'test-key';
    const { generateBriefingContent, ChiefOfStaffGenerationError } = await import('./chief-of-staff-provider');
    const analysis = baseAnalysis();
    const packet = buildEvidencePacket('ForgeStack Africa', analysis, [], [], [], []);

    await expect(generateBriefingContent({ evidencePacket: packet })).rejects.toMatchObject({
      code: 'evidence_verification_failed',
    });
  });

  it('rejects a response with more than 3 top priorities (schema-enforced cap)', async () => {
    const output = validOutput();
    const priority = output.top_priorities[0]!;
    output.top_priorities = [priority, priority, priority, priority];
    createMock.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(output) }] });
    vi.resetModules();
    process.env.AI_PROVIDER = 'anthropic';
    process.env.AI_MODEL = 'claude-sonnet-4-5';
    process.env.AI_API_KEY = 'test-key';
    const { generateBriefingContent } = await import('./chief-of-staff-provider');
    const analysis = baseAnalysis();
    const packet = buildEvidencePacket('ForgeStack Africa', analysis, [], [], [], []);

    await expect(generateBriefingContent({ evidencePacket: packet })).rejects.toMatchObject({
      code: 'provider_invalid_response',
    });
  });

  it('rejects malformed (non-JSON) model output', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'not json at all' }] });
    vi.resetModules();
    process.env.AI_PROVIDER = 'anthropic';
    process.env.AI_MODEL = 'claude-sonnet-4-5';
    process.env.AI_API_KEY = 'test-key';
    const { generateBriefingContent } = await import('./chief-of-staff-provider');
    const analysis = baseAnalysis();
    const packet = buildEvidencePacket('ForgeStack Africa', analysis, [], [], [], []);

    await expect(generateBriefingContent({ evidencePacket: packet })).rejects.toMatchObject({
      code: 'provider_invalid_response',
    });
  });
});
