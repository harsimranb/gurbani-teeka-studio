import path from "node:path";
import { SabadSchema, type Draft, type Sabad } from "../../contracts/domain";
import { rulesFixture } from "../../contracts/fixtures";
import { assertPrivateAppDbPath, migrateAppDb, openAppDb } from "../db/client";
import { createRepository } from "../db/repo";
import { ingestDemoSabad } from "../ingest/banidb";
import { seedResolvedRules } from "../ingest/rules";
import { createMemoryRepository, type AppStore } from "./memory-repo";

/**
 * Process-wide service context: the store and source status.
 * Normally the store is the SQLite database (`DATABASE_URL`, default `eko.db`), opened once, migrated and
 * bootstrapped, then cached on globalThis so it survives Next dev hot reload. Tests inject an in-memory
 * repository instead (`__setStoreForTests` / `__setSourceForTests`) and never touch SQLite.
 */
export type SourceStatus = { available: true } | { available: false; reason: string };
export type IdKind = "draft" | "run" | "decision" | "reference" | "proposal" | "rule" | "drift";

interface Holder { store: AppStore; source: SourceStatus; close?: () => void }
const HOLDER_KEY = "__ekoStore";
const globals = globalThis as unknown as Record<string, Holder | undefined>;

const DEMO_SABAD_PATH = "lib/contracts/fixtures/sabad.demo.json";
const DEMO_METADATA_PATH = "data/banidb/export-metadata.json";
/** D-88 demo Sabads, in display order. `EKO_DEMO_SABADS` (comma-separated) overrides. */
const DEFAULT_DEMO_SABADS = ["1356", "1568", "693"];
/** `undefined` = open SQLite; a Sabad = injected memory store (tests); `null` = memory store with no source (tests). */
let sourceOverride: Sabad | null | undefined;

// SYNTHETIC demo text, mirroring lib/client/mock-handler.ts SEED_TEXT. Labelled, never real translation.
const SYNTHETIC_TEXT = {
  A: "SYNTHETIC: placeholder sentence that praises the Lord (marker) for test purposes.",
  B: "SYNTHETIC: placeholder sentence about the Name, addressed unto the reader.",
  C: "SYNTHETIC: placeholder sentence with no planted markers.",
};

export const nowIso = (): string => new Date().toISOString();

/** Neutral, source-text-free reason for a failed demo ingest. */
function ingestFailureReason(error: unknown): string {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT"
    ? "The demo source fixture is not provisioned in this clone."
    : "The demo source fixture failed its provenance check.";
}

function buildMemory(): Holder {
  const store = createMemoryRepository();
  store.saveRuleset(1, rulesFixture);
  if (sourceOverride === null) return { store, source: { available: false, reason: "Source unavailable (test hook)." } };
  store.saveSabad(SabadSchema.parse(sourceOverride));
  return { store, source: { available: true } };
}

function buildSqlite(): Holder {
  const root = process.cwd();
  // Tests must name a temp database; never fall back to the real eko.db under vitest.
  if (process.env.NODE_ENV === "test" && !process.env.DATABASE_URL) {
    throw new Error("Refusing to open the default eko.db in a test; set DATABASE_URL to a temp file or inject a store.");
  }
  const target = path.resolve(root, process.env.DATABASE_URL || "eko.db");
  assertPrivateAppDbPath(root, target);
  const { sqlite, db } = openAppDb(target);
  try {
    migrateAppDb(db);
    const store = createRepository(db);
    if (store.getLatestRulesetVersion() === undefined) seedResolvedRules(store);
    let source: SourceStatus = { available: true };
    if (store.listSabads().length === 0) {
      try {
        ingestDemoSabad(store, path.join(root, DEMO_SABAD_PATH), path.join(root, DEMO_METADATA_PATH));
      } catch (error) {
        source = { available: false, reason: ingestFailureReason(error) };
      }
    }
    return { store, source, close: () => { if (sqlite.open) sqlite.close(); } };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

function holder(): Holder {
  return (globals[HOLDER_KEY] ??= sourceOverride === undefined ? buildSqlite() : buildMemory());
}

function dropHolder(): void {
  const current = globals[HOLDER_KEY];
  globals[HOLDER_KEY] = undefined;
  current?.close?.();
}

/** The singleton store: SQLite in the app, an in-memory repository when a test hook is set. */
export function getStore(): AppStore { return holder().store; }

/** Available iff at least one Sabad is stored (so a later `pnpm ingest` is picked up without a restart). */
export function getSourceStatus(): SourceStatus {
  const current = holder();
  if (!current.source.available && current.store.listSabads().length > 0) current.source = { available: true };
  return current.source;
}

/** Dev reset: clears app data (drafts, runs, decisions, proposals, rulesets above v1, ID sequences). Source lines and v1 stay. */
export function resetStore(): AppStore {
  const store = getStore();
  store.resetAppData();
  return store;
}

/**
 * Test hook: use this store (e.g. an empty memory repo), or null to rebuild lazily.
 * A custom store counts as source-available when it holds at least one Sabad.
 */
export function __setStoreForTests(store: AppStore | null): void {
  dropHolder();
  if (store === null) return;
  globals[HOLDER_KEY] = {
    store,
    source: store.listSabads().length ? { available: true } : { available: false, reason: "No source Sabad is loaded." },
  };
}

/**
 * Test hook for the source Sabad; installs a fresh in-memory store. Build the Sabad from ASCII markers, never Gurmukhi.
 * Pass a Sabad to inject it, `null` to simulate a missing source, `undefined` to go back to the SQLite database.
 */
export function __setSourceForTests(sabad: Sabad | null | undefined): void {
  sourceOverride = sabad;
  dropHolder();
}

/** Test hook: closes the SQLite handle (needed before deleting the file on Windows) and drops the cached store, so the next `getStore()` reopens. */
export function __closeStoreForTests(): void { dropHolder(); }

/**
 * Persistent IDs per kind: draft-1, run-1, dec-1, PUB-0001 (reference), PR-001 (proposal), PROP-001 (rule), drift-1.
 * Never reused after a restart. Inside `store.transaction`, pass the transaction's store.
 */
export function nextId(kind: IdKind, store: AppStore = getStore()): string {
  const n = store.nextSequence(kind);
  switch (kind) {
    case "reference": return `PUB-${String(n).padStart(4, "0")}`;
    case "proposal": return `PR-${String(n).padStart(3, "0")}`;
    case "rule": return `PROP-${String(n).padStart(3, "0")}`;
    case "decision": return `dec-${n}`;
    default: return `${kind}-${n}`;
  }
}

/**
 * The Sabads to offer: the demo list (`EKO_DEMO_SABADS`, else D-88's 1356, 1568, 693) that exist, in that order;
 * when none exist, every ingested Sabad.
 */
export function demoSabadSummaries(store: AppStore = getStore()): ReturnType<AppStore["listSabads"]> {
  const configured = (process.env.EKO_DEMO_SABADS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const wanted = configured.length ? configured : DEFAULT_DEMO_SABADS;
  const all = store.listSabads();
  const byId = new Map(all.map((summary) => [summary.shabad_id, summary]));
  const demo = [...new Set(wanted)].flatMap((id) => byId.get(id) ?? []);
  return demo.length ? demo : all;
}

/**
 * Dev only: adds the three labelled SYNTHETIC drafts to the FIRST offered Sabad: A = line 1, B = lines 2+3, C = line 4.
 * A unit is skipped when any of its lines is already covered by a draft. Runs no checks. Returns the drafts created.
 */
export function seedSyntheticDrafts(): Draft[] {
  const store = getStore();
  const first = demoSabadSummaries(store)[0];
  const sabad = first && store.getSabad(first.shabad_id);
  if (!sabad) return [];
  const ids = sabad.lines.map((line) => line.line_id);
  const covered = new Set(store.listDraftsForSabad(sabad.shabad_id).flatMap((draft) => draft.line_ids));
  const units: Array<[string[], string]> = [[[ids[0]], SYNTHETIC_TEXT.A], [[ids[1], ids[2]], SYNTHETIC_TEXT.B], [[ids[3]], SYNTHETIC_TEXT.C]];
  return store.transaction((tx) => {
    const created: Draft[] = [];
    for (const [lineIds, text] of units) {
      if (lineIds.some((id) => !id || covered.has(id))) continue;
      const draft: Draft = {
        id: nextId("draft", tx), shabad_id: sabad.shabad_id, line_ids: lineIds, layer: "transcreation", text,
        author: "Demo writer", status: "draft", version: 1, updated_at: nowIso(),
      };
      tx.saveDraft(draft);
      created.push(draft);
    }
    return created;
  });
}
