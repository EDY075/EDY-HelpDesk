import { Writable } from "node:stream";

import type { NextFunction, Request, Response } from "express";
import pino from "pino";
import { describe, expect, it } from "vitest";

import { errorHandler } from "./errors.js";

describe("error handling", () => {
  it("does not write internal error messages to responses or operational logs", async () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const logger = pino({ level: "error" }, destination);
    let responseBody: unknown;
    const response = {
      headersSent: false,
      status() { return this; },
      type() { return this; },
      json(value: unknown) { responseBody = value; return this; },
    } as unknown as Response;
    const request = {
      originalUrl: "/api/v1/example",
      requestId: "018f47a8-47ea-7cc2-a59f-3a5b437926d8",
      correlationId: "53f8d33b-5fd3-4a99-b5eb-704fb82d04d7",
    } as Request;
    const internalMessage = "sensitive-driver-detail::private-value";

    errorHandler(logger)(new Error(internalMessage), request, response, (() => undefined) as NextFunction);
    const finished = new Promise((resolve) => destination.once("finish", resolve));
    destination.end();
    await finished;

    expect(responseBody).toMatchObject({ status: 500, detail: "An unexpected error occurred." });
    expect(lines.join("")).not.toContain(internalMessage);
    expect(lines.join("")).not.toContain("private-value");
  });
});
