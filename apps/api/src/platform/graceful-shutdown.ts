import type { Server } from "node:http";

export async function closeHttpServer(server: Server, timeoutMs = 10_000): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (error) reject(error); else resolve();
    };
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      finish(new Error("HTTP_SHUTDOWN_TIMEOUT"));
    }, timeoutMs);
    deadline.unref();
    server.closeIdleConnections();
    server.close((error) => finish(error));
  });
}
