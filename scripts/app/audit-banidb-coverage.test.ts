import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { auditInternalConsistency, charDiff, compareSabad, pickSample, runLiveCheck } from "./audit-banidb-coverage";

// Placeholder ASCII only; no Gurmukhi in tests.
function fixtureDb(opts: { dropVerse2?: boolean; nonNfc?: boolean } = {}) {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE tmp_Verse (ID INTEGER PRIMARY KEY, Gurmukhi TEXT, GurmukhiUni TEXT, WriterID INTEGER, RaagID INTEGER,
      PageNo INTEGER, "LineNo" INTEGER, SourceID TEXT, Updated TEXT);
    CREATE TABLE Shabad (VerseID INTEGER, ShabadID INTEGER, PRIMARY KEY (VerseID, ShabadID));
    CREATE TABLE Writer (WriterID INTEGER PRIMARY KEY); CREATE TABLE Raag (RaagID INTEGER PRIMARY KEY);
    INSERT INTO Writer VALUES (1); INSERT INTO Raag VALUES (1);`);
  const insert = db.prepare("INSERT INTO tmp_Verse VALUES (?, ?, ?, ?, 1, ?, ?, 'G', '2019-12-03')");
  insert.run(1, "a ]rhwau]", opts.nonNfc ? "é" : "text-1", 1, 1, 1);
  if (!opts.dropVerse2) insert.run(2, "b", "text-2", null, 1, 2);
  insert.run(3, "c", "text-3", null, 2, 1);
  db.prepare("INSERT INTO Shabad VALUES (?, ?)").run(1, 10);
  db.prepare("INSERT INTO Shabad VALUES (?, ?)").run(2, 10);
  db.prepare("INSERT INTO Shabad VALUES (?, ?)").run(3, 11);
  return db;
}

describe("BaniDB coverage audit", () => {
  it("reports consistency, metadata gaps and Rahao counts", () => {
    const report = auditInternalConsistency(fixtureDb());
    expect(report.sabads).toBe(2);
    expect(report.sabads_with_rahao_marker).toBe(1);
    expect(report.metadata_gaps.sabads_zero_writers).toBe(1);
    expect(report.metadata_gaps.lines_null_writer).toBe(2);
    expect(report.verses_mapped_to_multiple_sabads).toBe(0);
    expect(report.id_gaps).toBe(0);
    expect(report.status).toBe("fail"); // only 2 of 1430 angs exist in the fixture
    expect(report.checks.all_sabads_fully_mapped).toBe(true);
  });

  it("flags a mapped verse that is missing, a non-NFC string and a verse in two Sabads", () => {
    const missing = auditInternalConsistency(fixtureDb({ dropVerse2: true }));
    expect(missing.checks.id_continuous).toBe(false);
    expect(missing.sabads_not_fully_mapped).toBe(1);
    const nonNfc = auditInternalConsistency(fixtureDb({ nonNfc: true }));
    expect(nonNfc.non_nfc_rows).toBe(1);
    const db = fixtureDb();
    db.prepare("INSERT INTO Shabad VALUES (3, 10)").run();
    expect(auditInternalConsistency(db).verses_mapped_to_multiple_sabads).toBe(1);
  });

  it("compares live and local Sabads by ID and text without exposing the text", () => {
    const local = { ids: [1, 2], texts: ["abc", "xyz"] };
    expect(compareSabad(10, local, local).result).toBe("match");
    const diff = compareSabad(10, local, { ids: [1, 2], texts: ["abd", "xyz"] });
    expect(diff).toMatchObject({ result: "mismatch", mismatched_line_ids: [1], char_diff_total: 1 });
    expect(JSON.stringify(diff)).not.toContain("abd");
    expect(compareSabad(10, local, { ids: [1, 2], texts: ["acb", "xyz"] }).mismatched_lines_reordered_code_points_only).toBe(1);
    expect(compareSabad(10, local, { ids: [2, 1], texts: ["xyz", "abc"] })).toMatchObject({ id_list_match: false, id_set_match: true });
    expect(charDiff("kitten", "sitting")).toBe(3);
  });

  it("picks a deterministic sample including the first and last ang", () => {
    const db = fixtureDb();
    expect(pickSample(db, 40)).toEqual([10, 11]);
  });

  it("runs the live check with a stubbed fetch and reports unavailability", async () => {
    const db = fixtureDb();
    const ok = (async (url: string) => {
      const id = Number(String(url).split("/").pop());
      const rows = id === 10 ? [[1, "text-1"], [2, "text-2"]] : [[3, "changed"]];
      return new Response(JSON.stringify({ verses: rows.map(([verseId, unicode]) => ({ verseId, verse: { unicode } })) }));
    }) as unknown as typeof fetch;
    const done = await runLiveCheck(db, [10, 11], ok, 0);
    expect(done).toMatchObject({ live_check: "done", parity: "1/2" });
    const down = await runLiveCheck(db, [10, 11], (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch, 0);
    expect(down).toMatchObject({ live_check: "unavailable", error: "fetch failed" });
  });
});
