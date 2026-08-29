import { pathToFileURL } from "node:url";

import { ConfigValidationError, loadConfig } from "@edy/config";

import { createWorkerLogger } from "./logger.js";
import { createWorkerRuntime } from "./runtime.js";
import {existsSync} from 'node:fs';
import path from 'node:path';
import {createPrismaClient} from '../../api/src/platform/prisma.js';
import {ensureDeploymentMode,installDiagnosticCatalog} from '../../api/src/modules/diagnostics/catalog.js';
import {checkProcessHost,resolveEngine,verifyScript} from './process-runner.js';
import {createJobLoop} from './processor.js';

export async function bootstrap(environment = process.env): Promise<void> {
  const bootstrapLogger = createWorkerLogger("info");

  try {
    const config = loadConfig(environment);
    const logger = createWorkerLogger(config.LOG_LEVEL);
    let root=process.cwd();while(!existsSync(path.join(root,'prisma','schema.prisma'))){const parent=path.dirname(root);if(parent===root)throw new Error('PROJECT_ROOT_MISSING');root=parent;}
    const db=createPrismaClient(config.DATABASE_URL);
    await ensureDeploymentMode(db,config);
    await installDiagnosticCatalog(db);
    let loop:ReturnType<typeof createJobLoop>|undefined;
    if(!config.PORTFOLIO_DEMO){
      await checkProcessHost(root);await verifyScript(root);
      const engine=await resolveEngine();
      loop=createJobLoop(db,config,root,engine,code=>logger.error({event:'diagnostic_worker_error',code},'Diagnostics worker failed safely'));
    }
    const runtime = createWorkerRuntime(config, logger,{diagnosticExecutionEnabled:!config.PORTFOLIO_DEMO});
    let shutdownStarted = false;

    const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
      if (shutdownStarted) {
        return;
      }
      shutdownStarted = true;
      await loop?.stop();
      await runtime.stop(signal);
      await db.$disconnect();
    };

    process.once("SIGINT", () => {
      void shutdown("SIGINT");
    });
    process.once("SIGTERM", () => {
      void shutdown("SIGTERM");
    });

    runtime.start();
    loop?.start();
  } catch (error) {
    const validationIssueCount =
      error instanceof ConfigValidationError ? error.issues.length : undefined;
    bootstrapLogger.error(
      {
        event: "worker_start_failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
        validationIssueCount,
      },
      "Diagnostics worker failed to start",
    );
    throw error;
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  bootstrap().catch(() => {
    process.exitCode = 1;
  });
}
