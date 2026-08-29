import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import Database from "better-sqlite3";
import { z } from "zod";

const countSchema = z.record(z.string(), z.number().int().nonnegative());
const manifestSchema = z.object({
  formatVersion: z.literal(1),
  applicationVersion: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  databaseProvider: z.literal("sqlite"),
  databaseFile: z.literal("database.db"),
  databaseSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  counts: countSchema,
  sanitization: z.array(z.string().min(1)),
  configuration: z.object({ portfolioDemo: z.boolean(), sessionIdleMinutes: z.number().int().positive(), sessionAbsoluteHours: z.number().int().positive() }).strict(),
}).strict();

export type BackupManifest = z.infer<typeof manifestSchema>;

const criticalTables = ["Account", "User", "Department", "TicketCategory", "Ticket", "TicketSla", "Asset", "KnowledgeArticle", "SecurityCase", "IntegrationOutbox", "AuditEvent", "DiagnosticJob", "DiagnosticResult"] as const;

function assertWithin(root: string, target: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(target);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("BACKUP_PATH_OUTSIDE_ALLOWED_ROOT");
  return resolved;
}

function hash(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function counts(database: Database.Database): Record<string, number> {
  return Object.fromEntries(criticalTables.map((table) => [table, (database.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as { count: number }).count]));
}

function validateDatabase(database: Database.Database): void {
  const integrity = (database.pragma("integrity_check") as Array<{ integrity_check: string }>).map((row) => row.integrity_check);
  if (integrity.length !== 1 || integrity[0] !== "ok") throw new Error("BACKUP_INTEGRITY_FAILED");
  if ((database.pragma("foreign_key_check") as unknown[]).length > 0) throw new Error("BACKUP_FOREIGN_KEY_FAILED");
}

function sanitizeDatabase(database: Database.Database): void {
  database.pragma("foreign_keys = ON");
  database.transaction(() => {
    database.prepare('DELETE FROM "Session"').run();
    database.prepare('DELETE FROM "DiagnosticWorkerState"').run();
    database.prepare('DELETE FROM "LocalEndpoint"').run();
    database.prepare('DELETE FROM "WindowsEvent"').run();
    database.prepare('UPDATE "DiagnosticResult" SET "payload" = ?').run("{}");
    database.prepare('UPDATE "ExportJob" SET "status" = ?, "fileName" = NULL, "fileSize" = NULL WHERE "fileName" IS NOT NULL OR "status" IN (?, ?)').run("Expired", "Succeeded", "Running");
  })();
  database.exec("VACUUM");
  validateDatabase(database);
}

export async function createSanitizedSqliteBackup(options: {
  sourceDatabase: string;
  allowedStorageRoot: string;
  backupRoot: string;
  applicationVersion: string;
  portfolioDemo: boolean;
  sessionIdleMinutes: number;
  sessionAbsoluteHours: number;
  now?: Date;
}): Promise<{ directory: string; manifest: BackupManifest }> {
  const source = assertWithin(options.allowedStorageRoot, options.sourceDatabase);
  const backupRoot = assertWithin(options.allowedStorageRoot, options.backupRoot);
  if (!(await stat(source)).isFile()) throw new Error("BACKUP_SOURCE_NOT_FILE");
  const now = options.now ?? new Date();
  const stamp = now.toISOString().replace(/[-:.]/gu, "").toLowerCase();
  const directory = assertWithin(backupRoot, path.join(backupRoot, `${stamp}-${randomUUID()}`));
  await mkdir(directory, { recursive: true });
  const databaseFile = path.join(directory, "database.db");
  const sourceHandle = new Database(source, { readonly: true, fileMustExist: true });
  try { await sourceHandle.backup(databaseFile); } finally { sourceHandle.close(); }
  const backupHandle = new Database(databaseFile, { fileMustExist: true });
  let tableCounts: Record<string, number>;
  try { sanitizeDatabase(backupHandle); tableCounts = counts(backupHandle); } finally { backupHandle.close(); }
  const manifest = manifestSchema.parse({
    formatVersion: 1,
    applicationVersion: options.applicationVersion,
    createdAt: now.toISOString(),
    databaseProvider: "sqlite",
    databaseFile: "database.db",
    databaseSha256: hash(await readFile(databaseFile)),
    counts: tableCounts,
    sanitization: ["active sessions removed", "worker leases removed", "local endpoint registration removed", "Windows Event rows removed", "raw diagnostic payloads replaced with empty JSON", "temporary export file references invalidated"],
    configuration: { portfolioDemo: options.portfolioDemo, sessionIdleMinutes: options.sessionIdleMinutes, sessionAbsoluteHours: options.sessionAbsoluteHours },
  });
  const temporaryManifest = path.join(directory, "manifest.json.tmp");
  await writeFile(temporaryManifest, JSON.stringify(manifest, null, 2), { encoding: "utf8", flag: "wx" });
  await rename(temporaryManifest, path.join(directory, "manifest.json"));
  return { directory, manifest };
}

export async function restoreAndValidateSqliteBackup(options: {
  backupDirectory: string;
  destinationDatabase: string;
  allowedStorageRoot: string;
}): Promise<{ destinationDatabase: string; counts: Record<string, number> }> {
  const backupDirectory = assertWithin(options.allowedStorageRoot, options.backupDirectory);
  const destination = assertWithin(options.allowedStorageRoot, options.destinationDatabase);
  const manifest = manifestSchema.parse(JSON.parse(await readFile(path.join(backupDirectory, "manifest.json"), "utf8")));
  const source = assertWithin(backupDirectory, path.join(backupDirectory, manifest.databaseFile));
  const content = await readFile(source);
  if (hash(content) !== manifest.databaseSha256) throw new Error("BACKUP_HASH_MISMATCH");
  await mkdir(path.dirname(destination), { recursive: true });
  try { await stat(destination); throw new Error("RESTORE_DESTINATION_EXISTS"); } catch (error) {
    if (error instanceof Error && error.message === "RESTORE_DESTINATION_EXISTS") throw error;
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await copyFile(source, temporary, 0);
  await rename(temporary, destination);
  const restored = new Database(destination, { readonly: true, fileMustExist: true });
  let restoredCounts: Record<string, number>;
  try {
    validateDatabase(restored);
    restoredCounts = counts(restored);
    if ((restored.prepare('SELECT COUNT(*) AS count FROM "Session"').get() as { count: number }).count !== 0) throw new Error("RESTORE_SESSION_SANITIZATION_FAILED");
    if ((restored.prepare('SELECT COUNT(*) AS count FROM "WindowsEvent"').get() as { count: number }).count !== 0) throw new Error("RESTORE_EVENT_SANITIZATION_FAILED");
  } finally { restored.close(); }
  if (JSON.stringify(restoredCounts) !== JSON.stringify(manifest.counts)) throw new Error("RESTORE_COUNT_MISMATCH");
  return { destinationDatabase: destination, counts: restoredCounts };
}
