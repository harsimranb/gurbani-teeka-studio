import { readFileSync } from "node:fs";
import path from "node:path";
import { SabadSchema, type Draft, type Sabad } from "../../contracts/domain";
import { rulesFixture } from "../../contracts/fixtures";
import { createMemoryRepository, type AppStore } from "./memory-repo";

/**
 * Process-wide service context: the in-memory store, ID counters and source status.
 * One instance lives on globalThis so it survives Next dev hot reload; it resets on server restart.
 */
export type SourceStatus = { available: true } | { available: false; reason: string };
export type IdKind = "draft" | "run" | "decision" | "reference" | "proposal" | "rule" | "drift";

interface Holder { store: AppStore; counters: Record<IdKind, number>; source: SourceStatus }
const HOLDER_KEY = "__ekoStore";
const globals = globalThis as unknown as Record<string, Holder | undefined>;

const DEMO_SABAD_PATH = "lib/contracts/fixtures/sabad.demo.json";
/** `undefined` = read the private file; a Sabad = injected (tests); `null` = simulate a missing source (tests). */
let sourceOverride: Sabad | null | undefined;

// SYNTHETIC demo text, mirroring lib/client/mock-handler.ts SEED_TEXT. Labelled, never real translation.
const SYNTHETIC_TEXT = {
  A: "SYNTHETIC: placeholder sentence that praises the Lord (marker) for test purposes.",
  B: "SYNTHETIC: placeholder sentence about the Name, addressed unto the reader.",
  C: "SYNTHETIC: placeholder sentence with no planted markers.",
};

export const nowIso = (): string => new Date().toISOString();

function loadSource(): { sabad: Sabad } | { reason: string } {
  if (sourceOverride !== undefined) {
    return sourceOverride === null ? { reason: "Source unavailable (test hook)." } : { sabad: SabadSchema.parse(sourceOverride) };
  }
  let raw: string;
  try {
    raw = readFileSync(path.join(process.cwd(), DEMO_SABAD_PATH), "utf8");
  } catch {
    return { reason: "The private demo Sabad fixture is not provisioned in this clone." };
  }
  try {
    const parsed = SabadSchema.safeParse(JSON.parse(raw));
    // Never echo validation detail: it could quote source text.
    return parsed.success ? { sabad: parsed.data } : { reason: "The demo Sabad file does not match the Sabad schema." };
  } catch {
    return { reason: "The demo Sabad file is not valid JSON." };
  }
}

const freshCounters = (): Record<IdKind, number> => ({ draft: 0, run: 0, decision: 0, reference: 0, proposal: 0, rule: 0, drift: 0 });

function build(): Holder {
  const store = createMemoryRepository();
  store.saveRuleset(1, rulesFixture);
  const loaded = loadSource();
  let source: SourceStatus = { available: true };
  if ("sabad" in loaded) store.saveSabad(loaded.sabad);
  else source = { available: false, reason: loaded.reason };
  return { store, counters: freshCounters(), source };
}

function holder(): Holder {
  return (globals[HOLDER_KEY] ??= build());
}

/** The singleton store. Seeds ruleset v1 and the source Sabad on first use. */
export function getStore(): AppStore { return holder().store; }

export function getSourceStatus(): SourceStatus { return holder().source; }

/** Builds a fresh store: ruleset v1 re-seeded, source reloaded, counters restarted. */
export function resetStore(): AppStore {
  globals[HOLDER_KEY] = undefined;
  return getStore();
}

/**
 * Test hook: use this store (e.g. an empty memory repo), or null to rebuild lazily. Counters restart.
 * A custom store counts as source-available when it holds at least one Sabad.
 */
export function __setStoreForTests(store: AppStore | null): void {
  globals[HOLDER_KEY] = store === null ? undefined : {
    store, counters: freshCounters(),
    source: store.listSabads().length ? { available: true } : { available: false, reason: "No source Sabad is loaded." },
  };
}

/**
 * Test hook for the source Sabad; rebuilds the store. Build the Sabad from ASCII markers, never Gurmukhi.
 * Pass a Sabad to inject it, `null` to simulate a missing source, `undefined` to read the private file again.
 */
export function __setSourceForTests(sabad: Sabad | null | undefined): void {
  sourceOverride = sabad;
  globals[HOLDER_KEY] = undefined;
}

/** Monotonic IDs per kind: draft-1, run-1, dec-1, PUB-0001 (reference), PR-001 (proposal), PROP-001 (rule), drift-1. */
export function nextId(kind: IdKind): string {
  const n = ++holder().counters[kind];
  switch (kind) {
    case "reference": return `PUB-${String(n).padStart(4, "0")}`;
    case "proposal": return `PR-${String(n).padStart(3, "0")}`;
    case "rule": return `PROP-${String(n).padStart(3, "0")}`;
    case "decision": return `dec-${n}`;
    default: return `${kind}-${n}`;
  }
}

/**
 * Dev only: adds the three labelled SYNTHETIC drafts to the FIRST Sabad: A = line 1, B = lines 2+3, C = line 4.
 * A unit is skipped when any of its lines is already covered by a draft. Runs no checks. Returns the drafts created.
 */
export function seedSyntheticDrafts(): Draft[] {
  const store = getStore();
  const first = store.listSabads()[0];
  const sabad = first && store.getSabad(first.shabad_id);
  if (!sabad) return [];
  const ids = sabad.lines.map((line) => line.line_id);
  const covered = new Set(store.listDraftsForSabad(sabad.shabad_id).flatMap((draft) => draft.line_ids));
  const units: Array<[string[], string]> = [[[ids[0]], SYNTHETIC_TEXT.A], [[ids[1], ids[2]], SYNTHETIC_TEXT.B], [[ids[3]], SYNTHETIC_TEXT.C]];
  const created: Draft[] = [];
  for (const [lineIds, text] of units) {
    if (lineIds.some((id) => !id || covered.has(id))) continue;
    const draft: Draft = {
      id: nextId("draft"), shabad_id: sabad.shabad_id, line_ids: lineIds, layer: "transcreation", text,
      author: "Demo writer", status: "draft", version: 1, updated_at: nowIso(),
    };
    store.saveDraft(draft);
    created.push(draft);
  }
  return created;
}
