import pino from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "./app.js";

const logger = pino({ enabled: false });

function app(checkDatabase: () => Promise<void> = async () => undefined) {
  return createApp({
    logger,
    webOrigin: "http://127.0.0.1:5173",
    jsonLimit: "1kb",
    version: "test",
    checkDatabase,
  });
}

describe("API foundation", () => {
  it("reports process health with a real uptime", async () => {
    const response = await request(app()).get("/api/v1/health").expect(200);

    expect(response.body).toMatchObject({
      status: "ok",
      service: "edy-helpdesk-api",
      version: "test",
    });
    expect(response.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
    expect(response.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(response.headers["content-security-policy"]).not.toContain("unsafe-eval");
  });

  it("reports readiness only after the database check succeeds", async () => {
    let checked = false;
    const response = await request(app(async () => { checked = true; }))
      .get("/api/v1/ready")
      .expect(200);

    expect(checked).toBe(true);
    expect(response.body).toMatchObject({
      status: "ready",
      checks: { configuration: { status: "ok" }, database: { status: "ok" } },
    });
  });

  it("returns 503 when the database is unavailable", async () => {
    const response = await request(app(async () => { throw new Error("sensitive internal error"); }))
      .get("/api/v1/ready")
      .expect(503);

    expect(response.body.checks.database).toEqual({
      status: "error",
      message: "Database is unavailable.",
    });
    expect(JSON.stringify(response.body)).not.toContain("sensitive internal error");
  });

  it("returns sanitized Problem Details for unknown routes", async () => {
    const response = await request(app()).get("/api/v1/missing").expect(404);

    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.body).toMatchObject({
      type: "about:blank",
      title: "Not Found",
      status: 404,
      instance: "/api/v1/missing",
    });
    expect(response.body).not.toHaveProperty("stack");
  });

  it("preserves valid request and correlation IDs", async () => {
    const requestId = "018f47a8-47ea-7cc2-a59f-3a5b437926d8";
    const correlationId = "53f8d33b-5fd3-4a99-b5eb-704fb82d04d7";
    const response = await request(app())
      .get("/api/v1/health")
      .set("x-request-id", requestId)
      .set("x-correlation-id", correlationId)
      .expect(200);

    expect(response.headers["x-request-id"]).toBe(requestId);
    expect(response.headers["x-correlation-id"]).toBe(correlationId);
  });

  it("replaces malformed context IDs with UUIDs", async () => {
    const response = await request(app())
      .get("/api/v1/health")
      .set("x-request-id", "not-a-uuid")
      .set("x-correlation-id", "also-invalid")
      .expect(200);

    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(response.headers["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("rejects invalid JSON without exposing parser details", async () => {
    const response = await request(app())
      .post("/api/v1/health")
      .set("content-type", "application/json")
      .send('{"broken":')
      .expect(400);

    expect(response.body.detail).toBe("The request body contains invalid JSON.");
    expect(response.body).not.toHaveProperty("stack");
  });

  it("rejects JSON payloads above the configured limit", async () => {
    const response = await request(app())
      .post("/api/v1/health")
      .send({ value: "x".repeat(2_000) })
      .expect(413);

    expect(response.body.detail).toBe("The request body exceeds the configured limit.");
    expect(response.body).not.toHaveProperty("stack");
  });
});
