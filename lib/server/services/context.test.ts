import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ingestBanidb } from "../ingest/banidb-source";
import type { Sabad } from "../../contracts/domain";
import { __closeStoreForTests, __setSourceForTests, __setStoreForTests, demoSabadSummaries, getSourceStatus, getStore, nextId, nowIso, resetStore, seedSyntheticDrafts } from "./context";
import { openAppDb } from "../db/client";
import { listSabads } from "./drafts";
import { createMemoryRepository } from "./memory-repo";
import { makeDraft, testSabad } from "./testing";

beforeEach(() => { __setSourceForTests(testSabad()); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); __setSourceForTests(undefined); __setStoreForTests(null); });

describe("store singleton (injected memory store)", () => {
  it("seeds ruleset v1 and the injected Sabad on first use, and returns one instance", () => {
    const store = getStore();
    expect(getStore()).toBe(store);
    expect((globalThis as Record<string, unknown>).__ekoStore).toBeDefined();
    expect(store.getLatestRulesetVersion()).toBe(1);
    expect(store.getRuleset(1)).toHaveLength(66);
    expect(store.getSabad("TEST-SABAD")?.lines).toHaveLength(5);
    expect(getSourceStatus()).toEqual({ available: true });
  });
  it("resetStore clears app data in place and keeps source lines and ruleset v1", () => {
    const first = getStore();
    first.saveDraft(makeDraft());
    first.saveRuleset(2, first.getRuleset(1));
    nextId("draft");
    const fresh = resetStore();
    expect(fresh).toBe(first);
    expect(getStore()).toBe(fresh);
    expect(fresh.getDraft("draft-t1")).toBeUndefined();
    expect(fresh.getLatestRulesetVersion()).toBe(1);
    expect(fresh.getSabad("TEST-SABAD")).toBeDefined();
    expect(nextId("draft")).toBe("draft-1");
  });
  it("reports a missing source and still works with no Sabads", () => {
    __setSourceForTests(null);
    const store = getStore();
    expect(getSourceStatus()).toMatchObject({ available: false });
    expect(store.listSabads()).toEqual([]);
    expect(store.getLatestRulesetVersion()).toBe(1);
    expect(seedSyntheticDrafts()).toEqual([]);
  });
  it("lets tests install a custom store", () => {
    const custom = createMemoryRepository();
    __setStoreForTests(custom);
    expect(getStore()).toBe(custom);
    expect(getSourceStatus()).toMatchObject({ available: false });
    custom.saveSabad(testSabad());
    __setStoreForTests(custom);
    expect(getSourceStatus()).toEqual({ available: true });
  });
  it("notices Sabads that arrive after startup (for example a later pnpm ingest)", () => {
    const custom = createMemoryRepository();
    __setStoreForTests(custom);
    expect(getSourceStatus()).toMatchObject({ available: false });
    custom.saveSabad(testSabad());
    expect(getSourceStatus()).toEqual({ available: true });
  });
});

describe("nextId and nowIso", () => {
  it("issues monotonic per-kind IDs", () => {
    expect([nextId("draft"), nextId("draft"), nextId("run"), nextId("decision")]).toEqual(["draft-1", "draft-2", "run-1", "dec-1"]);
    expect([nextId("reference"), nextId("reference"), nextId("proposal"), nextId("rule"), nextId("drift")]).toEqual(["PUB-0001", "PUB-0002", "PR-001", "PROP-001", "drift-1"]);
  });
  it("returns an ISO timestamp", () => {
    expect(nowIso()).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/);
  });
});

describe("seedSyntheticDrafts", () => {
  it("creates the three labelled units on the first Sabad without running checks", () => {
    const drafts = seedSyntheticDrafts();
    expect(drafts.map((d) => d.line_ids)).toEqual([["TEST-SABAD-L1"], ["TEST-SABAD-L2", "TEST-SABAD-L3"], ["TEST-SABAD-L4"]]);
    expect(drafts.map((d) => d.id)).toEqual(["draft-1", "draft-2", "draft-3"]);
    for (const draft of drafts) {
      expect(draft).toMatchObject({ status: "draft", author: "Demo writer", version: 1, layer: "transcreation", shabad_id: "TEST-SABAD" });
      expect(draft.text.startsWith("SYNTHETIC:")).toBe(true);
      expect(getStore().getDraft(draft.id)).toEqual(draft);
      expect(getStore().listCheckRunsForDraft(draft.id)).toEqual([]);
      expect(getStore().listFindingsForDraft(draft.id)).toEqual([]);
    }
  });
  it("does nothing for lines already covered", () => {
    expect(seedSyntheticDrafts()).toHaveLength(3);
    expect(seedSyntheticDrafts()).toEqual([]);
    expect(getStore().listDraftsForSabad("TEST-SABAD")).toHaveLength(3);
  });
  it("skips only the units that overlap an existing draft", () => {
    getStore().saveDraft(makeDraft({ id: "mine", line_ids: ["TEST-SABAD-L3"] }));
    expect(seedSyntheticDrafts().map((d) => d.line_ids)).toEqual([["TEST-SABAD-L1"], ["TEST-SABAD-L4"]]);
  });
});

/** ASCII Sabad with numeric line IDs (the SQLite repository orders lines numerically). */
function numericSabad(shabadId: string, lineCount = 5): Sabad {
  return {
    shabad_id: shabadId,
    lines: Array.from({ length: lineCount }, (_, i) => ({
      line_id: String(Number(shabadId) * 100 + i + 1), shabad_id: shabadId, ang: 1, raag: "TEST-RAAG", writer: "TEST-WRITER",
      is_rahao: i === 1, gurmukhi: `TEST-SOURCE-${shabadId}-${i + 1}`,
    })),
  };
}

describe("SQLite store (temp DATABASE_URL)", () => {
  let dbDir: string;
  let cwdDir: string;
  const dbFile = () => join(dbDir, "app.db");

  beforeEach(() => {
    // The cwd is an empty temp dir, so bootstrap never reads the real private fixture.
    dbDir = mkdtempSync(join(tmpdir(), "eko-ctx-db-"));
    cwdDir = mkdtempSync(join(tmpdir(), "eko-ctx-cwd-"));
    vi.spyOn(process, "cwd").mockReturnValue(cwdDir);
    vi.stubEnv("DATABASE_URL", dbFile());
    __setSourceForTests(undefined);
  });
  afterEach(() => {
    __closeStoreForTests();
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(cwdDir, { recursive: true, force: true });
  });

  /** Writes an ASCII fixture plus a local-SQLite provenance record into the fake working directory. */
  function provisionFixture(sabad: Sabad, hash?: string): void {
    mkdirSync(join(cwdDir, "lib/contracts/fixtures"), { recursive: true });
    mkdirSync(join(cwdDir, "data/banidb"), { recursive: true });
    const bytes = JSON.stringify(sabad);
    writeFileSync(join(cwdDir, "lib/contracts/fixtures/sabad.demo.json"), bytes);
    writeFileSync(join(cwdDir, "data/banidb/export-metadata.json"), JSON.stringify({
      source: "user-provided local BaniDB SQLite copy", source_path: "data/banidb/banidb-upload.sqlite", source_table: "tmp_Verse",
      shabad_id: sabad.shabad_id, line_ids: sabad.lines.map((line) => line.line_id), line_count: sabad.lines.length,
      rahao_line_ids: sabad.lines.filter((line) => line.is_rahao).map((line) => line.line_id), normalization: "NFC",
      fixture_sha256: hash ?? createHash("sha256").update(bytes).digest("hex"),
    }));
  }

  it("refuses the default eko.db under test and a path inside the private BaniDB directory", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(() => getStore()).toThrow(/Refusing to open the default eko\.db/);
    vi.stubEnv("DATABASE_URL", "data/banidb/app.db");
    expect(() => getStore()).toThrow(/private BaniDB source directory/);
    expect(existsSync(join(cwdDir, "data/banidb/app.db"))).toBe(false);
  });

  it("bootstraps an empty database with the 66 resolved rules and reports a neutral missing-source reason", () => {
    const store = getStore();
    expect(getStore()).toBe(store);
    expect(existsSync(dbFile())).toBe(true);
    expect(store.getLatestRulesetVersion()).toBe(1);
    expect(store.getRuleset(1)).toHaveLength(66);
    expect(store.listSabads()).toEqual([]);
    expect(getSourceStatus()).toEqual({ available: false, reason: "The demo source fixture is not provisioned in this clone." });
    expect(seedSyntheticDrafts()).toEqual([]);
  });

  it("ingests a provenance-checked demo fixture on an empty database, once", () => {
    provisionFixture(numericSabad("55"));
    expect(getSourceStatus()).toEqual({ available: true });
    expect(getStore().getSabad("55")?.lines).toHaveLength(5);
    __closeStoreForTests();
    expect(getStore().listSabads()).toHaveLength(1);
    expect(getStore().getRuleset(1)).toHaveLength(66);
  });

  it("rebuilds the repository wrapper after a hot reload, reusing the open connection", () => {
    const first = getStore();
    // What an earlier module version leaves on globalThis: its own wrapper and factory, lacking newer methods.
    const cached = (globalThis as unknown as Record<string, { store: unknown; factory: unknown }>).__ekoStore;
    cached.store = {};
    cached.factory = () => ({});
    const rebuilt = getStore();
    expect(rebuilt).not.toBe(first);
    expect(typeof rebuilt.browseSabads).toBe("function");
    expect(rebuilt.getRuleset(1)).toHaveLength(66);
    expect(getStore()).toBe(rebuilt);
  });

  it("reports a provenance failure without echoing source text", () => {
    provisionFixture(numericSabad("55"), "0".repeat(64));
    expect(getSourceStatus()).toEqual({ available: false, reason: "The demo source fixture failed its provenance check." });
    expect(getStore().listSabads()).toEqual([]);
    expect(getStore().getLatestRulesetVersion()).toBe(1);
  });

  it("does not re-ingest the fixture when the database already has Sabads", () => {
    getStore().saveSabad(numericSabad("9999"));
    __closeStoreForTests();
    provisionFixture(numericSabad("55"));
    expect(getStore().listSabads().map((s) => s.shabad_id)).toEqual(["9999"]);
    expect(getSourceStatus()).toEqual({ available: true });
  });

  it("warns once, and keeps serving the stored v1, when it differs from rules.resolved.json", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getStore();
    __closeStoreForTests();
    expect(getStore().getRuleset(1)).toHaveLength(66);
    __closeStoreForTests();
    expect(warn).not.toHaveBeenCalled();
    // Simulate a regenerated rules file: the repository refuses to rewrite v1, so drop one stored rule directly.
    const raw = openAppDb(dbFile());
    raw.sqlite.prepare("DELETE FROM rules WHERE ruleset_version = 1 AND id = (SELECT id FROM rules WHERE ruleset_version = 1 LIMIT 1)").run();
    raw.sqlite.close();
    expect(getStore().getRuleset(1)).toHaveLength(65);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Stored ruleset v1 differs from rules.resolved.json; delete eko.db (or run against a fresh DATABASE_URL) to reseed.");
  });

  it("continues IDs after a restart instead of reusing them", () => {
    expect([nextId("draft"), nextId("draft"), nextId("reference"), nextId("proposal")]).toEqual(["draft-1", "draft-2", "PUB-0001", "PR-001"]);
    getStore().saveRuleset(2, getStore().getRuleset(1));
    __closeStoreForTests();
    expect((globalThis as Record<string, unknown>).__ekoStore).toBeUndefined();
    expect([nextId("draft"), nextId("reference"), nextId("proposal"), nextId("run")]).toEqual(["draft-3", "PUB-0002", "PR-002", "run-1"]);
    expect(getStore().getLatestRulesetVersion()).toBe(2);
    expect(getStore().getRuleset(1)).toHaveLength(66);
  });

  it("resetStore keeps source lines and ruleset v1, clears app data and restarts IDs", () => {
    const store = getStore();
    store.saveSabad(numericSabad("693"));
    store.saveDraft(makeDraft({ id: nextId("draft"), shabad_id: "693", line_ids: ["69301"] }));
    store.saveRuleset(2, store.getRuleset(1));
    const done = resetStore();
    expect(done).toBe(store);
    expect(store.listDraftsForSabad("693")).toEqual([]);
    expect(store.getLatestRulesetVersion()).toBe(1);
    expect(store.getRuleset(1)).toHaveLength(66);
    expect(store.getSabad("693")?.lines).toHaveLength(5);
    expect(getSourceStatus()).toEqual({ available: true });
    expect(nextId("draft")).toBe("draft-1");
    expect(existsSync(dbFile())).toBe(true);
  });

  it("offers the demo Sabads that exist, in order, else every ingested Sabad", () => {
    const store = getStore();
    store.saveSabad(numericSabad("9999"));
    expect(demoSabadSummaries().map((s) => s.shabad_id)).toEqual(["9999"]);
    store.saveSabad(numericSabad("693"));
    expect(listSabads().sabads.map((s) => s.shabad_id)).toEqual(["693"]);
    store.saveSabad(numericSabad("1356"));
    expect(listSabads().sabads.map((s) => s.shabad_id)).toEqual(["1356", "693"]);
    vi.stubEnv("EKO_DEMO_SABADS", " 9999 , 693 ,77");
    expect(listSabads().sabads.map((s) => s.shabad_id)).toEqual(["9999", "693"]);
    vi.stubEnv("EKO_DEMO_SABADS", "77");
    expect(listSabads().sabads.map((s) => s.shabad_id).sort()).toEqual(["1356", "693", "9999"]);
  });

  it("seeds the synthetic drafts on the first offered Sabad, atomically, with persistent IDs", () => {
    const store = getStore();
    store.saveSabad(numericSabad("9999"));
    store.saveSabad(numericSabad("693"));
    const drafts = seedSyntheticDrafts();
    expect(drafts.map((d) => d.id)).toEqual(["draft-1", "draft-2", "draft-3"]);
    expect(drafts.every((d) => d.shabad_id === "693")).toBe(true);
    expect(store.listDraftsForSabad("693")).toHaveLength(3);
    expect(store.listDraftsForSabad("9999")).toEqual([]);
    expect(seedSyntheticDrafts()).toEqual([]);
  });
});

// Real compact copy, so this runs only where data/banidb/banidb-upload.sqlite exists (skipped if it is not provisioned), like the
// full-corpus ingest test. The cwd is the real repository root.
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const hasLocalCopy = existsSync(join(repoRoot, "data/banidb/banidb-upload.sqlite"));

describe.skipIf(!hasLocalCopy)("empty-database bootstrap with the local BaniDB copy", () => {
  let dbDir: string;
  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "eko-ctx-full-"));
    vi.stubEnv("DATABASE_URL", join(dbDir, "app.db"));
    vi.stubEnv("BANIDB_SOURCE", "");
    __setSourceForTests(undefined);
  });
  afterEach(() => {
    __closeStoreForTests();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("loads the full corpus once, and a later pnpm ingest then inserts nothing instead of refusing", () => {
    const store = getStore();
    expect(getSourceStatus()).toEqual({ available: true });
    expect(store.listSabads().length).toBeGreaterThan(5000);
    expect(store.getLatestRulesetVersion()).toBe(1);
    __closeStoreForTests();
    const { db, sqlite } = openAppDb(join(dbDir, "app.db"));
    try {
      expect(ingestBanidb(db, repoRoot)).toMatchObject({ mode: "sqlite_full", inserted_lines: 0 });
    } finally {
      sqlite.close();
    }
  }, 60_000);

  it("bootstraps from the fixture when BANIDB_SOURCE=fixture, the same choice ingest makes", () => {
    vi.stubEnv("BANIDB_SOURCE", "fixture");
    const store = getStore();
    if (getSourceStatus().available) expect(store.listSabads()).toHaveLength(1);
    __closeStoreForTests();
    const { db, sqlite } = openAppDb(join(dbDir, "app.db"));
    try {
      expect(ingestBanidb(db, repoRoot)).toMatchObject({ mode: "demo_fixture", inserted_lines: 0 });
    } finally {
      sqlite.close();
    }
  }, 60_000);
});
