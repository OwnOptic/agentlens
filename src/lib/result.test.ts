import { describe, it, expect } from 'vitest';
import { ok, partial, notConnected, failed, toMcpContent } from './result.js';

/**
 * This is the contract every tool speaks. If these helpers ever produced a
 * `data` field alongside `not_connected`, or omitted `sources`, every honesty
 * guarantee downstream would be unenforceable.
 */

describe('ok', () => {
  it('carries data and no error', () => {
    const r = ok('summary', { n: 1 }, [{ source: 'Azure Resource Graph', status: 'connected' }]);
    expect(r.status).toBe('ok');
    expect(r.data).toEqual({ n: 1 });
    expect(r.error).toBeUndefined();
  });
});

describe('partial', () => {
  it('carries data alongside a remediation for what was missed', () => {
    const r = partial('summary', { n: 1 }, [], 'fix this');
    expect(r.status).toBe('partial');
    expect(r.data).toEqual({ n: 1 });
    expect(r.remediation).toBe('fix this');
  });
});

describe('notConnected', () => {
  it('never carries a data field', () => {
    const r = notConnected('summary', [{ source: 'Dataverse', status: 'not_connected' }], 'fix this');
    expect(r.status).toBe('not_connected');
    expect('data' in r).toBe(false);
    expect(r.remediation).toBe('fix this');
  });
});

describe('failed', () => {
  it('extracts a message from an Error without leaking the stack', () => {
    const r = failed('summary', new Error('boom'));
    expect(r.status).toBe('error');
    expect(r.error).toBe('boom');
  });

  it('stringifies a non-Error throw rather than losing it', () => {
    const r = failed('summary', 'a plain string reason');
    expect(r.error).toBe('a plain string reason');
  });

  it('defaults sources to empty rather than throwing on the omission', () => {
    const r = failed('summary', new Error('boom'));
    expect(r.sources).toEqual([]);
  });
});

describe('toMcpContent', () => {
  it('marks isError only for status error', () => {
    expect(toMcpContent(ok('s', {}, [])).isError).toBe(false);
    expect(toMcpContent(notConnected('s', [], 'fix')).isError).toBe(false);
    expect(toMcpContent(failed('s', new Error('x'))).isError).toBe(true);
  });

  it('round-trips the full result as JSON text, not a summary or a truncation', () => {
    const result = ok('summary', { detail: 'x' }, [{ source: 'Dataverse', status: 'connected' }]);
    const content = toMcpContent(result);
    const parsed = JSON.parse(content.content[0]!.text);
    expect(parsed).toEqual(result);
  });
});
