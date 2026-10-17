import type Database from "better-sqlite3";

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
