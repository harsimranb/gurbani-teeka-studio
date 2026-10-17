import { rulesFixture } from "../contracts/fixtures";
import {
  SabadSchema,
  type CheckRun, type Decision, type Draft, type DriftResult, type Finding, type Proposal, type PublishGate, type Reference, type Rule, type Sabad,
} from "../contracts/domain";
import { notifyDataChanged } from "./events";

/**
 * MOCK ONLY (FE-02). Module-level store for the stateful mock API.
 * Persisted to localStorage in the browser and kept in memory under Node/SSR.
 * Real persistence and reads are API-02/API-04; nothing here is a contract.
 */
export const MOCK_STORE_KEY = "eko.mock.v1";
export const MOCK_EVAL_KEY = "eko.mock.eval";
export type MockEvalMode = "unavailable" | "synthetic";

export interface MockRefMeta {
  shabad_id: string; draft_id: string; approver: string; at: string;
  /** Gate computed just before publishing (the one that allowed it). Absent in stores saved by older builds. */
  gate?: PublishGate;
}
export interface MockCounters { draft: number; run: number; decision: number; reference: number; proposal: number; drift: number; rule: number }
export interface MockState {
  v: 1;
  drafts: Draft[];
  /** Current and cleared findings together; `state` tells them apart. */
  findings: Finding[];
  decisions: Decision[];
  runs: CheckRun[];
  references: Reference[];
  refMeta: Record<string, MockRefMeta>;
  proposals: Proposal[];
  drift: DriftResult[];
  /** Rules created by approved proposals. */
  proposalRules: Rule[];
  rulesetVersion: number;
  counters: MockCounters;
}

function freshState(): MockState {
  return {
    v: 1, drafts: [], findings: [], decisions: [], runs: [], references: [], refMeta: {}, proposals: [], drift: [], proposalRules: [],
    rulesetVersion: 1, counters: { draft: 0, run: 0, decision: 0, reference: 0, proposal: 0, drift: 0, rule: 0 },
  };
}

const hasStorage = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
let state: MockState | null = null;
/** Pending LLM runs that still have a live timer in this page load. */
export const activeRunIds = new Set<string>();

export function nowIso(): string { return new Date().toISOString(); }

export function getState(): MockState {
  if (state) return state;
  let loaded: MockState | null = null;
  if (hasStorage()) {
    try {
      const raw = window.localStorage.getItem(MOCK_STORE_KEY);
      if (raw) { const parsed = JSON.parse(raw) as MockState; if (parsed && parsed.v === 1) loaded = parsed; }
    } catch { loaded = null; }
  }
  state = loaded ?? freshState();
  // A pending run whose timer died with the previous page load can never finish; say so instead of leaving it pending.
  state.runs = state.runs.map((run) => run.status === "pending" && !activeRunIds.has(run.id)
    ? { ...run, status: "failed" as const, completed_at: nowIso(), error: "Mock check was interrupted by a page reload; run it again." } : run);
  return state;
}
export function persist(): void {
  if (!state || !hasStorage()) return;
  try { window.localStorage.setItem(MOCK_STORE_KEY, JSON.stringify(state)); } catch { /* quota or private mode: keep in memory */ }
}
export function resetMockStore(): void {
  state = freshState();
  activeRunIds.clear();
  if (hasStorage()) { try { window.localStorage.removeItem(MOCK_STORE_KEY); } catch { /* ignore */ } }
  notifyDataChanged();
}

type CounterKey = keyof MockCounters;
export function nextId(kind: CounterKey): string {
  const s = getState();
  const n = ++s.counters[kind];
  switch (kind) {
    case "reference": return `PUB-${String(n).padStart(4, "0")}`;
    case "proposal": return `PR-${String(n).padStart(3, "0")}`;
    case "rule": return `PROP-${String(n).padStart(3, "0")}`;
    case "draft": return `mock-draft-${n}`;
    case "run": return `mock-run-${n}`;
    case "decision": return `mock-dec-${n}`;
    case "drift": return `mock-drift-${n}`;
  }
}

export function currentRules(): Rule[] { return [...rulesFixture, ...getState().proposalRules]; }

// ---- Eval sample mode -------------------------------------------------------------
let evalMode: MockEvalMode = "unavailable";
let evalLoaded = false;
export function getMockEvalMode(): MockEvalMode {
  if (!evalLoaded && hasStorage()) {
    try { const v = window.localStorage.getItem(MOCK_EVAL_KEY); if (v === "synthetic" || v === "unavailable") evalMode = v; } catch { /* ignore */ }
    evalLoaded = true;
  }
  return evalMode;
}
export function setMockEvalMode(mode: MockEvalMode): void {
  evalMode = mode; evalLoaded = true;
  if (hasStorage()) { try { window.localStorage.setItem(MOCK_EVAL_KEY, mode); } catch { /* ignore */ } }
  notifyDataChanged();
}

// ---- Source text (dev route) -----------------------------------------------------
export type SabadLoad = { status: "available"; sabad: Sabad } | { status: "unavailable"; reason: string };
let sabadCache: Sabad | null = null;
let sabadInflight: Promise<SabadLoad> | null = null;

/** Test hook: inject a Sabad (or null to clear). Build it from ASCII markers, never Gurmukhi. */
export function __setMockSabadForTests(sabad: Sabad | null): void {
  sabadCache = sabad ? SabadSchema.parse(sabad) : null;
  sabadInflight = null;
}

/** Loads the Sabad from the dev route once per page load. Failures are reported, not cached, and never synthesised. */
export function loadMockSabad(): Promise<SabadLoad> {
  if (sabadCache) return Promise.resolve({ status: "available", sabad: sabadCache });
  if (sabadInflight) return sabadInflight;
  sabadInflight = (async (): Promise<SabadLoad> => {
    try {
      const response = await fetch("/api/dev/demo-sabad");
      const body = (await response.json()) as { status?: string; sabad?: unknown; reason?: unknown };
      if (body.status === "available") {
        const parsed = SabadSchema.safeParse(body.sabad);
        if (parsed.success) { sabadCache = parsed.data; return { status: "available", sabad: parsed.data }; }
        return { status: "unavailable", reason: "The demo Sabad file did not match the Sabad schema." };
      }
      return { status: "unavailable", reason: typeof body.reason === "string" && body.reason.trim() ? body.reason : "The demo Sabad is unavailable." };
    } catch {
      return { status: "unavailable", reason: "The demo Sabad could not be loaded. Provision the private BaniDB-exported fixture and run in mock mode." };
    } finally { sabadInflight = null; }
  })();
  return sabadInflight;
}

// ---- Mock-only read seams for pages that have no API route yet -------------------
/** MOCK ONLY seam: published references for a Sabad. Needs a real API route later. */
export function mockReferencesForSabad(shabadId: string): Reference[] {
  const s = getState();
  return s.references.filter((ref) => s.refMeta[ref.id]?.shabad_id === shabadId);
}
/** MOCK ONLY seam: who published a draft, and when. Needs a real API route later. */
export function mockPublication(draftId: string): { reference_id: string; approver: string; at: string; gate: PublishGate } | null {
  const s = getState();
  for (let i = s.references.length - 1; i >= 0; i--) {
    const meta = s.refMeta[s.references[i].id];
    if (meta && meta.draft_id === draftId) {
      const draft = s.drafts.find((d) => d.id === draftId);
      const gate: PublishGate = meta.gate ?? { draft_id: draftId, draft_version: draft?.version ?? 1, ruleset_version: s.rulesetVersion, can_publish: true, blockers: [], warning_ids: [] };
      return { reference_id: s.references[i].id, approver: meta.approver, at: meta.at, gate };
    }
  }
  return null;
}
