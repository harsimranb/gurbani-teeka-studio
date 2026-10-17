import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import { count } from "drizzle-orm";
import type { Sabad } from "../../contracts/domain";
import type { AppDb } from "../db/client";
import { lines } from "../db/schema";
import { createRepository } from "../db/repo";
import { ingestDemoSabad } from "./banidb";
import { assertCompleteSabad, toDemoSabad, type SourceLineFields } from "./banidb-rows";
import { assertSqliteCoverage, assessSqliteSource } from "./banidb-sqlite";

export const NOT_RECORDED = "Not recorded in BaniDB";
export type GapHow = "own" | "inherited" | "not_recorded";

/** A line's own value wins; else the Sabad's single distinct value; else the literal label. Never guesses. */
export function fillGap(own: string | null | undefined, sabadValues: (string | null | undefined)[]): { value: string; how: GapHow } {
  if (own?.trim()) return { value: own, how: "own" };
  const distinct = [...new Set(sabadValues.map((value) => value?.trim()).filter((value): value is string => !!value))];
  return distinct.length === 1 ? { value: distinct[0], how: "inherited" } : { value: NOT_RECORDED, how: "not_recorded" };
}

export type SourceRow = Omit<SourceLineFields, "RaagEnglish" | "WriterEnglish"> & {
  RaagEnglish: string | null; WriterEnglish: string | null;
};

const emptyGaps = () => ({ own: 0, inherited: 0, not_recorded: 0, sabads_without_value: 0, sabads_with_several_values: 0 });

/** Rows ordered by ShabadID, ID. A Sabad that claims a verse already taken by an earlier Sabad is skipped whole and reported. */
export function planSabads(rows: SourceRow[]) {
  const groups = new Map<number, SourceRow[]>();
  for (const row of rows) (groups.get(row.ShabadID) ?? groups.set(row.ShabadID, []).get(row.ShabadID)!).push(row);
  const claimed = new Set<number>();
  const planned: { shabadId: number; rows: SourceLineFields[] }[] = [];
  const duplicateVerseSabads: string[] = [];
  const writer = emptyGaps();
  const raag = emptyGaps();
  for (const [shabadId, group] of groups) {
    if (group.some((row) => claimed.has(row.ID))) { duplicateVerseSabads.push(String(shabadId)); continue; }
    for (const row of group) claimed.add(row.ID);
    const filled = group.map((row) => ({
      ...row,
      WriterEnglish: fillGap(row.WriterEnglish, group.map((r) => r.WriterEnglish)),
      RaagEnglish: fillGap(row.RaagEnglish, group.map((r) => r.RaagEnglish)),
    }));
    for (const [gaps, key] of [[writer, "WriterEnglish"], [raag, "RaagEnglish"]] as const) {
      for (const row of filled) gaps[row[key].how]++;
      const distinct = new Set(group.map((row) => row[key]?.trim()).filter(Boolean)).size;
      if (distinct === 0) gaps.sabads_without_value++;
      else if (distinct > 1) gaps.sabads_with_several_values++;
    }
    planned.push({ shabadId, rows: filled.map((row) => ({ ...row, WriterEnglish: row.WriterEnglish.value, RaagEnglish: row.RaagEnglish.value })) });
  }
  return { planned, duplicate_verse_sabads: duplicateVerseSabads, writer_gaps: writer, raag_gaps: raag };
}

export function buildSabads(rows: SourceRow[]) {
  const { planned, ...report } = planSabads(rows);
  return { sabads: planned.map((sabad): Sabad => toDemoSabad(sabad.rows, sabad.shabadId)), ...report };
}

export const sqlitePathFor = (root: string) => resolve(root, "data/banidb/banidb-upload.sqlite");
export const useFullSqlite = (root: string) => process.env.BANIDB_SOURCE !== "fixture" && existsSync(sqlitePathFor(root));

/** Every G Sabad from the user-provided SQLite copy, after the same coverage gate as the demo exporter. Gurmukhi is read, never edited; English columns are not selected. */
export function loadSqliteSabads(root: string) {
  const db = new Database(sqlitePathFor(root), { readonly: true, fileMustExist: true });
  try {
    assertSqliteCoverage(assessSqliteSource(db));
    const rows = db.prepare(`SELECT s.ShabadID, t.ID, t.SourceID, t.PageNo, t.Gurmukhi, t.GurmukhiUni,
        r.RaagEnglish, w.WriterEnglish
      FROM Shabad s JOIN tmp_Verse t ON t.ID = s.VerseID
      LEFT JOIN Raag r ON r.RaagID = t.RaagID LEFT JOIN Writer w ON w.WriterID = t.WriterID
      WHERE s.ShabadID < 5000000 AND t.SourceID = 'G' ORDER BY s.ShabadID, t.ID`).all() as SourceRow[];
    const mapped = new Map((db.prepare("SELECT ShabadID, COUNT(*) AS count FROM Shabad WHERE ShabadID < 5000000 GROUP BY ShabadID")
      .all() as { ShabadID: number; count: number }[]).map((row) => [row.ShabadID, row.count]));
    const counts = new Map<number, number>();
    for (const row of rows) counts.set(row.ShabadID, (counts.get(row.ShabadID) ?? 0) + 1);
    for (const [shabadId, count] of counts) assertCompleteSabad(mapped.get(shabadId) ?? 0, count);
    return buildSabads(rows);
  } finally {
    db.close();
  }
}

/** Full corpus when the private SQLite copy exists (one transaction), else the single-Sabad demo fixture. */
export function ingestBanidb(db: AppDb, root: string) {
  const repo = createRepository(db);
  const countLines = () => db.select({ n: count() }).from(lines).get()!.n;
  const before = countLines();
  if (!useFullSqlite(root)) {
    const demo = ingestDemoSabad(repo, resolve(root, "lib/contracts/fixtures/sabad.demo.json"), resolve(root, "data/banidb/export-metadata.json"));
    return { mode: "demo_fixture", provenance: demo.provenance, sabad_count: 1, line_count: demo.line_count, inserted_lines: countLines() - before };
  }
  const { sabads, ...report } = loadSqliteSabads(root);
  repo.saveSabads(sabads);
  return { mode: "sqlite_full", sabad_count: sabads.length,
    line_count: sabads.reduce((total, sabad) => total + sabad.lines.length, 0),
    inserted_lines: countLines() - before, ...report };
}
