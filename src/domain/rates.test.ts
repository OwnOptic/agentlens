import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * rates.ts is the only place a price exists in this codebase. These tests exist
 * to keep it that way: the rate must be correct, and its provenance must always
 * be stated, because a per-agent cost with an invisible multiplier behind it is
 * indistinguishable from a fabricated one.
 */

const RATE_VARS = ['COPILOT_RATE_STANDARD', 'COPILOT_RATE_PREMIUM', 'COPILOT_RATE_CURRENCY'];

async function freshRates() {
  vi.resetModules();
  return import('./rates.js');
}

describe('resolveRates', () => {
  beforeEach(() => {
    for (const v of RATE_VARS) delete process.env[v];
  });
  afterEach(() => {
    for (const v of RATE_VARS) delete process.env[v];
  });

  it('falls back to published list price when nothing is configured', async () => {
    const { resolveRates } = await freshRates();
    const rates = resolveRates();

    expect(rates.source).toBe('list_price');
    expect(rates.standard).toBe(0.01);
    expect(rates.premium).toBe(0.025);
    expect(rates.currency).toBe('USD');
  });

  it('states the rate, that it is a list price, and that prepaid differs', async () => {
    const { resolveRates } = await freshRates();
    const { basis } = resolveRates();

    // The basis is relayed to the administrator verbatim, so it has to carry
    // the number itself - not just a vague "list price" label.
    expect(basis).toContain('0.01');
    expect(basis).toContain('0.025');
    expect(basis).toContain('list price');
    expect(basis).toContain('prepaid');
    expect(basis).toContain('COPILOT_RATE_STANDARD');
  });

  it('prefers operator-configured rates over list price', async () => {
    process.env.COPILOT_RATE_STANDARD = '0.004';
    process.env.COPILOT_RATE_PREMIUM = '0.012';
    process.env.COPILOT_RATE_CURRENCY = 'CHF';

    const { resolveRates } = await freshRates();
    const rates = resolveRates();

    expect(rates.source).toBe('operator');
    expect(rates.standard).toBe(0.004);
    expect(rates.premium).toBe(0.012);
    expect(rates.currency).toBe('CHF');
    expect(rates.basis).toContain('configured on this deployment');
  });

  it('discloses a half-configured rate table rather than silently mixing sources', async () => {
    process.env.COPILOT_RATE_STANDARD = '0.004';

    const { resolveRates } = await freshRates();
    const rates = resolveRates();

    expect(rates.standard).toBe(0.004);
    expect(rates.premium).toBe(0.025); // fell back
    expect(rates.basis).toContain('only one rate was configured');
  });

  it('ignores a malformed or negative rate rather than pricing at NaN', async () => {
    process.env.COPILOT_RATE_STANDARD = 'not-a-number';
    process.env.COPILOT_RATE_PREMIUM = '-5';

    const { resolveRates } = await freshRates();
    const rates = resolveRates();

    expect(rates.source).toBe('list_price');
    expect(Number.isFinite(rates.standard)).toBe(true);
    expect(rates.standard).toBe(0.01);
  });
});

describe('costOf', () => {
  it('prices the premium meter higher than the standard one', async () => {
    const { resolveRates, costOf } = await freshRates();
    const rates = resolveRates();

    expect(costOf(1000, null, rates)).toBe(10);
    expect(costOf(1000, 'premium', rates)).toBe(25);
  });

  it('treats an unknown meter as standard, matching what projections reports', async () => {
    const { resolveRates, costOf } = await freshRates();
    const rates = resolveRates();

    // If this ever changes, src/domain/projections.ts must change with it or the
    // reported meter stops matching the rate actually applied.
    expect(costOf(100, 'something-new', rates)).toBe(costOf(100, null, rates));
  });

  it('costs nothing for no messages', async () => {
    const { resolveRates, costOf } = await freshRates();
    expect(costOf(0, 'premium', resolveRates())).toBe(0);
  });
});
