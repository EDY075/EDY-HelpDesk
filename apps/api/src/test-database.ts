import { mkdir, mkdtemp, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { createPrismaClient } from "./platform/prisma.js";

export async function testDatabase() {
  const directory = path.resolve("../../storage/test-runs");
  await mkdir(directory, { recursive: true });
  const run = await mkdtemp(path.join(directory, "phase3-"));
  const file = path.join(run, "test.db");
  const database = new Database(file);
  try {
    const migrations = path.resolve("../../prisma/migrations");
    for (const entry of (await readdir(migrations, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name)))
      database.exec(
        await readFile(
          path.join(migrations, entry.name, "migration.sql"),
          "utf8",
        ),
      );
  } finally {
    database.close();
  }
  return createPrismaClient(`file:${file}`);
}
