import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection, type RowDataPacket } from "mysql2/promise";

interface SourceLine extends RowDataPacket {
  ID: number;
  ShabadID: number;
  SourceID: string;
  PageNo: number;
  Gurmukhi: string;
  GurmukhiUni: string;
  RaagEnglish: string;
  WriterEnglish: string;
}

export function normalizeSourceText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Missing Unicode source text; refusing to substitute or generate it.");
  }
  return value.normalize("NFC");
}

export function assertCompleteSabad(expected: number, actual: number): void {
  if (!Number.isSafeInteger(expected) || expected < 1 || expected !== actual) {
    throw new Error(`Incomplete Sabad: ${actual} stored lines for ${expected} source mappings.`);
  }
}

export function toDemoSabad(rows: SourceLine[], expectedShabadId?: number) {
  if (!rows.length) throw new Error("No source lines found for the Sabad.");
  if (expectedShabadId !== undefined && rows.some((row) => row.ShabadID !== expectedShabadId)) {
    throw new Error("Sabad header does not match source line IDs.");
  }
  const ids = new Set<number>();
  const shabadId = rows[0].ShabadID;
  return {
    shabad_id: String(shabadId),
    lines: rows.map((row) => {
      if (row.SourceID !== "G") throw new Error("Demo lines must come from SourceID G.");
      if (!Number.isSafeInteger(row.ID) || row.ID < 1 || ids.has(row.ID) ||
          !Number.isSafeInteger(shabadId) || shabadId < 1 || row.ShabadID !== shabadId) {
        throw new Error("Invalid, duplicate or mixed BaniDB source IDs.");
      }
      if (!Number.isInteger(row.PageNo) || row.PageNo < 1 || row.PageNo > 1430 ||
          typeof row.RaagEnglish !== "string" || !row.RaagEnglish.trim() ||
          typeof row.WriterEnglish !== "string" || !row.WriterEnglish.trim() ||
          typeof row.Gurmukhi !== "string" || !row.Gurmukhi.trim()) {
        throw new Error("Missing or invalid BaniDB line metadata.");
      }
      const gurmukhi = normalizeSourceText(row.GurmukhiUni);
      if (!/\p{Script=Gurmukhi}/u.test(gurmukhi)) {
        throw new Error("BaniDB Unicode field contains no Gurmukhi source text.");
      }
      ids.add(row.ID);
      return {
        line_id: String(row.ID),
        shabad_id: String(row.ShabadID),
        ang: row.PageNo,
        raag: row.RaagEnglish,
        writer: row.WriterEnglish,
        // BaniDB's legacy source field supplies the refrain marker; no text conversion.
        is_rahao: /(?:^|\s)rhwau(?:\s|[|.0-9]|$)/.test(row.Gurmukhi),
        gurmukhi,
      };
    }),
  };
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const fixture = "lib/contracts/fixtures/sabad.demo.json";
  const metadata = "data/banidb/export-metadata.json";
  const coverage = "data/banidb/local-coverage.json";
  for (const path of [fixture, metadata, coverage]) {
    execFileSync("git", ["check-ignore", "-q", "--", path], { cwd: root });
  }
  const requestedId = process.argv[2];
  if (process.argv.length > 3 || (requestedId && !/^[1-9][0-9]*$/.test(requestedId))) {
    throw new Error("Usage: export-banidb-demo.ts [BaniDB Sabad ID]");
  }
  const password = process.env.BANIDB_ROOT_PASSWORD;
  if (!password) throw new Error("Set BANIDB_ROOT_PASSWORD using the ignored local env file.");
  const connection = await createConnection({
    host: "127.0.0.1",
    port: Number(process.env.BANIDB_PORT || 3307),
    user: "root",
    password,
    database: "khajana_dev_khajana",
    charset: "utf8mb4",
    connectTimeout: 10_000,
  });
  try {
    await connection.query("SET TRANSACTION READ ONLY");
    await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
    const [sources] = await connection.query<RowDataPacket[]>(`
      SELECT src.SourceID AS source_id, src.SourceEnglish AS source_name,
        COUNT(v.ID) AS verse_count, MIN(v.PageNo) AS first_ang,
        MAX(v.PageNo) AS last_ang, COUNT(DISTINCT v.PageNo) AS ang_count
      FROM Source src LEFT JOIN Verse v USING (SourceID)
      GROUP BY src.SourceID, src.SourceEnglish ORDER BY src.SourceID`);
    const [pages] = await connection.query<RowDataPacket[]>(
      "SELECT DISTINCT PageNo AS ang FROM Verse WHERE SourceID = 'G' ORDER BY PageNo");
    const pageSet = new Set(pages.map((row) => Number(row.ang)));
    const missingAngs = Array.from({ length: 1430 }, (_, i) => i + 1)
      .filter((ang) => !pageSet.has(ang));
    const [integrity] = await connection.query<RowDataPacket[]>(`
      SELECT COUNT(*) AS verse_count, MIN(v.ID) AS first_verse_id,
        MAX(v.ID) AS last_verse_id, COUNT(DISTINCT s.ShabadID) AS sabad_count,
        SUM(v.PageNo IS NULL OR v.PageNo < 1 OR v.PageNo > 1430) AS invalid_ang_count,
        SUM(v.GurmukhiUni IS NULL OR TRIM(v.GurmukhiUni) = '') AS missing_unicode_count,
        SUM(s.VerseID IS NULL) AS unmapped_verse_count
      FROM Verse v LEFT JOIN Shabad s ON s.VerseID = v.ID AND s.ShabadID < 5000000
      WHERE v.SourceID = 'G'`);
    const [mappingIntegrity] = await connection.query<RowDataPacket[]>(`
      SELECT COUNT(*) AS source_mapping_count,
        SUM(v.ID IS NULL) AS missing_mapped_verse_count
      FROM Shabad s
      JOIN (SELECT DISTINCT s2.ShabadID FROM Shabad s2
        JOIN Verse v2 ON v2.ID = s2.VerseID
        WHERE v2.SourceID = 'G' AND s2.ShabadID < 5000000) g USING (ShabadID)
      LEFT JOIN Verse v ON v.ID = s.VerseID`);
    const [idDistribution] = await connection.query<RowDataPacket[]>(`
      SELECT MOD(ID, 3) AS id_modulo_3, COUNT(*) AS verse_count
      FROM Verse WHERE SourceID = 'G' GROUP BY MOD(ID, 3)`);
    const localCoverage = {
      checked_at: new Date().toISOString(), sources,
      guru_granth_sahib: { ...integrity[0], ...mappingIntegrity[0],
        missing_angs: missingAngs, id_distribution: idDistribution },
      limitation: "Ang coverage alone does not prove completeness; missing source mappings prove this development seed is partial.",
    };
    await writeFile(resolve(root, coverage), JSON.stringify(localCoverage, null, 2) + "\n", { mode: 0o600 });
    let shabadId = requestedId;
    if (!shabadId) {
      const [candidates] = await connection.query<RowDataPacket[]>(`
        SELECT s.ShabadID FROM Shabad s JOIN Verse v ON s.VerseID = v.ID
        LEFT JOIN Writer w USING (WriterID) LEFT JOIN Raag r USING (RaagID)
        WHERE s.ShabadID < 5000000 GROUP BY s.ShabadID
        HAVING COUNT(*) BETWEEN 1 AND 20
          AND COUNT(*) = (SELECT COUNT(*) FROM Shabad all_s WHERE all_s.ShabadID = s.ShabadID)
          AND MIN(v.SourceID) = 'G' AND MAX(v.SourceID) = 'G'
          AND SUM(w.WriterEnglish IS NULL OR TRIM(w.WriterEnglish) = ''
            OR r.RaagEnglish IS NULL OR TRIM(r.RaagEnglish) = '') = 0
        ORDER BY (SUM(v.Gurmukhi LIKE '%rhwau%') > 0) DESC, COUNT(*) DESC, s.ShabadID LIMIT 1`);
      if (!candidates.length) throw new Error("No complete compact local Sabad found; use the documented API fallback explicitly.");
      shabadId = String(candidates[0].ShabadID);
    }
    const [rows] = await connection.execute<SourceLine[]>(`
      SELECT v.ID, s.ShabadID, v.SourceID, v.PageNo, v.Gurmukhi, v.GurmukhiUni,
        r.RaagEnglish, w.WriterEnglish
      FROM Verse v JOIN Shabad s ON s.VerseID = v.ID
      LEFT JOIN Writer w USING (WriterID) LEFT JOIN Raag r USING (RaagID)
      WHERE s.ShabadID = ? AND s.ShabadID < 5000000 ORDER BY v.ID`, [shabadId]);
    const [mappingCount] = await connection.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM Shabad WHERE ShabadID = ?", [shabadId]);
    assertCompleteSabad(Number(mappingCount[0].count), rows.length);
    const sabad = toDemoSabad(rows, Number(shabadId));
    const json = JSON.stringify(sabad, null, 2) + "\n";
    const report = {
      exported_at: new Date().toISOString(),
      source: "local BaniDB MariaDB",
      source_id: "G",
      source_database: "khajana_dev_khajana",
      corpus_complete: Number(mappingIntegrity[0].missing_mapped_verse_count) > 0 || missingAngs.length > 0 ? false : "unknown",
      sources,
      guru_granth_sahib: localCoverage.guru_granth_sahib,
      fixture: { path: fixture, shabad_id: sabad.shabad_id,
        line_ids: sabad.lines.map((line) => line.line_id),
        line_count: sabad.lines.length,
        rahao_line_ids: sabad.lines.filter((line) => line.is_rahao).map((line) => line.line_id),
        normalization: "NFC", sha256: createHash("sha256").update(json).digest("hex") },
      rahao_mapping: "Standalone rhwau token in the unmodified legacy Verse.Gurmukhi field",
      terms: "https://www.banidb.com/tos/",
      limitation: "Private development fixture; corpus coverage is not a textual audit or a claim of current production data.",
    };
    await connection.commit();
    await mkdir(dirname(resolve(root, fixture)), { recursive: true });
    await writeFile(resolve(root, fixture), json, { mode: 0o600 });
    await writeFile(resolve(root, metadata), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "BaniDB export failed.");
    process.exitCode = 1;
  });
}
