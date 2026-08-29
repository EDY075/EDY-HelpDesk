import { siemEnvelopeSchema } from "@edy/contracts";
import type { DatabaseClient } from "../../platform/prisma.js";
import { IntegrationDeliveryError, type IntegrationPort } from "./http-port.js";

export const safeIntegrationError = (error: unknown): string =>
  error instanceof IntegrationDeliveryError ? error.code : "unavailable";

export async function dispatchNextOutboxEvent(options: {
  db: DatabaseClient;
  port: IntegrationPort;
  now?: Date;
  maxAttempts: number;
  backoffBaseMs: number;
}): Promise<"idle" | "processed" | "retry" | "dead-letter"> {
  const now = options.now ?? new Date();
  const candidate = await options.db.integrationOutbox.findFirst({
    where: { status: { in: ["Pending", "Failed"] }, availableAt: { lte: now }, eventType: { startsWith: "security.case." } },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
  });
  if (!candidate) return "idle";
  const claimed = await options.db.integrationOutbox.updateMany({
    where: { id: candidate.id, status: candidate.status, attempts: candidate.attempts, availableAt: { lte: now } },
    data: { attempts: { increment: 1 }, availableAt: new Date(now.getTime() + 60_000) },
  });
  if (claimed.count !== 1) return "idle";
  const attempt = candidate.attempts + 1;
  try {
    const parsed = siemEnvelopeSchema.safeParse({
      eventId: candidate.eventId,
      eventType: candidate.eventType,
      schemaVersion: candidate.schemaVersion,
      occurredAt: candidate.occurredAt.toISOString(),
      source: candidate.source,
      correlationId: candidate.correlationId,
      idempotencyKey: candidate.idempotencyKey,
      payload: candidate.payload,
    });
    if (!parsed.success) throw new IntegrationDeliveryError("contract_mismatch", false);
    const payload = parsed.data;
    await options.port.deliver({ idempotencyKey: candidate.idempotencyKey, correlationId: candidate.correlationId, payload });
    await options.db.integrationOutbox.update({ where: { id: candidate.id }, data: { status: "Processed", processedAt: new Date(), lastError: null } });
    return "processed";
  } catch (error) {
    const retryable = !(error instanceof IntegrationDeliveryError) || error.retryable;
    const deadLetter = !retryable || attempt >= options.maxAttempts;
    const backoff = Math.min(options.backoffBaseMs * 2 ** Math.max(0, attempt - 1), 15 * 60_000);
    await options.db.integrationOutbox.update({
      where: { id: candidate.id },
      data: { status: deadLetter ? "DeadLetter" : "Failed", availableAt: new Date(now.getTime() + backoff), lastError: safeIntegrationError(error) },
    });
    return deadLetter ? "dead-letter" : "retry";
  }
}

export function createOutboxDispatcherLoop(options: {
  db: DatabaseClient;
  port: IntegrationPort;
  maxAttempts: number;
  backoffBaseMs: number;
  intervalMs?: number;
  onError?: (code: string) => void;
}) {
  let stopped = false;
  let active: Promise<unknown> | undefined;
  const tick = () => {
    if (stopped || active) return;
    active = dispatchNextOutboxEvent(options).catch((error: unknown) => options.onError?.(safeIntegrationError(error))).finally(() => { active = undefined; });
  };
  const timer = setInterval(tick, options.intervalMs ?? 2_000);
  timer.unref();
  tick();
  return Object.freeze({
    async stop() {
      stopped = true;
      clearInterval(timer);
      await active;
    },
  });
}
