import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createJsonHttpPort } from "./http-port.js";
import type { IntegrationDeliveryError } from "./http-port.js";

const delivery = {
  idempotencyKey: "synthetic-delivery-1",
  correlationId: "10000000-0000-4000-8000-000000000001",
  payload: { schemaVersion: 1 },
};
const responseSchema = z.object({ accepted: z.literal(true) }).strict();

describe("Phase 7 JSON integration port", () => {
  it("sends only the approved request with correlation and idempotency", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 202 }));
    const port = createJsonHttpPort({ origin: "http://127.0.0.1:8090", path: "/api/v1/helpdesk/events", token: "synthetic-token", timeoutMs: 1_000, responseSchema, fetchImpl });

    await port.deliver(delivery);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, options] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("http://127.0.0.1:8090/api/v1/helpdesk/events");
    expect(options?.headers).toMatchObject({ "idempotency-key": delivery.idempotencyKey, "x-correlation-id": delivery.correlationId });
  });

  it("classifies timeout as retryable without leaking a raw error", async () => {
    const fetchImpl: typeof fetch = (_input, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("private timeout detail"), { name: "AbortError" })));
    });
    const port = createJsonHttpPort({ origin: "http://127.0.0.1:8090", path: "/api/v1/events", token: "synthetic-token", timeoutMs: 5, responseSchema, fetchImpl });

    await expect(port.deliver(delivery)).rejects.toMatchObject({ code: "timeout", retryable: true, message: "timeout" });
  });

  it("retries service failures but dead-letters invalid contracts", async () => {
    const unavailable = createJsonHttpPort({ origin: "http://127.0.0.1:8090", path: "/api/v1/events", token: "synthetic-token", timeoutMs: 1_000, responseSchema, fetchImpl: async () => new Response("{}", { status: 503 }) });
    const invalid = createJsonHttpPort({ origin: "http://127.0.0.1:8090", path: "/api/v1/events", token: "synthetic-token", timeoutMs: 1_000, responseSchema, fetchImpl: async () => new Response(JSON.stringify({ accepted: false }), { status: 200 }) });

    await expect(unavailable.deliver(delivery)).rejects.toEqual(expect.objectContaining<Partial<IntegrationDeliveryError>>({ code: "unavailable", retryable: true }));
    await expect(invalid.deliver(delivery)).rejects.toEqual(expect.objectContaining<Partial<IntegrationDeliveryError>>({ code: "contract_mismatch", retryable: false }));
  });
});
