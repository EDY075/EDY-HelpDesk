import path from "node:path";

import { restoreAndValidateSqliteBackup } from "../apps/api/src/platform/backup.js";

const backupArgument = process.argv[2];
const destinationArgument = process.argv[3];
if (!backupArgument || !destinationArgument) throw new Error("Usage: npm run restore:validate -- <backup-directory> <new-destination.db>");
const projectRoot = path.resolve(import.meta.dirname, "..");
const storageRoot = path.join(projectRoot, "storage");
const result = await restoreAndValidateSqliteBackup({ backupDirectory: path.resolve(projectRoot, backupArgument), destinationDatabase: path.resolve(projectRoot, destinationArgument), allowedStorageRoot: storageRoot });
process.stdout.write(`${JSON.stringify({ status: "validated", destination: path.relative(projectRoot, result.destinationDatabase), counts: result.counts })}\n`);
