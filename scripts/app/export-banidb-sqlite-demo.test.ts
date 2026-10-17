import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { SabadSchema } from "../../lib/contracts/domain";

const privatePath = new URL("../../data/banidb/banidb.sqlite", import.meta.url);
const sourceTest = existsSync(privatePath) ? it : it.skip;

describe("local BaniDB SQLite export", () => {
  sourceTest("validates staging-source coverage and exports a complete NFC Sabad with Rahao", async () => {
    const { assessSqliteSource, readSqliteSabad } = await import("./export-banidb-sqlite-demo");
    const db = new Database(fileURLToPath(privatePath), { readonly: true, fileMustExist: true });
    try {
      const coverage = assessSqliteSource(db);
      expect(coverage.g_source_rows).toBe(60403);
      expect(coverage.missing_mapped_g_rows).toBe(0);
      expect(coverage.shared_unicode_mismatches).toBe(0);
      const sabad = SabadSchema.parse(readSqliteSabad(db, 1356));
      expect(sabad.shabad_id).toBe("1356");
      expect(sabad.lines).toHaveLength(5);
      expect(sabad.lines.filter((line) => line.is_rahao)).toHaveLength(1);
      expect(sabad.lines.every((line) => line.gurmukhi.normalize("NFC") === line.gurmukhi)).toBe(true);
      expect(() => readSqliteSabad(db, 1356, "Verse")).toThrow("Incomplete Sabad");
      expect(() => readSqliteSabad(db, 55)).toThrow("metadata");
    } finally {
      db.close();
    }
  });
});
