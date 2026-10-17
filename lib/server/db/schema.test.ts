import { readFileSync, readdirSync } from "node:fs";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

describe("first app migration", () => {
  it("creates every F0 core record table from an empty SQLite database", () => {
    const migrationDir = new URL("./migrations/", import.meta.url);
    const files = readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort();
    expect(files.length).toBeGreaterThan(0);
    const sqlite = new Database(":memory:");
    try {
      for (const file of files) sqlite.exec(readFileSync(new URL(file, migrationDir), "utf8"));
      const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[];
      expect(tables.map((table) => table.name)).toEqual(expect.arrayContaining([
        "lines", "drafts", "findings", "check_runs", "decisions", "rules", "proposals", "drift_results", "references",
      ]));
      const checkRunColumns = sqlite.prepare("PRAGMA table_info(check_runs)").all() as { name: string }[];
      expect(checkRunColumns.map((column) => column.name)).toEqual(expect.arrayContaining([
        "draft_id", "draft_version", "ruleset_version", "phase", "status",
      ]));
    } finally {
      sqlite.close();
    }
  });
});
