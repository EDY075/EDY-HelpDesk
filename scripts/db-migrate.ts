import { createHash } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

function resolveDatabasePath(databaseUrl: string, root: string): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("Phase 1 migration runner accepts only SQLite file: URLs");
  }

  const rawPath = databaseUrl.slice("file:".length);
  if (!rawPath || rawPath.includes("\0")) {
    throw new Error("DATABASE_URL contains an invalid SQLite path");
  }

  return path.isAbsolute(rawPath) ? rawPath : path.resolve(root, rawPath);
}

async function migrate(): Promise<void> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const databasePath = resolveDatabasePath(databaseUrl, root);
  await mkdir(path.dirname(databasePath), { recursive: true });

  const migrationsPath = path.join(root, "prisma", "migrations");
  const migrationNames = (await readdir(migrationsPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const database = new Database(databasePath);
  try {
    database.pragma("foreign_keys = ON");
    database.pragma("journal_mode = WAL");
    database.pragma("busy_timeout = 5000");
    database.exec(`
      CREATE TABLE IF NOT EXISTS "_edy_migrations" (
        "name" TEXT NOT NULL PRIMARY KEY,
        "checksum" TEXT NOT NULL,
        "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const findApplied = database.prepare(
      'SELECT "checksum" FROM "_edy_migrations" WHERE "name" = ?',
    );
    const recordApplied = database.prepare(
      'INSERT INTO "_edy_migrations" ("name", "checksum") VALUES (?, ?)',
    );

    let appliedCount = 0;
    for (const name of migrationNames) {
      const sqlPath = path.join(migrationsPath, name, "migration.sql");
      const sql = await readFile(sqlPath, "utf8");
      const checksum = createHash("sha256").update(sql, "utf8").digest("hex");
      const applied = findApplied.get(name) as { checksum: string } | undefined;

      if (applied) {
        if (applied.checksum !== checksum) {
          throw new Error(`Applied migration ${name} has changed`);
        }
        continue;
      }

      database.transaction(() => {
        database.exec(sql);
        recordApplied.run(name, checksum);
      })();
      appliedCount += 1;
    }

    const integrity = database.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") throw new Error(`SQLite integrity check failed: ${String(integrity)}`);

    console.log(
      `Database migrations complete: ${appliedCount} applied, ${migrationNames.length - appliedCount} already current.`,
    );
  } finally {
    database.close();
  }
}

migrate().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Database migration failed");
  process.exitCode = 1;
});
