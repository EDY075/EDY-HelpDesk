import { Writable } from "node:stream";

import pino from "pino";
import { describe, expect, it } from "vitest";

import { createLogger } from "./logger.js";

describe("structured logger", () => {
  it("constructs successfully and redacts sensitive headers", async () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const logger = pino(
      {
        level: "info",
        redact: {
          paths: ["req.headers.authorization", "req.headers.cookie", "req.headers['x-api-key']"],
          censor: "[REDACTED]",
        },
      },
      destination,
    );

    logger.info({ req: { headers: { authorization: "secret", cookie: "session", "x-api-key": "key" } } });
    const finished = new Promise((resolve) => destination.once("finish", resolve));
    destination.end();
    await finished;

    expect(lines.join("")).not.toContain("secret");
    expect(lines.join("")).not.toContain("session");
    expect(lines.join("")).not.toContain('"key"');
    expect(lines.join("")).toContain("[REDACTED]");
    expect(() => createLogger("silent")).not.toThrow();
  });
});
