import { describe, expect, it } from "vitest";

import {
  healthResponseSchema,
  problemDetailsSchema,
  readyResponseSchema,
} from "./index.js";

const requestId = "016955a4-e66c-4ad6-ba25-4917515c6fbb";
const correlationId = "1828f74c-2d8b-4b2f-bcbe-f74a0b38963c";

describe("shared HTTP contracts", () => {
  it("accepts a real health response shape", () => {
    expect(
      healthResponseSchema.parse({
        status: "ok",
        service: "edy-helpdesk-api",
        version: "0.1.0-foundation",
        timestamp: "2026-08-28T15:00:00.000Z",
        uptimeSeconds: 12.5,
      }),
    ).toBeDefined();
  });

  it("represents a database readiness failure without claiming ready", () => {
    expect(
      readyResponseSchema.parse({
        status: "not_ready",
        service: "edy-helpdesk-api",
        timestamp: "2026-08-28T15:00:00.000Z",
        checks: {
          configuration: { status: "ok" },
          database: { status: "error", message: "Database is unavailable" },
        },
      }).status,
    ).toBe("not_ready");
  });

  it("requires UUID request context in Problem Details", () => {
    expect(
      problemDetailsSchema.safeParse({
        type: "about:blank",
        title: "Not Found",
        status: 404,
        detail: "The requested resource was not found",
        requestId,
        correlationId,
      }).success,
    ).toBe(true);

    expect(
      problemDetailsSchema.safeParse({
        type: "about:blank",
        title: "Not Found",
        status: 404,
        detail: "The requested resource was not found",
        requestId: "not-a-uuid",
        correlationId,
      }).success,
    ).toBe(false);
  });
});
