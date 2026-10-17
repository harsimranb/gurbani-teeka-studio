import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SabadSchema } from "../../lib/contracts/domain";
import { openAppDb } from "../../lib/server/db/client";
import { createRepository } from "../../lib/server/db/repo";

const sourcePath = new URL("../../lib/contracts/fixtures/sabad.demo.json", import.meta.url);
const sourceTest = existsSync(sourcePath) ? it : it.skip;

describe("source-only demo seed", () => {
  sourceTest("(fixture fallback) keeps BaniDB lines exact and creates no draft or decision on repeat", () => {
    const dir = mkdtempSync(join(tmpdir(), "eko-seed-test-"));
    const target = join(dir, "eko.db");
    const script = fileURLToPath(new URL("./seed-demo.ts", import.meta.url));
    const source = SabadSchema.parse(JSON.parse(readFileSync(sourcePath, "utf8")));
    try {
      const env = { ...process.env, DATABASE_URL: target, BANIDB_SOURCE: "fixture" };
      execFileSync(process.execPath, ["--import", "tsx", script], { env, stdio: "pipe" });
      execFileSync(process.execPath, ["--import", "tsx", script], { env, stdio: "pipe" });
      const { db, sqlite } = openAppDb(target);
      try {
        expect(createRepository(db).getSabad(source.shabad_id)).toEqual(source);
        expect((sqlite.prepare("SELECT COUNT(*) AS count FROM lines").get() as { count: number }).count).toBe(source.lines.length);
        expect((sqlite.prepare("SELECT COUNT(*) AS count FROM drafts").get() as { count: number }).count).toBe(0);
        expect((sqlite.prepare("SELECT COUNT(*) AS count FROM decisions").get() as { count: number }).count).toBe(0);
      } finally {
        sqlite.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  const fullTest = existsSync(sourcePath) && existsSync(new URL("../../data/banidb/banidb.sqlite", import.meta.url)) ? it : it.skip;
  fullTest("seeds the full corpus source-only, with the demo Sabad identical to its fixture", () => {
    const dir = mkdtempSync(join(tmpdir(), "eko-seed-full-"));
    const target = join(dir, "eko.db");
    const script = fileURLToPath(new URL("./seed-demo.ts", import.meta.url));
    const source = SabadSchema.parse(JSON.parse(readFileSync(sourcePath, "utf8")));
    try {
      execFileSync(process.execPath, ["--import", "tsx", script], { env: { ...process.env, DATABASE_URL: target }, stdio: "pipe" });
      const { db, sqlite } = openAppDb(target);
      try {
        expect(createRepository(db).getSabad(source.shabad_id)).toEqual(source);
        expect((sqlite.prepare("SELECT COUNT(DISTINCT shabad_id) AS count FROM lines").get() as { count: number }).count).toBe(5542);
        expect((sqlite.prepare("SELECT COUNT(*) AS count FROM drafts").get() as { count: number }).count).toBe(0);
        expect((sqlite.prepare("SELECT COUNT(*) AS count FROM decisions").get() as { count: number }).count).toBe(0);
      } finally {
        sqlite.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
