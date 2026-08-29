import { createServer } from "node:http";
import { describe, expect, it } from "vitest";

import { closeHttpServer } from "./graceful-shutdown.js";

describe("Phase 7 graceful shutdown", () => {
  it("is safe before the server starts", async () => {
    const server = createServer();
    await expect(closeHttpServer(server, 100)).resolves.toBeUndefined();
  });

  it("stops a listening server without leaving its socket open", async () => {
    const server = createServer((_request, response) => response.end("ok"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    await closeHttpServer(server, 1_000);
    expect(server.listening).toBe(false);
  });
});
