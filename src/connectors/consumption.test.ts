import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The connector must never confuse "could not read" with "read as zero", and
 * must never trust an undocumented endpoint's shape without checking it.
 */

const ENV_VARS = ['PPAC_BILLING_POLICY_ID', 'AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'];

async function freshConsumption() {
  vi.resetModules();
  return import('./consumption.js');
}

describe('getAgentConsumption', () => {
  beforeEach(() => {
    for (const v of ENV_VARS) delete process.env[v];
  });
  afterEach(() => {
    for (const v of ENV_VARS) delete process.env[v];
    vi.unstubAllGlobals();
  });

  it('refuses with no billing policy, and explains prepaid tenants have none', async () => {
    const { getAgentConsumption } = await freshConsumption();
    const result = await getAgentConsumption(30);

    expect(result.state).toBe('not_connected');
    if (result.state === 'not_connected') {
      expect(result.reason).toContain('PPAC_BILLING_POLICY_ID');
      expect(result.reason).toContain('prepaid capacity');
    }
    // No accidental "rows: []" a caller could mistake for zero usage.
    expect('rows' in result).toBe(false);
  });

  it('refuses when no token can be acquired, without ever calling the API', async () => {
    process.env.PPAC_BILLING_POLICY_ID = 'policy-1';
    // No AZURE_* set, so the real token module returns null and this never
    // reaches the network - if it did, the stub below would throw.
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('should not be called without a token');
    }));

    const { getAgentConsumption } = await freshConsumption();
    const result = await getAgentConsumption(30);

    expect(result.state).toBe('not_connected');
    if (result.state === 'not_connected') {
      expect(result.reason).toContain('token');
    }
  });

  it('treats a response missing "value" as a contract change, not zero usage', async () => {
    process.env.PPAC_BILLING_POLICY_ID = 'policy-1';
    process.env.AZURE_TENANT_ID = 't';
    process.env.AZURE_CLIENT_ID = 'c';
    process.env.AZURE_CLIENT_SECRET = 's';

    vi.doMock('../lib/tokens.js', () => ({ getToken: vi.fn().mockResolvedValue('fake-token') }));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ notWhatWeExpect: [] }), // no `value` array
      }),
    );

    const { getAgentConsumption } = await freshConsumption();
    const result = await getAgentConsumption(30);

    expect(result.state).toBe('not_connected');
    if (result.state === 'not_connected') {
      expect(result.reason).toContain('undocumented');
      expect(result.reason).toContain('value');
    }
  });

  it('reports 403 as a permissions problem, not as "no consumption"', async () => {
    process.env.PPAC_BILLING_POLICY_ID = 'policy-1';
    process.env.AZURE_TENANT_ID = 't';
    process.env.AZURE_CLIENT_ID = 'c';
    process.env.AZURE_CLIENT_SECRET = 's';

    vi.doMock('../lib/tokens.js', () => ({ getToken: vi.fn().mockResolvedValue('fake-token') }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    const { getAgentConsumption } = await freshConsumption();
    const result = await getAgentConsumption(30);

    expect(result.state).toBe('not_connected');
    if (result.state === 'not_connected') expect(result.reason).toContain('403');
  });

  it('parses a well-formed response, preserving null vs present meters', async () => {
    process.env.PPAC_BILLING_POLICY_ID = 'policy-1';
    process.env.AZURE_TENANT_ID = 't';
    process.env.AZURE_CLIENT_ID = 'c';
    process.env.AZURE_CLIENT_SECRET = 's';

    vi.doMock('../lib/tokens.js', () => ({ getToken: vi.fn().mockResolvedValue('fake-token') }));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            { botId: 'a', environmentId: 'e1', date: '2026-08-01', messageCount: 100, modelMeter: null },
            {
              botId: 'b',
              environmentId: 'e1',
              date: '2026-08-01',
              messageCount: 50,
              modelMeter: 'premium',
              generativeAnswers: 30,
              agentActions: 20,
              agentFlows: 0,
              textTools: 0,
            },
          ],
        }),
      }),
    );

    const { getAgentConsumption } = await freshConsumption();
    const result = await getAgentConsumption(30);

    expect(result.state).toBe('connected');
    if (result.state === 'connected') {
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]!.modelMeter).toBeNull();
      expect(result.rows[1]!.featureBreakdown?.generativeAnswers).toBe(30);
      expect(result.featureBreakdownAvailable).toBe(true);
      expect(result.policyId).toBe('policy-1');
    }
  });
});
