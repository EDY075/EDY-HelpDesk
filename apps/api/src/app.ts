import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Logger } from "pino";

import { healthResponseSchema, readyResponseSchema } from "@edy/contracts";
import type { AppConfig } from "@edy/config";

import { errorHandler, notFoundHandler } from "./platform/errors.js";
import { requestContext } from "./platform/request-context.js";
import { requestLogging } from "./platform/request-logging.js";
import type { DatabaseClient } from "./platform/prisma.js";
import type { AppendOnlyAuditRepository } from "./modules/audit/audit-repository.js";
import { createAuthMiddleware, enforceCsrf, enforceOrigin } from "./modules/auth/auth.js";
import { createAuthRouter } from "./modules/auth/auth-routes.js";
import { createServiceDeskRouter } from "./modules/service-desk/service-desk-routes.js";
import { createAssetsRouter } from './modules/inventory-knowledge/assets-routes.js';
import { createKnowledgeRouter } from './modules/inventory-knowledge/knowledge-routes.js';
import { createDiagnosticsRouter } from './modules/diagnostics/routes.js';
import { createSecurityRouter } from './modules/security/security-routes.js';
import { createAnalyticsRouter } from './modules/analytics/routes.js';
import { createIntegrationsRouter } from './modules/integrations/routes.js';

export interface AppDependencies {
  logger: Logger;
  webOrigin: string;
  jsonLimit: string;
  version: string;
  checkDatabase: () => Promise<void>;
  prisma?: DatabaseClient;
  audit?: AppendOnlyAuditRepository;
  config?: AppConfig;
  integrationExportRoot?: string;
}

export function createApp(dependencies: AppDependencies): Express {
  const app = express();

  app.disable("x-powered-by");
  app.disable("trust proxy");
  app.use(requestContext);
  app.use(requestLogging(dependencies.logger));
  app.use(helmet());
  app.use(cors({
    origin: dependencies.webOrigin,
    credentials: true,
    methods: ["GET", "HEAD", "OPTIONS", "POST", "PATCH"],
    allowedHeaders: ["content-type", "x-request-id", "x-correlation-id", "x-csrf-token", "x-idempotency-key"],
  }));
  if (dependencies.prisma && dependencies.config) app.use(enforceOrigin(dependencies.webOrigin));
  app.use(express.json({ limit: dependencies.jsonLimit, strict: true }));
  if (dependencies.prisma && dependencies.config) {
    app.use(createAuthMiddleware(dependencies.prisma, dependencies.config.SESSION_IDLE_MINUTES));
    app.use(enforceCsrf(dependencies.prisma));
    app.use((_req, res, next) => { res.setHeader("cache-control", "no-store"); next(); });
  }

  app.get("/api/v1/health", (_req, res) => {
    const response = healthResponseSchema.parse({
      status: "ok",
      service: "edy-helpdesk-api",
      version: dependencies.version,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Number(process.uptime().toFixed(3)),
    });
    res.status(200).json(response);
  });

  app.get("/api/v1/ready", async (req, res) => {
    try {
      await dependencies.checkDatabase();
      const response = readyResponseSchema.parse({
        status: "ready",
        service: "edy-helpdesk-api",
        timestamp: new Date().toISOString(),
        checks: {
          configuration: { status: "ok" },
          database: { status: "ok" },
        },
      });
      res.status(200).json(response);
    } catch (error: unknown) {
      dependencies.logger.error(
        {
          requestId: req.requestId,
          correlationId: req.correlationId,
          errorName: error instanceof Error ? error.name : "UnknownError",
        },
        "readiness database check failed",
      );
      const response = readyResponseSchema.parse({
        status: "not_ready",
        service: "edy-helpdesk-api",
        timestamp: new Date().toISOString(),
        checks: {
          configuration: { status: "ok" },
          database: { status: "error", message: "Database is unavailable." },
        },
      });
      res.status(503).json(response);
    }
  });

  if (dependencies.prisma && dependencies.audit && dependencies.config) {
    app.use("/api/v1/auth", createAuthRouter(dependencies.prisma, dependencies.audit, dependencies.config));
    app.use("/api/v1", createServiceDeskRouter(dependencies.prisma, dependencies.audit));
    app.use('/api/v1', createAssetsRouter(dependencies.prisma, dependencies.audit));
    app.use('/api/v1', createKnowledgeRouter(dependencies.prisma, dependencies.audit));
    app.use('/api/v1', createDiagnosticsRouter(dependencies.prisma, dependencies.audit, dependencies.config));
    app.use('/api/v1', createSecurityRouter(dependencies.prisma, dependencies.audit, dependencies.config));
    app.use('/api/v1', createAnalyticsRouter(dependencies.prisma, dependencies.audit));
    app.use('/api/v1', createIntegrationsRouter(dependencies.prisma, dependencies.audit, dependencies.config, dependencies.version, dependencies.integrationExportRoot));
  }

  app.use(notFoundHandler);
  app.use(errorHandler(dependencies.logger));

  return app;
}
