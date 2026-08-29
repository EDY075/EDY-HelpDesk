import type { z } from "zod";

export type IntegrationErrorCode = "timeout" | "unavailable" | "invalid_response" | "contract_mismatch" | "configuration";

export class IntegrationDeliveryError extends Error {
  constructor(readonly code: IntegrationErrorCode, readonly retryable: boolean) {
    super(code);
    this.name = "IntegrationDeliveryError";
  }
}

export interface IntegrationDelivery {
  idempotencyKey: string;
  correlationId: string;
  payload: unknown;
}

export interface IntegrationPort {
  deliver(delivery: IntegrationDelivery): Promise<void>;
}

export function createJsonHttpPort<T>(options: {
  origin: string;
  path: `/${string}`;
  token: string;
  timeoutMs: number;
  responseSchema: z.ZodType<T>;
  fetchImpl?: typeof fetch;
}): IntegrationPort {
  const endpoint = new URL(options.path, options.origin);
  const fetchImpl = options.fetchImpl ?? fetch;
  return Object.freeze({
    async deliver(delivery: IntegrationDelivery): Promise<void> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
      timeout.unref?.();
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.token}`,
            "content-type": "application/json",
            "idempotency-key": delivery.idempotencyKey,
            "x-correlation-id": delivery.correlationId,
          },
          body: JSON.stringify(delivery.payload),
          signal: controller.signal,
          redirect: "error",
        });
        if (!response.ok) {
          const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
          throw new IntegrationDeliveryError("unavailable", retryable);
        }
        const body = await response.text();
        if (Buffer.byteLength(body, "utf8") > 64 * 1024) throw new IntegrationDeliveryError("invalid_response", false);
        let decoded: unknown;
        try { decoded = JSON.parse(body); } catch { throw new IntegrationDeliveryError("invalid_response", false); }
        if (!options.responseSchema.safeParse(decoded).success) throw new IntegrationDeliveryError("contract_mismatch", false);
      } catch (error) {
        if (error instanceof IntegrationDeliveryError) throw error;
        if (error instanceof Error && error.name === "AbortError") throw new IntegrationDeliveryError("timeout", true);
        throw new IntegrationDeliveryError("unavailable", true);
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}
