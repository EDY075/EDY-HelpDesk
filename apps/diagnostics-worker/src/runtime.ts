import type { AppConfig } from "@edy/config";

export interface WorkerLogger {
  info(bindings: Record<string, unknown>, message: string): void;
  error(bindings: Record<string, unknown>, message: string): void;
}

export interface WorkerRuntimeOptions {
  heartbeatIntervalMs?: number;
  diagnosticExecutionEnabled?: boolean;
}

export interface WorkerRuntime {
  readonly isRunning: boolean;
  start(): void;
  stop(reason?: string): Promise<void>;
}

const defaultHeartbeatIntervalMs = 30_000;

/**
 * Lifecycle/heartbeat only. The separate Phase 4 job loop owns execution.
 */
export function createWorkerRuntime(
  config: AppConfig,
  logger: WorkerLogger,
  options: WorkerRuntimeOptions = {},
): WorkerRuntime {
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? defaultHeartbeatIntervalMs;
  let heartbeat: NodeJS.Timeout | undefined;

  if (!Number.isInteger(heartbeatIntervalMs) || heartbeatIntervalMs < 1) {
    throw new RangeError("heartbeatIntervalMs must be a positive integer");
  }

  return {
    get isRunning() {
      return heartbeat !== undefined;
    },

    start() {
      if (heartbeat) {
        return;
      }

      logger.info(
        {
          event: "worker_started",
          mode: config.PORTFOLIO_DEMO ? "portfolio_demo" : "local_operational",
          capabilities: options.diagnosticExecutionEnabled ? ['local-read-only-catalog'] : [],
        },
        options.diagnosticExecutionEnabled ? 'Diagnostics worker started with local read-only catalog' : "Diagnostics worker lifecycle started; diagnostic execution is disabled in Portfolio Demo",
      );

      heartbeat = setInterval(() => {
        logger.info(
          {
            event: "worker_heartbeat",
            state: "idle",
            diagnosticExecutionEnabled: options.diagnosticExecutionEnabled ?? false,
          },
          "Diagnostics worker heartbeat",
        );
      }, heartbeatIntervalMs);
    },

    async stop(reason = "requested"): Promise<void> {
      if (!heartbeat) {
        return;
      }

      clearInterval(heartbeat);
      heartbeat = undefined;
      logger.info(
        { event: "worker_stopped", reason },
        "Diagnostics worker stopped cleanly",
      );
    },
  };
}
