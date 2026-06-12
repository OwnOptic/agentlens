/**
 * Minimal test globals declaration for TypeScript type-checking.
 * Allows tsc --noEmit to pass without @types/jest installed.
 * A real test runner (jest/vitest) provides these at runtime.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
declare function beforeEach(fn: () => void | Promise<void>): void;
declare function afterEach(fn: () => void | Promise<void>): void;
declare function beforeAll(fn: () => void | Promise<void>): void;
declare function afterAll(fn: () => void | Promise<void>): void;

interface ExpectChain {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toStrictEqual(expected: unknown): void;
  toBeUndefined(): void;
  toBeDefined(): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeNull(): void;
  toBeGreaterThan(n: number): void;
  toBeGreaterThanOrEqual(n: number): void;
  toBeLessThan(n: number): void;
  toBeLessThanOrEqual(n: number): void;
  toHaveLength(n: number): void;
  toContain(item: unknown): void;
  toMatch(pattern: string | RegExp): void;
  toThrow(pattern?: string | RegExp): void;
  not: ExpectChain;
  resolves: ExpectChain;
  rejects: ExpectChain;
  toMatchObject(obj: Record<string, unknown>): void;
  toHaveBeenCalled(): void;
  toHaveBeenCalledWith(...args: unknown[]): void;
}

declare function expect(value: unknown): ExpectChain;
