/**
 * Opaque-Box E2E Test Harness for Dental Finance
 * 
 * Provides an isolated, deterministic execution environment with:
 * - In-memory Storage polyfill (localStorage)
 * - Rich assertion engine with descriptive failure diagnostics
 * - Tier & Requirement tracking (R1 to R8, Tiers 1 to 4)
 * - Structured defect escalation logging
 */

export type RequirementId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9' | 'R10' | 'R11' | 'R12' | 'R13' | 'R14' | 'R15' | 'R16' | 'R17';
export type TestTier = 1 | 2 | 3 | 4;

export interface TestCaseMetadata {
  name: string;
  suite: string;
  tier: TestTier;
  requirement?: RequirementId;
  fn: () => void | Promise<void>;
}

export interface TestResult {
  name: string;
  suite: string;
  tier: TestTier;
  requirement?: RequirementId;
  passed: boolean;
  durationMs: number;
  error?: Error;
  escalationNote?: string;
}

export interface TestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  byTier: Record<TestTier, { total: number; passed: number; failed: number }>;
  byRequirement: Record<RequirementId, { total: number; passed: number; failed: number }>;
  results: TestResult[];
}

// In-Memory Storage Polyfill for localStorage
export class MockLocalStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

// Global environment setup for Node/tsx
if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = new MockLocalStorage();
}

// Global registry of tests
const registeredSuites: { name: string; tier: TestTier; tests: TestCaseMetadata[] }[] = [];
let currentSuite: { name: string; tier: TestTier; tests: TestCaseMetadata[] } | null = null;

export function describe(suiteName: string, tier: TestTier, fn: () => void) {
  const previousSuite = currentSuite;
  const newSuite = { name: suiteName, tier, tests: [] };
  registeredSuites.push(newSuite);
  currentSuite = newSuite;
  try {
    fn();
  } finally {
    currentSuite = previousSuite;
  }
}

export function test(
  name: string,
  fn: () => void | Promise<void>,
  options?: { requirement?: RequirementId }
) {
  if (!currentSuite) {
    throw new Error(`Test "${name}" must be declared inside a describe() block.`);
  }
  currentSuite.tests.push({
    name,
    suite: currentSuite.name,
    tier: currentSuite.tier,
    requirement: options?.requirement,
    fn,
  });
}

export const it = test;

// Assertion Engine
class Expectation<T> {
  private isNot = false;

  constructor(private actual: T) {}

  get not(): Expectation<T> {
    const inverted = new Expectation<T>(this.actual);
    inverted.isNot = !this.isNot;
    return inverted;
  }

  toBe(expected: any): void {
    const pass = Object.is(this.actual, expected);
    if (this.isNot ? pass : !pass) {
      throw new Error(
        `Expected ${JSON.stringify(this.actual)} ${this.isNot ? 'NOT to be' : 'to be'} ${JSON.stringify(expected)}`
      );
    }
  }

  toEqual(expected: any): void {
    const actualStr = JSON.stringify(this.actual);
    const expectedStr = JSON.stringify(expected);
    const pass = actualStr === expectedStr;
    if (this.isNot ? pass : !pass) {
      throw new Error(
        `Expected ${actualStr} ${this.isNot ? 'NOT to equal' : 'to equal'} ${expectedStr}`
      );
    }
  }

  toBeCloseTo(expected: number, precision = 2): void {
    const diff = Math.abs((this.actual as unknown as number) - expected);
    const tolerance = Math.pow(10, -precision) / 2;
    const pass = diff < tolerance;
    if (this.isNot ? pass : !pass) {
      throw new Error(
        `Expected ${this.actual} ${this.isNot ? 'NOT to be close to' : 'to be close to'} ${expected} (diff: ${diff}, tolerance: ${tolerance})`
      );
    }
  }

  toBeTruthy(): void {
    const pass = Boolean(this.actual);
    if (this.isNot ? pass : !pass) {
      throw new Error(
        `Expected ${JSON.stringify(this.actual)} ${this.isNot ? 'to be falsy' : 'to be truthy'}`
      );
    }
  }

  toBeFalsy(): void {
    const pass = !this.actual;
    if (this.isNot ? pass : !pass) {
      throw new Error(
        `Expected ${JSON.stringify(this.actual)} ${this.isNot ? 'to be truthy' : 'to be falsy'}`
      );
    }
  }

  toBeNull(): void {
    this.toBe(null);
  }

  toBeUndefined(): void {
    this.toBe(undefined);
  }

  toBeDefined(): void {
    const pass = this.actual !== undefined;
    if (this.isNot ? pass : !pass) {
      throw new Error(
        `Expected value ${this.isNot ? 'to be undefined' : 'to be defined'}`
      );
    }
  }

  toContain(item: any): void {
    let pass = false;
    if (typeof this.actual === 'string') {
      pass = this.actual.includes(String(item));
    } else if (Array.isArray(this.actual)) {
      pass = this.actual.includes(item) || this.actual.some(x => JSON.stringify(x) === JSON.stringify(item));
    } else if (this.actual instanceof Set) {
      pass = this.actual.has(item);
    }
    if (this.isNot ? pass : !pass) {
      throw new Error(
        `Expected ${JSON.stringify(this.actual)} ${this.isNot ? 'NOT to contain' : 'to contain'} ${JSON.stringify(item)}`
      );
    }
  }

  toBeGreaterThan(expected: number): void {
    const pass = (this.actual as unknown as number) > expected;
    if (this.isNot ? pass : !pass) {
      throw new Error(
        `Expected ${this.actual} ${this.isNot ? 'to be <= ' : 'to be > '} ${expected}`
      );
    }
  }

  toBeGreaterThanOrEqual(expected: number): void {
    const pass = (this.actual as unknown as number) >= expected;
    if (this.isNot ? pass : !pass) {
      throw new Error(
        `Expected ${this.actual} ${this.isNot ? 'to be < ' : 'to be >= '} ${expected}`
      );
    }
  }

  toBeLessThan(expected: number): void {
    const pass = (this.actual as unknown as number) < expected;
    if (this.isNot ? pass : !pass) {
      throw new Error(
        `Expected ${this.actual} ${this.isNot ? 'to be >= ' : 'to be < '} ${expected}`
      );
    }
  }

  toBeLessThanOrEqual(expected: number): void {
    const pass = (this.actual as unknown as number) <= expected;
    if (this.isNot ? pass : !pass) {
      throw new Error(
        `Expected ${this.actual} ${this.isNot ? 'to be > ' : 'to be <= '} ${expected}`
      );
    }
  }

  toMatch(pattern: RegExp | string): void {
    const str = String(this.actual);
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const pass = regex.test(str);
    if (this.isNot ? pass : !pass) {
      throw new Error(
        `Expected "${str}" ${this.isNot ? 'NOT to match' : 'to match'} pattern ${regex}`
      );
    }
  }

  toThrow(expectedError?: string | RegExp): void {
    if (typeof this.actual !== 'function') {
      throw new Error(`toThrow() must be called on a function, got ${typeof this.actual}`);
    }

    let threw = false;
    let thrownError: any = null;

    try {
      (this.actual as Function)();
    } catch (err) {
      threw = true;
      thrownError = err;
    }

    if (!threw && !this.isNot) {
      throw new Error('Expected function to throw, but it returned normally');
    }

    if (threw && this.isNot) {
      throw new Error(`Expected function NOT to throw, but it threw: ${thrownError?.message || thrownError}`);
    }

    if (threw && expectedError) {
      const msg = thrownError?.message || String(thrownError);
      if (typeof expectedError === 'string' && !msg.includes(expectedError)) {
        throw new Error(`Expected error message to contain "${expectedError}", but got: "${msg}"`);
      } else if (expectedError instanceof RegExp && !expectedError.test(msg)) {
        throw new Error(`Expected error message to match ${expectedError}, but got: "${msg}"`);
      }
    }
  }
}

export function expect<T>(actual: T): Expectation<T> {
  return new Expectation(actual);
}

// Test Suite Runner
export async function runAllTests(): Promise<TestSuiteSummary> {
  const startTime = Date.now();
  const results: TestResult[] = [];

  const summary: TestSuiteSummary = {
    total: 0,
    passed: 0,
    failed: 0,
    durationMs: 0,
    byTier: {
      1: { total: 0, passed: 0, failed: 0 },
      2: { total: 0, passed: 0, failed: 0 },
      3: { total: 0, passed: 0, failed: 0 },
      4: { total: 0, passed: 0, failed: 0 },
    },
    byRequirement: {
      R1: { total: 0, passed: 0, failed: 0 },
      R2: { total: 0, passed: 0, failed: 0 },
      R3: { total: 0, passed: 0, failed: 0 },
      R4: { total: 0, passed: 0, failed: 0 },
      R5: { total: 0, passed: 0, failed: 0 },
      R6: { total: 0, passed: 0, failed: 0 },
      R7: { total: 0, passed: 0, failed: 0 },
      R8: { total: 0, passed: 0, failed: 0 },
      R9: { total: 0, passed: 0, failed: 0 },
      R10: { total: 0, passed: 0, failed: 0 },
      R11: { total: 0, passed: 0, failed: 0 },
      R12: { total: 0, passed: 0, failed: 0 },
      R13: { total: 0, passed: 0, failed: 0 },
      R14: { total: 0, passed: 0, failed: 0 },
      R15: { total: 0, passed: 0, failed: 0 },
      R16: { total: 0, passed: 0, failed: 0 },
      R17: { total: 0, passed: 0, failed: 0 },
    },
    results,
  };

  for (const suite of registeredSuites) {
    for (const testCase of suite.tests) {
      summary.total++;
      summary.byTier[testCase.tier].total++;
      if (testCase.requirement) {
        if (!summary.byRequirement[testCase.requirement]) {
          summary.byRequirement[testCase.requirement] = { total: 0, passed: 0, failed: 0 };
        }
        summary.byRequirement[testCase.requirement].total++;
      }

      const testStart = Date.now();
      let passed = false;
      let error: Error | undefined;

      try {
        await testCase.fn();
        passed = true;
        summary.passed++;
        summary.byTier[testCase.tier].passed++;
        if (testCase.requirement) {
          summary.byRequirement[testCase.requirement].passed++;
        }
      } catch (err: any) {
        passed = false;
        error = err instanceof Error ? err : new Error(String(err));
        summary.failed++;
        summary.byTier[testCase.tier].failed++;
        if (testCase.requirement) {
          summary.byRequirement[testCase.requirement].failed++;
        }
      }

      results.push({
        name: testCase.name,
        suite: testCase.suite,
        tier: testCase.tier,
        requirement: testCase.requirement,
        passed,
        durationMs: Date.now() - testStart,
        error,
      });
    }
  }

  summary.durationMs = Date.now() - startTime;
  return summary;
}
