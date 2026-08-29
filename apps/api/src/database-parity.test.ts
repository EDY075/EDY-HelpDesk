import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

function names(source: string, kind: "model" | "enum"): string[] {
  return [...source.matchAll(new RegExp(`^${kind}\\s+(\\w+)\\s+\\{`, "gmu"))].map((match) => match[1]!).sort();
}

function blocks(source: string, kind: "model" | "enum"): Map<string, string> {
  const result = new Map<string, string>();
  const matcher = new RegExp(`^${kind}\\s+(\\w+)\\s+\\{([\\s\\S]*?)^\\}`, "gmu");
  for (const match of source.matchAll(matcher)) result.set(match[1]!, match[2]!.replace(/\r/gu, "").trim());
  return result;
}

describe("Phase 7 SQLite and PostgreSQL schema parity", () => {
  it("keeps every domain model, enum, field, constraint and index identical", async () => {
    const root = path.resolve("../..");
    const sqlite = await readFile(path.join(root, "prisma/schema.prisma"), "utf8");
    const postgresql = await readFile(path.join(root, "prisma/schema.postgresql.prisma"), "utf8");

    expect(names(postgresql, "model")).toEqual(names(sqlite, "model"));
    expect(names(postgresql, "enum")).toEqual(names(sqlite, "enum"));
    expect(blocks(postgresql, "model")).toEqual(blocks(sqlite, "model"));
    expect(blocks(postgresql, "enum")).toEqual(blocks(sqlite, "enum"));
    expect(postgresql).toContain('provider = "postgresql"');
    expect(sqlite).toContain('provider = "sqlite"');
  });
});
