import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORG_ID = '11111111-1111-1111-1111-111111111111';

const getByIdMock = vi.fn();
const generateScheduledDailyBriefingMock = vi.fn();

vi.mock('@/repositories/organizations.repository', () => ({
  organizationsRepository: { getById: getByIdMock },
}));

vi.mock('@/services/chief-of-staff.service', () => ({
  generateScheduledDailyBriefing: generateScheduledDailyBriefingMock,
}));

const ORIGINAL_ENV = { ...process.env };

function req(headers: Record<string, string> = {}) {
  return new Request('https://example.com/api/cron/chief-of-staff', { method: 'GET', headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'test-secret-value';
  process.env.CHIEF_OF_STAFF_CRON_ORGANIZATION_ID = ORG_ID;
  process.env.CHIEF_OF_STAFF_TIME_ZONE = 'Africa/Johannesburg';
  getByIdMock.mockResolvedValue({ id: ORG_ID, name: 'ForgeStack Africa', slug: 'forgestack-africa', created_at: '2026-01-01T00:00:00Z' });
  generateScheduledDailyBriefingMock.mockResolvedValue({
    generated: true,
    skipped: false,
    briefing: { id: 'briefing-id', status: 'fallback_ready' },
    briefingId: 'briefing-id',
    briefingDate: '2026-07-17',
  });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('GET /api/cron/chief-of-staff — authentication', () => {
  it('fails closed when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import('./route');
    const response = await GET(req({ authorization: 'Bearer test-secret-value' }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toContain('test-secret-value');
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const { GET } = await import('./route');
    const response = await GET(req());
    expect(response.status).toBe(401);
  });

  it('returns 401 for a wrong token', async () => {
    const { GET } = await import('./route');
    const response = await GET(req({ authorization: 'Bearer wrong-value' }));
    expect(response.status).toBe(401);
  });

  it('returns 401 for a malformed Bearer header (wrong scheme)', async () => {
    const { GET } = await import('./route');
    const response = await GET(req({ authorization: 'Basic test-secret-value' }));
    expect(response.status).toBe(401);
  });

  it('passes authentication with a valid token', async () => {
    const { GET } = await import('./route');
    const response = await GET(req({ authorization: 'Bearer test-secret-value' }));
    expect(response.status).toBe(200);
  });

  it('never includes the secret in the response body, success or failure', async () => {
    const { GET } = await import('./route');
    const okResponse = await GET(req({ authorization: 'Bearer test-secret-value' }));
    const okBody = JSON.stringify(await okResponse.json());
    expect(okBody).not.toContain('test-secret-value');

    const failResponse = await GET(req({ authorization: 'Bearer wrong-value' }));
    const failBody = JSON.stringify(await failResponse.json());
    expect(failBody).not.toContain('test-secret-value');
    expect(failBody).not.toContain('wrong-value');
  });
});

describe('GET /api/cron/chief-of-staff — configuration', () => {
  const AUTH = { authorization: 'Bearer test-secret-value' };

  it('fails safely when CHIEF_OF_STAFF_CRON_ORGANIZATION_ID is missing', async () => {
    delete process.env.CHIEF_OF_STAFF_CRON_ORGANIZATION_ID;
    const { GET } = await import('./route');
    const response = await GET(req(AUTH));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('CHIEF_OF_STAFF_CRON_NOT_CONFIGURED');
  });

  it('fails safely when the organisation id is not a valid UUID', async () => {
    process.env.CHIEF_OF_STAFF_CRON_ORGANIZATION_ID = 'not-a-uuid';
    const { GET } = await import('./route');
    const response = await GET(req(AUTH));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('CHIEF_OF_STAFF_CRON_ORGANIZATION_INVALID');
  });

  it('fails safely when CHIEF_OF_STAFF_TIME_ZONE is missing', async () => {
    delete process.env.CHIEF_OF_STAFF_TIME_ZONE;
    const { GET } = await import('./route');
    const response = await GET(req(AUTH));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('CHIEF_OF_STAFF_CRON_NOT_CONFIGURED');
  });

  it('fails safely when the timezone is invalid', async () => {
    process.env.CHIEF_OF_STAFF_TIME_ZONE = 'Not/A_Zone';
    const { GET } = await import('./route');
    const response = await GET(req(AUTH));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('CHIEF_OF_STAFF_CRON_NOT_CONFIGURED');
  });

  it('resolves correctly with valid configuration', async () => {
    const { GET } = await import('./route');
    const response = await GET(req(AUTH));
    expect(response.status).toBe(200);
    expect(getByIdMock).toHaveBeenCalledWith(ORG_ID, true);
  });

  it('cannot have its target organisation overridden by a query parameter', async () => {
    const { GET } = await import('./route');
    const request = new Request('https://example.com/api/cron/chief-of-staff?organizationId=99999999-9999-9999-9999-999999999999', {
      method: 'GET',
      headers: AUTH,
    });
    await GET(request);
    // The route never reads request.url for an organization id — confirm
    // it still resolved the env-configured org, not the query param.
    expect(getByIdMock).toHaveBeenCalledWith(ORG_ID, true);
  });

  it('returns a safe error when the configured organisation cannot be loaded', async () => {
    getByIdMock.mockRejectedValue(new Error('not found'));
    const { GET } = await import('./route');
    const response = await GET(req(AUTH));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('CHIEF_OF_STAFF_CRON_ORGANIZATION_INVALID');
  });
});

describe('GET /api/cron/chief-of-staff — generation', () => {
  const AUTH = { authorization: 'Bearer test-secret-value' };

  it('returns generated: true for a fresh generation', async () => {
    const { GET } = await import('./route');
    const response = await GET(req(AUTH));
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.generated).toBe(true);
    expect(body.skipped).toBe(false);
    expect(body.briefingId).toBe('briefing-id');
    expect(body.requestId).toEqual(expect.any(String));
  });

  it('returns skipped: true without treating it as an error', async () => {
    generateScheduledDailyBriefingMock.mockResolvedValue({
      generated: false,
      skipped: true,
      reason: 'daily_briefing_exists',
      briefingId: 'existing-id',
      briefingDate: '2026-07-17',
    });
    const { GET } = await import('./route');
    const response = await GET(req(AUTH));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.generated).toBe(false);
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe('daily_briefing_exists');
  });

  it('returns a safe 500 on total generation failure without leaking the raw error', async () => {
    generateScheduledDailyBriefingMock.mockRejectedValue(new Error('database is unavailable: connection refused at 10.0.0.5'));
    const { GET } = await import('./route');
    const response = await GET(req(AUTH));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('CHIEF_OF_STAFF_CRON_FAILED');
    expect(JSON.stringify(body)).not.toContain('10.0.0.5');
  });

  it('response never includes evidence, prompts, or provider data', async () => {
    const { GET } = await import('./route');
    const response = await GET(req(AUTH));
    const body = await response.json();
    const keys = Object.keys(body);
    expect(keys).toEqual(expect.arrayContaining(['ok', 'generated', 'skipped', 'briefingId', 'briefingDate', 'requestId']));
    expect(body).not.toHaveProperty('evidencePacket');
    expect(body).not.toHaveProperty('prompt');
    expect(body).not.toHaveProperty('deterministicSnapshot');
  });
});

describe('GET /api/cron/chief-of-staff — route behaviour', () => {
  it('is configured as dynamic/uncached', async () => {
    const routeModule = await import('./route');
    expect(routeModule.dynamic).toBe('force-dynamic');
    expect(routeModule.revalidate).toBe(0);
  });
});
