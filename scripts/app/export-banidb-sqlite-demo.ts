import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { z } from "zod";
import { SabadSchema } from "../../lib/contracts/domain";
import { assertCompleteSabad, toDemoSabad, type SourceLineFields } from "./export-banidb-demo";

type SourceTable = "tmp_Verse" | "Verse";

export function assessSqliteSource(db: Database.Database) {
  const source = db.prepare(`SELECT COUNT(*) AS count, MIN(ID) AS first_id, MAX(ID) AS last_id,
    COUNT(DISTINCT PageNo) AS angs,
    SUM(CASE WHEN GurmukhiUni IS NULL OR TRIM(GurmukhiUni) = '' THEN 1 ELSE 0 END) AS missing_unicode
    FROM tmp_Verse WHERE SourceID = 'G'`).get() as {
      count: number; first_id: number; last_id: number; angs: number; missing_unicode: number;
    };
  const mapping = db.prepare(`SELECT COUNT(*) AS mapped_rows,
    SUM(CASE WHEN t.ID IS NULL THEN 1 ELSE 0 END) AS missing_rows,
    SUM(CASE WHEN t.ID IS NOT NULL AND t.SourceID != 'G' THEN 1 ELSE 0 END) AS mixed_source_rows
    FROM Shabad s JOIN (
      SELECT DISTINCT s2.ShabadID FROM Shabad s2
      JOIN tmp_Verse t2 ON t2.ID = s2.VerseID
      WHERE t2.SourceID = 'G' AND s2.ShabadID < 5000000
    ) g ON g.ShabadID = s.ShabadID
    LEFT JOIN tmp_Verse t ON t.ID = s.VerseID`).get() as {
      mapped_rows: number; missing_rows: number; mixed_source_rows: number;
    };
  const overlap = db.prepare(`SELECT COUNT(*) AS shared_rows,
    SUM(CASE WHEN t.ID IS NULL OR t.SourceID != 'G' OR t.GurmukhiUni != v.GurmukhiUni THEN 1 ELSE 0 END) AS mismatches
    FROM Verse v LEFT JOIN tmp_Verse t ON t.ID = v.ID WHERE v.SourceID = 'G'`).get() as {
      shared_rows: number; mismatches: number;
    };
  return {
    g_source_rows: source.count,
    first_g_id: source.first_id,
    last_g_id: source.last_id,
    covered_angs: source.angs,
    missing_unicode: source.missing_unicode,
    mapped_g_rows: mapping.mapped_rows,
    missing_mapped_g_rows: mapping.missing_rows,
    mixed_source_rows: mapping.mixed_source_rows,
    shared_verse_rows: overlap.shared_rows,
    shared_unicode_mismatches: overlap.mismatches,
    limitation: "Mapping coverage and shared-row parity do not certify a current or textually audited complete corpus.",
  };
}

export function assertSqliteCoverage(coverage: ReturnType<typeof assessSqliteSource>): void {
  if (coverage.missing_mapped_g_rows || coverage.mixed_source_rows || coverage.missing_unicode ||
      coverage.shared_unicode_mismatches || coverage.g_source_rows !== coverage.last_g_id - coverage.first_g_id + 1) {
    throw new Error("BaniDB SQLite source coverage or overlap validation failed.");
  }
}

export function readSqliteSabad(db: Database.Database, shabadId: number, table: SourceTable = "tmp_Verse") {
  if (!Number.isSafeInteger(shabadId) || shabadId < 1) throw new Error("Invalid BaniDB Sabad ID.");
  const mapped = db.prepare("SELECT COUNT(*) AS count FROM Shabad WHERE ShabadID = ?").get(shabadId) as { count: number };
  const rows = db.prepare(`SELECT t.ID, s.ShabadID, t.SourceID, t.PageNo, t.Gurmukhi, t.GurmukhiUni,
      r.RaagEnglish, w.WriterEnglish
    FROM Shabad s JOIN ${table} t ON t.ID = s.VerseID
    LEFT JOIN Raag r ON r.RaagID = t.RaagID
    LEFT JOIN Writer w ON w.WriterID = t.WriterID
    WHERE s.ShabadID = ? ORDER BY t.ID`).all(shabadId) as SourceLineFields[];
  assertCompleteSabad(mapped.count, rows.length);
  return SabadSchema.parse(toDemoSabad(rows, shabadId));
}

async function main() {
  const id = process.argv[2] || "1356";
  if (process.argv.length > 3 || !/^[1-9][0-9]*$/.test(id)) {
    throw new Error("Usage: export-banidb-sqlite-demo.ts [BaniDB Sabad ID]");
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const sourcePath = "data/banidb/banidb.sqlite";
  const fixturePath = "lib/contracts/fixtures/sabad.demo.json";
  const metadataPath = "data/banidb/export-metadata.json";
  const coveragePath = "data/banidb/sqlite-coverage.json";
  const backupFixturePath = "data/banidb/sabad.api-fallback.json";
  const backupMetadataPath = "data/banidb/export-metadata.api-fallback.json";
  for (const path of [sourcePath, fixturePath, metadataPath, coveragePath, backupFixturePath, backupMetadataPath]) {
    execFileSync("git", ["check-ignore", "-q", "--", path], { cwd: root });
  }
  const db = new Database(resolve(root, sourcePath), { readonly: true, fileMustExist: true });
  let coverage: ReturnType<typeof assessSqliteSource>;
  let sabad: ReturnType<typeof readSqliteSabad>;
  try {
    coverage = assessSqliteSource(db);
    assertSqliteCoverage(coverage);
    sabad = readSqliteSabad(db, Number(id));
    if (!sabad.lines.some((line) => line.is_rahao)) throw new Error("Selected Sabad has no verified Rahao marker.");
  } finally {
    db.close();
  }
  const json = JSON.stringify(sabad, null, 2) + "\n";
  const sourceStat = await stat(resolve(root, sourcePath));
  const metadata = {
    exported_at: new Date().toISOString(),
    source: "user-provided local BaniDB SQLite copy",
    source_path: sourcePath, source_table: "tmp_Verse", source_size_bytes: sourceStat.size,
    shabad_id: sabad.shabad_id, line_ids: sabad.lines.map((line) => line.line_id),
    line_count: sabad.lines.length,
    rahao_line_ids: sabad.lines.filter((line) => line.is_rahao).map((line) => line.line_id),
    normalization: "NFC", fixture_path: fixturePath,
    fixture_sha256: createHash("sha256").update(json).digest("hex"),
    coverage_path: coveragePath,
    limitation: coverage.limitation,
  };
  await mkdir(resolve(root, "data/banidb"), { recursive: true });
  try {
    const prior = JSON.parse(await readFile(resolve(root, metadataPath), "utf8")) as { source?: string };
    if (prior.source?.includes("API")) {
      await copyFile(resolve(root, fixturePath), resolve(root, backupFixturePath), constants.COPYFILE_EXCL).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
      await copyFile(resolve(root, metadataPath), resolve(root, backupMetadataPath), constants.COPYFILE_EXCL).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeFile(resolve(root, fixturePath), json, { mode: 0o600 });
  await writeFile(resolve(root, coveragePath), JSON.stringify(coverage, null, 2) + "\n", { mode: 0o600 });
  await writeFile(resolve(root, metadataPath), JSON.stringify(metadata, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ shabad_id: sabad.shabad_id, line_count: sabad.lines.length,
    rahao_count: metadata.rahao_line_ids.length, source_table: metadata.source_table,
    fixture_sha256: metadata.fixture_sha256 }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof z.ZodError ? "Invalid BaniDB SQLite source payload." :
      error instanceof Error ? error.message : "BaniDB SQLite export failed.");
    process.exitCode = 1;
  });
}
