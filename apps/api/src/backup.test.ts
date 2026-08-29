import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedDatabase } from "../../../prisma/seed.js";
import { seedPhase4 } from "../../../prisma/seed-phase4.js";
import { seedPhase5 } from "../../../prisma/seed-phase5.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { createSanitizedSqliteBackup, restoreAndValidateSqliteBackup } from "./platform/backup.js";
import { testDatabase } from "./test-database.js";

let db: PrismaClient;
let sourceDatabase: string;
const projectRoot = path.resolve("../..");
const storageRoot = path.join(projectRoot, "storage");
const artifactRoot = path.join(storageRoot, "test-artifacts", `phase7-backup-${randomUUID()}`);

beforeAll(async () => {
  db = await testDatabase();
  await seedDatabase(db); await seedPhase4(db); await seedPhase5(db);
  const databaseList = await db.$queryRawUnsafe<Array<{ file: string }>>("PRAGMA database_list");
  sourceDatabase = databaseList.find((entry) => entry.file)?.file ?? "";
  const account = await db.account.findFirstOrThrow();
  await db.session.create({ data: { tokenHash: `synthetic-${randomUUID()}`, csrfTokenHash: `synthetic-${randomUUID()}`, accountId: account.id, expiresAt: new Date(Date.now() + 60_000) } });
});
afterAll(async () => db.$disconnect());

describe.sequential("Phase 7 backup and restore", () => {
  it("creates a sanitized, checksummed backup and restores critical relationships", async () => {
    const backup = await createSanitizedSqliteBackup({
      sourceDatabase,
      allowedStorageRoot: storageRoot,
      backupRoot: artifactRoot,
      applicationVersion: "1.0.0-rc.1",
      portfolioDemo: true,
      sessionIdleMinutes: 30,
      sessionAbsoluteHours: 12,
      now: new Date("2026-08-28T15:00:00.000Z"),
    });
    expect(backup.manifest.databaseSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(backup.manifest.counts.Ticket).toBeGreaterThan(0);
    expect(JSON.stringify(backup.manifest)).not.toContain(sourceDatabase);

    const destination = path.join(artifactRoot, `restored-${randomUUID()}.db`);
    const restored = await restoreAndValidateSqliteBackup({ backupDirectory: backup.directory, destinationDatabase: destination, allowedStorageRoot: storageRoot });
    expect(restored.counts).toEqual(backup.manifest.counts);

    const manifest = JSON.parse(await readFile(path.join(backup.directory, "manifest.json"), "utf8")) as { sanitization: string[] };
    expect(manifest.sanitization).toContain("active sessions removed");
  });

  it("rejects source, backup and restore paths outside controlled storage", async () => {
    await expect(createSanitizedSqliteBackup({ sourceDatabase: path.join(projectRoot, "package.json"), allowedStorageRoot: storageRoot, backupRoot: artifactRoot, applicationVersion: "test", portfolioDemo: true, sessionIdleMinutes: 30, sessionAbsoluteHours: 12 })).rejects.toThrow("BACKUP_PATH_OUTSIDE_ALLOWED_ROOT");
    await expect(restoreAndValidateSqliteBackup({ backupDirectory: projectRoot, destinationDatabase: path.join(artifactRoot, "blocked.db"), allowedStorageRoot: storageRoot })).rejects.toThrow("BACKUP_PATH_OUTSIDE_ALLOWED_ROOT");
  });
});
