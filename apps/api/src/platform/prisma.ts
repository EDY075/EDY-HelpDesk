import { existsSync } from "node:fs";
import path from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaClient as PostgreSqlPrismaClient } from "../generated/prisma-postgresql/client.js";

function findProjectRoot(start: string): string {
  let current = path.resolve(start);
  while (true) {
    if (existsSync(path.join(current, "prisma", "schema.prisma"))) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error("EDY HelpDesk project root could not be resolved");
    current = parent;
  }
}

export function normalizeDatabaseUrl(databaseUrl: string, cwd = process.cwd()): string {
  if (!databaseUrl.startsWith("file:")) return databaseUrl;
  const rawPath = databaseUrl.slice("file:".length);
  if (path.isAbsolute(rawPath)) return databaseUrl;
  const absolutePath = path.resolve(findProjectRoot(cwd), rawPath).replaceAll("\\", "/");
  return `file:${absolutePath}`;
}

export function createPrismaClient(databaseUrl: string): PrismaClient {
  if (/^(postgres|postgresql):\/\//.test(databaseUrl)) {
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    return new PostgreSqlPrismaClient({ adapter }) as unknown as PrismaClient;
  }
  const adapter = new PrismaBetterSqlite3({ url: normalizeDatabaseUrl(databaseUrl) });
  return new PrismaClient({ adapter });
}

export type DatabaseClient = PrismaClient;
