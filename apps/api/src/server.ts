import { createServer } from "node:http";

import { loadConfig } from "@edy/config";

import { createApp } from "./app.js";
import { createAuditRepository } from "./modules/audit/audit-repository.js";
import { createLogger } from "./platform/logger.js";
import { createPrismaClient } from "./platform/prisma.js";
import { closeHttpServer } from "./platform/graceful-shutdown.js";
import {ensureDeploymentMode,installDiagnosticCatalog} from './modules/diagnostics/catalog.js';

const APP_VERSION = "1.0.1";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);
  const prisma = createPrismaClient(config.DATABASE_URL);
  const audit = createAuditRepository(prisma);

  await prisma.$queryRaw`SELECT 1`;
  await ensureDeploymentMode(prisma,config);
  await installDiagnosticCatalog(prisma);
  await audit.append({
    actorType: "system",
    action: "application.startup",
    resourceType: "application",
    resourceId: "edy-helpdesk-api",
    outcome: "success",
    metadata: { version: APP_VERSION, portfolioDemo: config.PORTFOLIO_DEMO },
  });

  const app = createApp({
    logger,
    webOrigin: config.WEB_ORIGIN,
    jsonLimit: "64kb",
    version: APP_VERSION,
    checkDatabase: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    prisma,
    audit,
    config,
  });
  const server = createServer(app);

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    logger.info({ signal }, "shutdown requested");
    shutdownPromise = (async () => {
      try { await closeHttpServer(server); }
      finally { await prisma.$disconnect(); }
      logger.info({ signal }, "API stopped cleanly");
    })().catch((error: unknown) => {
      logger.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "server shutdown failed");
      process.exitCode = 1;
    });
    return shutdownPromise;
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  server.listen(config.API_PORT, config.API_HOST, () => {
    logger.info(
      { host: config.API_HOST, port: config.API_PORT, portfolioDemo: config.PORTFOLIO_DEMO },
      "API listening",
    );
  });
}

main().catch((error: unknown) => {
  const logger = createLogger("info");
  logger.fatal(
    { errorName: error instanceof Error ? error.name : "UnknownError" },
    "API startup failed",
  );
  process.exitCode = 1;
});
