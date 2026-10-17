import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SabadSchema } from "../../lib/contracts/domain";
import { createRepository } from "../../lib/server/db/repo";
import { openAppDb } from "../../lib/server/db/client";

const sourcePath = new URL("../../lib/contracts/fixtures/sabad.demo.json", import.meta.url);
const sourceTest = existsSync(sourcePath) ? it : it.skip;

describe("BaniDB app ingest", () => {
  sourceTest("loads the private source fixture twice without changing or duplicating lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "eko-ingest-test-"));
    const target = join(dir, "eko.db");
    const script = fileURLToPath(new URL("./ingest.ts", import.meta.url));
    const source = SabadSchema.parse(JSON.parse(readFileSync(sourcePath, "utf8")));
    try {
      const env = { ...process.env, DATABASE_URL: target, BANIDB_SOURCE: "fixture" };
      execFileSync(process.execPath, ["--import", "tsx", script], { env, stdio: "pipe" });
      execFileSync(process.execPath, ["--import", "tsx", script], { env, stdio: "pipe" });
      const { db, sqlite } = openAppDb(target);
      try {
        expect(createRepository(db).getSabad(source.shabad_id)).toEqual(source);
        expect((sqlite.prepare("SELECT COUNT(*) AS count FROM lines").get() as { count: number }).count).toBe(source.lines.length);
        const columns = sqlite.prepare("PRAGMA table_info(lines)").all() as { name: string }[];
        expect(columns.map((column) => column.name)).not.toContain("Translations");
      } finally {
        sqlite.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
