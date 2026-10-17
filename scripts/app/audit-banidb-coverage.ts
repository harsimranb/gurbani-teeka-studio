// P-05: read-only coverage audit of the private local BaniDB SQLite copy, plus a live spot-check.
// Output is counts and IDs only; Gurmukhi text is never printed or written to the report.
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { z } from "zod";
import { hasRahaoMarker } from "./export-banidb-demo";

const SABAD_MAX = 5_000_000;
const LIVE_URL = "https://api.banidb.com/v2/shabads/";

export interface LocalSabad { ids: number[]; texts: string[] }
export type LiveSabad = LocalSabad;

export function auditInternalConsistency(db: Database.Database) {
  const rows = db.prepare(`SELECT ID, PageNo, "LineNo" AS LineNo, WriterID, RaagID, Gurmukhi, GurmukhiUni
    FROM tmp_Verse WHERE SourceID = 'G' ORDER BY ID`).all() as {
      ID: number; PageNo: number | null; LineNo: number | null; WriterID: number | null;
      RaagID: number | null; Gurmukhi: string | null; GurmukhiUni: string | null;
    }[];
  const ids = rows.map((row) => row.ID);
  const idGaps = ids.filter((id, i) => i > 0 && id !== ids[i - 1] + 1).length;

  const angRows = new Map<number, typeof rows>();
  for (const row of rows) {
    if (row.PageNo === null) continue;
    angRows.set(row.PageNo, [...(angRows.get(row.PageNo) ?? []), row]);
  }
  const missingAngs = Array.from({ length: 1430 }, (_, i) => i + 1).filter((ang) => !angRows.has(ang));
  const outOfRangeAngRows = rows.filter((row) => row.PageNo === null || row.PageNo < 1 || row.PageNo > 1430).length;
  // LineNo is the printed line on the ang, so several verses legitimately share one; only missing
  // or decreasing values are anomalies. Shared values are counted for information.
  let angsMissingLineNo = 0, angsSharedLineNo = 0, angsLineNoNotIncreasing = 0;
  for (const lines of angRows.values()) {
    const nums = lines.map((line) => line.LineNo);
    if (nums.some((n) => n === null || !Number.isInteger(n) || n < 1)) { angsMissingLineNo++; continue; }
    if (new Set(nums).size !== nums.length) angsSharedLineNo++;
    if (nums.some((n, i) => i > 0 && (n as number) < (nums[i - 1] as number))) angsLineNoNotIncreasing++;
  }

  const byId = new Map(rows.map((row) => [row.ID, row]));
  const mapRows = db.prepare(`SELECT ShabadID, VerseID FROM Shabad WHERE ShabadID < ${SABAD_MAX}
    AND VerseID IN (SELECT ID FROM tmp_Verse WHERE SourceID = 'G')`).all() as { ShabadID: number; VerseID: number }[];
  const sabadIds = [...new Set(mapRows.map((row) => row.ShabadID))].sort((a, b) => a - b);
  const mappedLines = new Map<number, number[]>();
  for (const row of mapRows) mappedLines.set(row.ShabadID, [...(mappedLines.get(row.ShabadID) ?? []), row.VerseID]);
  // mapped = every Shabad row for the ID; joined = those resolving to a G verse in tmp_Verse.
  const allMapped = new Map<number, number>();
  for (const row of db.prepare(`SELECT ShabadID, COUNT(*) AS n FROM Shabad
    WHERE ShabadID IN (SELECT DISTINCT ShabadID FROM Shabad WHERE ShabadID < ${SABAD_MAX}
      AND VerseID IN (SELECT ID FROM tmp_Verse WHERE SourceID = 'G')) GROUP BY ShabadID`).all() as { ShabadID: number; n: number }[]) {
    allMapped.set(row.ShabadID, row.n);
  }
  const partialSabads = sabadIds.filter((id) => allMapped.get(id) !== mappedLines.get(id)?.length);
  const versesPerSabad = new Map<number, number>();
  for (const row of mapRows) versesPerSabad.set(row.VerseID, (versesPerSabad.get(row.VerseID) ?? 0) + 1);
  const multiSabadVerseIds = [...versesPerSabad].filter(([, n]) => n > 1).map(([id]) => id);
  const unmappedGVerses = rows.filter((row) => !versesPerSabad.has(row.ID)).length;

  const missingUnicode = rows.filter((row) => !row.GurmukhiUni?.trim()).length;
  const nonNfc = rows.filter((row) => row.GurmukhiUni && row.GurmukhiUni !== row.GurmukhiUni.normalize("NFC")).length;

  const knownWriters = new Set((db.prepare("SELECT WriterID FROM Writer").all() as { WriterID: number }[]).map((r) => r.WriterID));
  const knownRaags = new Set((db.prepare("SELECT RaagID FROM Raag").all() as { RaagID: number }[]).map((r) => r.RaagID));
  let sabadsZeroWriters = 0, sabadsMultiWriters = 0, sabadsNullRaag = 0, sabadsWithRahao = 0, sabadsMultiAng = 0;
  const zeroWriterSabadIds: number[] = [], multiWriterSabadIds: number[] = [];
  for (const id of sabadIds) {
    const lines = (mappedLines.get(id) ?? []).map((verseId) => byId.get(verseId)!);
    const writers = new Set(lines.map((l) => l.WriterID).filter((w): w is number => w !== null));
    if (!writers.size) { sabadsZeroWriters++; zeroWriterSabadIds.push(id); }
    if (writers.size > 1) { sabadsMultiWriters++; multiWriterSabadIds.push(id); }
    if (lines.some((l) => l.RaagID === null)) sabadsNullRaag++;
    if (lines.some((l) => hasRahaoMarker(l.Gurmukhi ?? ""))) sabadsWithRahao++;
    if (new Set(lines.map((l) => l.PageNo)).size > 1) sabadsMultiAng++;
  }
  const checks = {
    id_continuous: idGaps === 0,
    all_angs_present: missingAngs.length === 0 && outOfRangeAngRows === 0,
    all_sabads_fully_mapped: partialSabads.length === 0 && unmappedGVerses === 0,
    unicode_present_and_nfc: missingUnicode === 0 && nonNfc === 0,
  };
  return {
    status: Object.values(checks).every(Boolean) ? "pass" as const : "fail" as const,
    checks,
    g_rows: rows.length, first_id: ids[0] ?? null, last_id: ids.at(-1) ?? null, id_gaps: idGaps,
    angs_present: angRows.size, missing_angs: missingAngs, out_of_range_ang_rows: outOfRangeAngRows,
    line_no_anomalies: { angs_missing_or_invalid: angsMissingLineNo, angs_with_shared_line_no_informational: angsSharedLineNo, angs_not_increasing_with_id: angsLineNoNotIncreasing },
    sabads: sabadIds.length, sabads_not_fully_mapped: partialSabads.length, unmapped_g_verses: unmappedGVerses,
    verses_mapped_to_multiple_sabads: multiSabadVerseIds.length,
    multi_sabad_verse_ids_sample: multiSabadVerseIds.slice(0, 10),
    sabads_spanning_multiple_angs: sabadsMultiAng,
    missing_unicode_rows: missingUnicode, non_nfc_rows: nonNfc,
    metadata_gaps: {
      lines_null_writer: rows.filter((r) => r.WriterID === null).length,
      lines_unknown_writer_id: rows.filter((r) => r.WriterID !== null && !knownWriters.has(r.WriterID)).length,
      lines_null_raag: rows.filter((r) => r.RaagID === null).length,
      lines_unknown_raag_id: rows.filter((r) => r.RaagID !== null && !knownRaags.has(r.RaagID)).length,
      sabads_zero_writers: sabadsZeroWriters, zero_writer_sabad_ids: zeroWriterSabadIds,
      sabads_multiple_writers: sabadsMultiWriters, multiple_writer_sabad_ids: multiWriterSabadIds,
      sabads_with_null_raag_line: sabadsNullRaag,
    },
    sabads_with_rahao_marker: sabadsWithRahao,
    updated_stamps: db.prepare("SELECT Updated AS stamp, COUNT(*) AS rows FROM tmp_Verse WHERE SourceID = 'G' GROUP BY Updated ORDER BY rows DESC LIMIT 5").all(),
  };
}

export function readLocalSabad(db: Database.Database, shabadId: number): LocalSabad {
  const rows = db.prepare(`SELECT t.ID, t.GurmukhiUni FROM Shabad s JOIN tmp_Verse t ON t.ID = s.VerseID
    WHERE s.ShabadID = ? ORDER BY t.ID`).all(shabadId) as { ID: number; GurmukhiUni: string }[];
  return { ids: rows.map((r) => r.ID), texts: rows.map((r) => r.GurmukhiUni.normalize("NFC")) };
}

// Deterministic: every Nth Sabad plus the Sabads touching ang 1 and ang 1430.
export function pickSample(db: Database.Database, target = 40) {
  const all = (db.prepare(`SELECT DISTINCT s.ShabadID FROM Shabad s JOIN tmp_Verse t ON t.ID = s.VerseID
    WHERE t.SourceID = 'G' AND s.ShabadID < ${SABAD_MAX} ORDER BY s.ShabadID`).all() as { ShabadID: number }[]).map((r) => r.ShabadID);
  const step = Math.max(1, Math.floor(all.length / target));
  const ends = (db.prepare(`SELECT DISTINCT s.ShabadID FROM Shabad s JOIN tmp_Verse t ON t.ID = s.VerseID
    WHERE t.SourceID = 'G' AND s.ShabadID < ${SABAD_MAX} AND t.PageNo IN (1, 1430)`).all() as { ShabadID: number }[]).map((r) => r.ShabadID);
  return [...new Set([...all.filter((_, i) => i % step === 0), ...ends])].sort((a, b) => a - b);
}

// Levenshtein distance over code points; lines are short.
export function charDiff(a: string, b: string): number {
  const x = Array.from(a), y = Array.from(b);
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length];
}

export function compareSabad(shabadId: number, local: LocalSabad, live: LiveSabad) {
  const sameSet = local.ids.length === live.ids.length && [...local.ids].sort().join() === [...live.ids].sort().join();
  const idsMatch = local.ids.join() === live.ids.join();
  const mismatchedLineIds: number[] = [];
  let totalCharDiff = 0, reorderedOnly = 0;
  const liveText = new Map(live.ids.map((id, i) => [id, live.texts[i].normalize("NFC")]));
  local.ids.forEach((id, i) => {
    const other = liveText.get(id);
    if (other === undefined) return;
    if (other !== local.texts[i]) {
      mismatchedLineIds.push(id); totalCharDiff += charDiff(local.texts[i], other);
      // Same code points in a different order (for example two adjacent combining marks swapped).
      if (Array.from(other).sort().join("") === Array.from(local.texts[i]).sort().join("")) reorderedOnly++;
    }
  });
  const match = idsMatch && mismatchedLineIds.length === 0;
  return {
    shabad_id: shabadId, result: match ? "match" as const : "mismatch" as const,
    local_lines: local.ids.length, live_lines: live.ids.length,
    id_list_match: idsMatch, id_set_match: sameSet,
    mismatched_line_ids: mismatchedLineIds, char_diff_total: totalCharDiff,
    mismatched_lines_reordered_code_points_only: reorderedOnly,
  };
}

const liveSchema = z.object({
  verses: z.array(z.object({ verseId: z.number().int(), verse: z.object({ unicode: z.string() }) })).min(1),
});

export async function fetchLiveSabad(shabadId: number, fetchImpl: typeof fetch = fetch): Promise<LiveSabad> {
  const response = await fetchImpl(`${LIVE_URL}${shabadId}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new HttpError(response.status);
  const api = liveSchema.parse(await response.json());
  return { ids: api.verses.map((v) => v.verseId), texts: api.verses.map((v) => v.verse.unicode) };
}

class HttpError extends Error {
  constructor(public status: number) { super(`BaniDB returned HTTP ${status}.`); }
}

export async function runLiveCheck(db: Database.Database, sample: number[], fetchImpl: typeof fetch = fetch, delayMs = 250) {
  const results: (ReturnType<typeof compareSabad> | { shabad_id: number; result: "error"; error: string })[] = [];
  for (const id of sample) {
    if (results.length) await new Promise((r) => setTimeout(r, delayMs));
    try {
      results.push(compareSabad(id, readLocalSabad(db, id), await fetchLiveSabad(id, fetchImpl)));
    } catch (error) {
      // A network failure before any response means the API is unreachable, not that data differs.
      if (!(error instanceof HttpError) && !(error instanceof z.ZodError) && !results.length) {
        return { live_check: "unavailable" as const, error: error instanceof Error ? error.message : "request failed", sample_size: sample.length, results: [] };
      }
      results.push({ shabad_id: id, result: "error", error: error instanceof z.ZodError ? "Unexpected API payload shape." : error instanceof Error ? error.message : "request failed" });
    }
  }
  const matched = results.filter((r) => r.result === "match").length;
  return { live_check: "done" as const, sample_size: sample.length, matched, parity: `${matched}/${sample.length}`, results };
}

function assertGitManagedOrIgnored(root: string, path: string) {
  try { execFileSync("git", ["check-ignore", "-q", "--", path], { cwd: root }); }
  catch { execFileSync("git", ["ls-files", "--error-unmatch", "--", path], { cwd: root, stdio: "ignore" }); }
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const sourcePath = "data/banidb/banidb-upload.sqlite";
  const reportPath = "data/banidb/coverage-audit.json";
  assertGitManagedOrIgnored(root, reportPath);
  const db = new Database(resolve(root, sourcePath), { readonly: true, fileMustExist: true });
  let internal: ReturnType<typeof auditInternalConsistency>;
  let live: Awaited<ReturnType<typeof runLiveCheck>>;
  try {
    internal = auditInternalConsistency(db);
    live = await runLiveCheck(db, pickSample(db));
  } finally {
    db.close();
  }
  const parity = live.live_check === "done" ? live.parity : "unavailable";
  const summary = {
    audited_at: new Date().toISOString(),
    source: sourcePath,
    internal_consistency: internal.status,
    live_sample_parity: parity,
    sabads: internal.sabads, g_rows: internal.g_rows,
    verses_mapped_to_multiple_sabads: internal.verses_mapped_to_multiple_sabads,
    limitation: "Internal consistency and a small live sample do not establish that the copy is current (see updated_stamps in the report) or that it holds every composition.",
  };
  await writeFile(resolve(root, reportPath), JSON.stringify({ summary, internal, live }, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify(summary));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "BaniDB coverage audit failed.");
    process.exitCode = 1;
  });
}
