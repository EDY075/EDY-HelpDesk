import path from "node:path";

import { loadConfig } from "@edy/config";
import { createSanitizedSqliteBackup } from "../apps/api/src/platform/backup.js";

const config = loadConfig();
if (config.DATABASE_PROVIDER !== "sqlite" || !config.DATABASE_URL.startsWith("file:")) throw new Error("This command currently supports the local SQLite backup procedure only.");
const projectRoot = path.resolve(import.meta.dirname, "..");
const storageRoot = path.join(projectRoot, "storage");
const sourceDatabase = path.resolve(projectRoot, config.DATABASE_URL.slice("file:".length));
const result = await createSanitizedSqliteBackup({ sourceDatabase, allowedStorageRoot: storageRoot, backupRoot: path.join(storageRoot, "backups"), applicationVersion: process.env.npm_package_version ?? "unknown", portfolioDemo: config.PORTFOLIO_DEMO, sessionIdleMinutes: config.SESSION_IDLE_MINUTES, sessionAbsoluteHours: config.SESSION_ABSOLUTE_HOURS });
process.stdout.write(`${JSON.stringify({ status: "created", directory: path.relative(projectRoot, result.directory), counts: result.manifest.counts })}\n`);
