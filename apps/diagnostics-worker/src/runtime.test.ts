import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "@edy/config";

import { createWorkerRuntime, type WorkerLogger } from "./runtime.js";

const config = loadConfig({
  NODE_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: "3001",
  WEB_ORIGIN: "http://127.0.0.1:5173",
  DATABASE_URL: "file:./test.db",
  LOG_LEVEL: "silent",
  PORTFOLIO_DEMO: "true",
});

function createLogger(): WorkerLogger & {
  info: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  return {
    info: vi.fn(),
    error: vi.fn(),
  };
}

describe("diagnostics worker lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts idle, emits a heartbeat and shuts down cleanly", async () => {
    vi.useFakeTimers();
    const logger = createLogger();
    const runtime = createWorkerRuntime(config, logger, { heartbeatIntervalMs: 1_000 });

    runtime.start();
    expect(runtime.isRunning).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "worker_started", capabilities: [] }),
      expect.stringContaining("diagnostic execution is disabled"),
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "worker_heartbeat",
        state: "idle",
        diagnosticExecutionEnabled: false,
      }),
      "Diagnostics worker heartbeat",
    );

    await runtime.stop("test_complete");
    expect(runtime.isRunning).toBe(false);
    expect(logger.info).toHaveBeenCalledWith(
      { event: "worker_stopped", reason: "test_complete" },
      "Diagnostics worker stopped cleanly",
    );
  });

  it("is idempotent when started or stopped more than once", async () => {
    const logger = createLogger();
    const runtime = createWorkerRuntime(config, logger);

    runtime.start();
    runtime.start();
    await runtime.stop();
    await runtime.stop();

    expect(logger.info).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid heartbeat interval", () => {
    const logger = createLogger();

    expect(() => createWorkerRuntime(config, logger, { heartbeatIntervalMs: 0 })).toThrow(
      RangeError,
    );
  });
});
