import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
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

describe("migrations applied by drizzle", () => {
  const migrationsFolder = fileURLToPath(new URL("./migrations/", import.meta.url));
  const tables = (sqlite: Database.Database) =>
    (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' ORDER BY name").all() as { name: string }[]).map((t) => t.name);

  it("builds every table, including publications and sequences, from an empty database", () => {
    const sqlite = new Database(":memory:");
    try {
      migrate(drizzle({ client: sqlite }), { migrationsFolder });
      expect(tables(sqlite)).toEqual(expect.arrayContaining(["publications", "sequences", "drafts", "lines", "rules"]));
      expect((sqlite.prepare("PRAGMA table_info(publications)").all() as { name: string }[]).map((c) => c.name))
        .toEqual(["reference_id", "shabad_id", "draft_id", "at", "payload"]);
      expect((sqlite.prepare("PRAGMA table_info(sequences)").all() as { name: string }[]).map((c) => c.name)).toEqual(["kind", "value"]);
      expect((sqlite.prepare("PRAGMA index_list(publications)").all() as { name: string }[]).map((i) => i.name)).toContain("publications_shabad_idx");
    } finally { sqlite.close(); }
  });

  it("upgrades a database that already has only the 0000 migration, keeping its rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "eko-migrate-test-"));
    const oldFolder = join(dir, "old");
    const sqlite = new Database(join(dir, "app.sqlite"));
    try {
      cpSync(migrationsFolder, oldFolder, { recursive: true });
      rmSync(join(oldFolder, "0001_publications_sequences.sql"));
      const journalPath = join(oldFolder, "meta", "_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { idx: number }[] };
      journal.entries = journal.entries.filter((entry) => entry.idx === 0);
      writeFileSync(journalPath, JSON.stringify(journal));
      const db = drizzle({ client: sqlite });
      migrate(db, { migrationsFolder: oldFolder });
      expect(tables(sqlite)).not.toContain("publications");
      sqlite.prepare("INSERT INTO `references` (id, source, payload) VALUES ('keep-me', 'published', '{}')").run();

      migrate(db, { migrationsFolder });
      expect(tables(sqlite)).toEqual(expect.arrayContaining(["publications", "sequences"]));
      expect(sqlite.prepare("SELECT id FROM `references`").all()).toEqual([{ id: "keep-me" }]);
      migrate(db, { migrationsFolder }); // re-running is a no-op
    } finally {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
