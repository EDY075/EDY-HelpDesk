export type TestEnvironment = Record<string, string | undefined>;

const baseTestEnvironment: Readonly<TestEnvironment> = Object.freeze({
  NODE_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: "3001",
  WEB_ORIGIN: "http://127.0.0.1:5173",
  DATABASE_URL: "file:./test.db",
  LOG_LEVEL: "silent",
  PORTFOLIO_DEMO: "true",
});

export function createTestEnvironment(overrides: TestEnvironment = {}): TestEnvironment {
  return { ...baseTestEnvironment, ...overrides };
}

export interface FixedClock {
  now(): Date;
}

export function createFixedClock(isoTimestamp = "2026-08-28T15:00:00.000Z"): FixedClock {
  const instant = new Date(isoTimestamp);

  if (Number.isNaN(instant.valueOf())) {
    throw new TypeError("A fixed clock requires a valid ISO timestamp");
  }

  return {
    now: () => new Date(instant.valueOf()),
  };
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"];
  let reject!: Deferred<T>["reject"];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}
