import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SabadSchema } from "../../contracts/domain";
import { openAppDb } from "../db/client";
import { createRepository } from "../db/repo";
import { NOT_RECORDED, fillGap, planSabads, type SourceRow } from "./banidb-source";

const row = (ShabadID: number, ID: number, WriterEnglish: string | null, RaagEnglish: string | null = "Raag X"): SourceRow =>
  ({ ID, ShabadID, SourceID: "G", PageNo: 1, Gurmukhi: "legacy", GurmukhiUni: "text", RaagEnglish, WriterEnglish });

describe("writer and raag gaps", () => {
  it("keeps a line's own value, inherits a single Sabad value, else labels it", () => {
    expect(fillGap("Own", ["Own", "Other"])).toEqual({ value: "Own", how: "own" });
    expect(fillGap(null, ["A", null, "A"])).toEqual({ value: "A", how: "inherited" });
    expect(fillGap(null, [null, null])).toEqual({ value: NOT_RECORDED, how: "not_recorded" });
    expect(fillGap(null, ["A", null, "B"])).toEqual({ value: NOT_RECORDED, how: "not_recorded" });
    expect(fillGap("  ", ["A"])).toEqual({ value: "A", how: "inherited" });
  });

  it("applies the rule per Sabad and counts it", () => {
    const plan = planSabads([
      row(1, 1, "A"), row(1, 2, null),                 // single writer: inherited
      row(2, 3, null), row(2, 4, null),                // none: labelled
      row(3, 5, "A"), row(3, 6, "B"), row(3, 7, null), // several: own kept, gap labelled
    ]);
    expect(plan.planned.flatMap((sabad) => sabad.rows.map((r) => r.WriterEnglish)))
      .toEqual(["A", "A", NOT_RECORDED, NOT_RECORDED, "A", "B", NOT_RECORDED]);
    expect(plan.writer_gaps).toEqual({ own: 3, inherited: 1, not_recorded: 3, sabads_without_value: 1, sabads_with_several_values: 1 });
    expect(plan.raag_gaps.own).toBe(7);
  });
});

describe("duplicate verses", () => {
  it("skips a later Sabad that claims an already-ingested verse and reports it", () => {
    const plan = planSabads([row(1, 10, "A"), row(1, 11, "A"), row(2, 11, "A"), row(2, 12, "A"), row(3, 13, "A")]);
    expect(plan.planned.map((sabad) => sabad.shabadId)).toEqual([1, 3]);
    expect(plan.duplicate_verse_sabads).toEqual(["2"]);
  });
});

const root = fileURLToPath(new URL("../../..", import.meta.url));
const fixture = new URL("../../contracts/fixtures/sabad.demo.json", import.meta.url);
const sqlite = new URL("../../../data/banidb/banidb.sqlite", import.meta.url);
const fullTest = existsSync(sqlite) && existsSync(fixture) ? it : it.skip;

describe("full-corpus ingest", () => {
  fullTest("loads every G Sabad once, idempotently, keeping the demo Sabad identical to its fixture", () => {
    const dir = mkdtempSync(join(tmpdir(), "eko-full-ingest-"));
    const target = join(dir, "eko.db");
    const run = () => JSON.parse(execFileSync(process.execPath, ["--import", "tsx", join(root, "scripts/app/ingest.ts")],
      { env: { ...process.env, DATABASE_URL: target }, encoding: "utf8" })) as { source: Record<string, number | string> };
    try {
      const first = run().source;
      expect(first).toMatchObject({ mode: "sqlite_full", sabad_count: 5542, line_count: 60403, inserted_lines: 60403 });
      expect(run().source).toMatchObject({ inserted_lines: 0, line_count: 60403 });
      const { db, sqlite: handle } = openAppDb(target);
      try {
        const expected = SabadSchema.parse(JSON.parse(readFileSync(fixture, "utf8")));
        expect(createRepository(db).getSabad(expected.shabad_id)).toEqual(expected);
        expect((handle.prepare("SELECT COUNT(*) AS n FROM lines").get() as { n: number }).n).toBe(60403);
        expect((handle.prepare("SELECT COUNT(DISTINCT shabad_id) AS n FROM lines").get() as { n: number }).n).toBe(5542);
      } finally {
        handle.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
