import { routes, type ApiError, type ApiRequest, type ApiResponse, type RouteName } from "../contracts/api";
import { evalFixture } from "../contracts/fixtures";
import {
  DriftResultSchema,
  isGurmukhiNumericToken, type CheckRun, type Decision, type Draft, type DriftResult, type Finding, type Proposal, type PublishGate, type Reference, type Rule, type Sabad,
} from "../contracts/domain";
import { notifyDataChanged } from "./events";
import { runMockChecks, type MockPhase } from "./mock-checks";
import { activeRunIds, currentRules, getMockEvalMode, getState, loadMockSabad, nextId, nowIso, persist, rulesForVersion } from "./mock-store";

/**
 * MOCK ONLY (FE-02). Stateful stand-in for the real API. Semantics here are a UI aid:
 * API-02 (reads), API-04 (services) and the engine own the real behaviour.
 * Every response is validated by the client against `routes[name].response`.
 */
export { __setMockSabadForTests, resetMockStore, setMockEvalMode, getMockEvalMode, mockReferencesForSabad, mockPublication } from "./mock-store";

let delays = { code: 300, llm: 2500 };
/** Test hook: shorten (or zero) the simulated check latency. */
export function __setMockDelaysForTests(next: Partial<typeof delays>): void { delays = { ...delays, ...next }; }
const sleep = (ms: number) => (ms <= 0 ? Promise.resolve() : new Promise<void>((resolve) => setTimeout(resolve, ms)));

const err = (code: ApiError["error"]["code"], reason: string, blockers?: ApiError["error"]["blockers"]): ApiError =>
  ({ error: { code, reason, ...(blockers ? { blockers } : {}) } });
const blank = (value: string) => value.trim().length === 0;
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value, i) => value === b[i]);

const SEED_TEXT = {
  A: "SYNTHETIC: placeholder sentence that praises the Lord (marker) for test purposes.",
  B: "SYNTHETIC: placeholder sentence about the Name, addressed unto the reader.",
  C: "SYNTHETIC: placeholder sentence with no planted markers.",
};

// ---- helpers ---------------------------------------------------------------------
function findDraft(id: string): Draft | undefined { return getState().drafts.find((draft) => draft.id === id); }
const phaseLayer = (phase: MockPhase) => (phase === "code" ? "L1" : "L2");

function clearFindings(predicate: (finding: Finding) => boolean): void {
  const s = getState();
  const at = nowIso();
  s.findings = s.findings.map((finding) => (finding.state === "current" && predicate(finding) ? { ...finding, state: "cleared" as const, cleared_at: at } : finding));
}
function currentFindings(draft: Draft, rulesetVersion = getState().rulesetVersion): Finding[] {
  const s = getState();
  return s.findings.filter((f) => f.draft_id === draft.id && f.state === "current" && f.draft_version === draft.version && f.ruleset_version === rulesetVersion);
}
function latestRun(draft: Draft, phase: MockPhase): CheckRun | undefined {
  const s = getState();
  return [...s.runs].reverse().find((run) => run.draft_id === draft.id && run.phase === phase && run.draft_version === draft.version && run.ruleset_version === s.rulesetVersion);
}
function computeGate(draft: Draft, resolvedDepartures: Set<string>): PublishGate {
  const s = getState();
  const blockers: PublishGate["blockers"] = [];
  if (draft.layer !== "transcreation") blockers.push({ kind: "layer_unavailable", draft_id: draft.id, layer: draft.layer });
  const findings = currentFindings(draft);
  for (const f of findings) {
    if (f.rule_id === "CONS-01") { if (!resolvedDepartures.has(f.id)) blockers.push({ kind: "departure_reason", finding_id: f.id, rule_id: "CONS-01" }); continue; }
    if (f.severity === "error" || f.severity === "flag") blockers.push({ kind: "finding", finding_id: f.id, rule_id: f.rule_id, severity: f.severity });
  }
  for (const phase of ["code", "llm"] as const) {
    const run = latestRun(draft, phase);
    if (!run) blockers.push({ kind: "check_phase", draft_id: draft.id, phase, status: "missing" });
    else if (run.status !== "succeeded") blockers.push({ kind: "check_phase", draft_id: draft.id, phase, status: run.status });
  }
  return {
    draft_id: draft.id, draft_version: draft.version, ruleset_version: s.rulesetVersion, can_publish: blockers.length === 0, blockers,
    warning_ids: findings.filter((f) => f.severity === "warning").map((f) => f.id),
  };
}

/** Run the synthetic checker for one draft and phase, replacing that phase's current findings and run. */
function applyCheck(draft: Draft, phase: MockPhase, startedAt: string, runId?: string): { run: CheckRun; findings: Finding[]; notEvaluable: CheckRun["not_evaluable"] } {
  const s = getState();
  const raw = runMockChecks([draft], currentRules(), s.rulesetVersion, phase);
  // A finding already overridden or waived at this exact draft/ruleset version stays cleared.
  const clearedIds = new Set(s.findings.filter((f) => f.state === "cleared").map((f) => f.id));
  const findings = raw.findings.filter((f) => !clearedIds.has(f.id));
  const layer = phaseLayer(phase);
  s.findings = s.findings.filter((f) => !(f.draft_id === draft.id && f.state === "current" && f.layer === layer));
  s.findings.push(...findings);
  const run: CheckRun = {
    id: runId ?? nextId("run"), draft_id: draft.id, draft_version: draft.version, ruleset_version: s.rulesetVersion, phase,
    status: "succeeded", started_at: startedAt, completed_at: nowIso(), error: null, cached: false, not_evaluable: raw.notEvaluable,
  };
  s.runs.push(run);
  return { run, findings, notEvaluable: raw.notEvaluable };
}

function seedIfNeeded(sabad: Sabad): void {
  const s = getState();
  if (s.drafts.some((draft) => draft.shabad_id === sabad.shabad_id)) return;
  const ids = sabad.lines.map((line) => line.line_id);
  const units: Array<[string[], string]> = [[[ids[0]], SEED_TEXT.A], [[ids[1], ids[2]], SEED_TEXT.B], [[ids[3]], SEED_TEXT.C]];
  for (const [lineIds, text] of units) {
    if (lineIds.some((id) => !id)) continue;
    const draft: Draft = {
      id: nextId("draft"), shabad_id: sabad.shabad_id, line_ids: lineIds, layer: "transcreation", text,
      author: "Demo writer", status: "ready_for_review", version: 1, updated_at: nowIso(),
    };
    s.drafts.push(draft);
    for (const phase of ["code", "llm"] as const) applyCheck(draft, phase, nowIso());
  }
}

async function requireSabad(shabadId: string): Promise<{ sabad: Sabad } | ApiError> {
  const load = await loadMockSabad();
  if (load.status === "unavailable") return err("unavailable", load.reason);
  if (load.sabad.shabad_id !== shabadId) return err("not_found", "Only the demo Sabad is available in mock mode.");
  return { sabad: load.sabad };
}
const isErr = (value: unknown): value is ApiError => typeof value === "object" && value !== null && "error" in value;

// ---- check phases ----------------------------------------------------------------
async function runPhase(phase: MockPhase, req: ApiRequest<"runCodeChecks">): Promise<ApiResponse<"runCodeChecks"> | ApiError> {
  const s = getState();
  const draft = findDraft(req.draft_id);
  if (!draft) return err("not_found", "That draft does not exist.");
  if (draft.version !== req.draft_version || s.rulesetVersion !== req.ruleset_version) return err("version_conflict", "The draft or ruleset changed; reload and run the check again.");
  const startedAt = nowIso();
  let runId: string | undefined;
  if (phase === "llm") {
    runId = nextId("run");
    s.runs = s.runs.filter((run) => !(run.draft_id === draft.id && run.phase === "llm"));
    s.runs.push({ id: runId, draft_id: draft.id, draft_version: draft.version, ruleset_version: s.rulesetVersion, phase, status: "pending", started_at: startedAt, completed_at: null, error: null, cached: false, not_evaluable: [] });
    activeRunIds.add(runId);
    persist();
    notifyDataChanged();
  }
  await sleep(delays[phase]);
  if (runId) activeRunIds.delete(runId);
  const s2 = getState();
  const now = s2.drafts.find((d) => d.id === draft.id);
  const stale = !now || now.version !== req.draft_version || s2.rulesetVersion !== req.ruleset_version || (runId !== undefined && !s2.runs.some((r) => r.id === runId && r.status === "pending"));
  if (stale || !now) {
    if (runId) s2.runs = s2.runs.filter((r) => !(r.id === runId && r.status === "pending"));
    return err("version_conflict", "The draft or ruleset changed while the check was running; the result was dropped.");
  }
  const { run, findings, notEvaluable } = applyCheck(now, phase, startedAt, runId);
  return { affected_drafts: [now], check_runs: [run], result: { findings, notEvaluable } };
}

// ---- eval ------------------------------------------------------------------------
function syntheticEval(): ApiResponse<"getEval"> {
  const s = getState();
  const rules = currentRules().filter((rule) => rule.resolution.active && rule.resolution.scope === "p0_check");
  const metric = (numerator: number, denominator: number) => ({ numerator, denominator, rate: denominator === 0 ? null : numerator / denominator });
  // Fixed, self-consistent sample: per-rule parts are an even split of the overall totals.
  const N_CORRECTIONS = 24, CAUGHT = 15, N_FINDINGS = 31, FALSE_FLAGS = 4;
  const split = (total: number, parts: number, i: number) => Math.floor(total / parts) + (i < total % parts ? 1 : 0);
  const k = rules.length;
  return {
    status: "available", id: "mock-eval-1", ruleset_version: s.rulesetVersion, at: "2026-10-16T12:00:00.000Z", data_label: "synthetic_test",
    policy: { id: "mock", description: "Synthetic UI sample only. Not measured on real reviewer corrections." },
    n_corrections: N_CORRECTIONS, n_findings: N_FINDINGS, excluded: { typos: 2, out_of_scope: 3, unmatched: 1 },
    catch_rate: metric(CAUGHT, N_CORRECTIONS), false_flag_rate: metric(FALSE_FLAGS, N_FINDINGS),
    per_rule: rules.map((rule, i) => ({
      rule_id: rule.id,
      catch_rate: metric(split(CAUGHT, k, i), split(N_CORRECTIONS, k, i)),
      false_flag_rate: metric(split(FALSE_FLAGS, k, i), split(N_FINDINGS, k, i)),
    })),
  };
}

// ---- handlers --------------------------------------------------------------------
type Handler<N extends RouteName> = (req: ApiRequest<N>) => Promise<unknown>;
const handlers: { [N in RouteName]: Handler<N> } = {
  async listSabads() {
    const load = await loadMockSabad();
    if (load.status === "unavailable") return { sabads: [] };
    const first = load.sabad.lines[0];
    return { sabads: [{ shabad_id: load.sabad.shabad_id, ang: first.ang, raag: first.raag, writer: first.writer }] };
  },
  /** MOCK ONLY: filters the one demo Sabad the mock knows; the real route queries the whole loaded corpus. */
  async browseSabads(raw) {
    const req = routes.browseSabads.request.parse(raw); // coerced fields are `unknown` on the input type
    const load = await loadMockSabad();
    if (load.status === "unavailable") return err("unavailable", load.reason);
    const { sabad } = load;
    const matches = sabad.lines.some((line) => (req.ang === undefined || line.ang === req.ang) && (req.raag === undefined || line.raag === req.raag) && (req.writer === undefined || line.writer === req.writer));
    const first = sabad.lines[0];
    const drafts = getState().drafts.filter((draft) => draft.shabad_id === sabad.shabad_id);
    const published = drafts.filter((draft) => draft.status === "published").length;
    const status = drafts.length === 0 ? "not_started" : published === drafts.length ? "published" : published > 0 ? "partly_published"
      : drafts.some((draft) => draft.status === "changes_requested") ? "changes_requested" : drafts.some((draft) => draft.status === "draft") ? "draft" : "ready_for_review";
    const all = matches ? [{
      shabad_id: sabad.shabad_id, ang: Math.min(...sabad.lines.map((line) => line.ang)), last_ang: Math.max(...sabad.lines.map((line) => line.ang)),
      raag: first.raag, writer: first.writer, line_count: sabad.lines.length, first_line_gurmukhi: first.gurmukhi, status,
    }] : [];
    const distinct = (values: string[]) => [...new Set(values)].sort();
    return {
      total: all.length, limit: req.limit, offset: req.offset, sabads: all.slice(req.offset, req.offset + req.limit),
      raags: distinct(sabad.lines.map((line) => line.raag)), writers: distinct(sabad.lines.map((line) => line.writer)),
    };
  },
  /**
   * MOCK ONLY: searches the demo Sabad's own lines. The stem key here is the surface minus its ending matra run, a stand-in
   * for the engine's tokenizer, and references are the mock's published ones. Never proposes a rendering.
   */
  async lookupWord(raw) {
    const req = routes.lookupWord.request.parse(raw);
    const load = await loadMockSabad();
    if (load.status === "unavailable") return { status: "unavailable", reason: load.reason };
    const { sabad } = load;
    const line = sabad.lines.find((candidate) => candidate.line_id === req.line_id);
    if (!line) return err("not_found", "That source line does not exist in the mock Sabad.");
    const words = (text: string) => [...text.matchAll(/\S+/gu)].map((match) => {
      const run = /[\u0A3E-\u0A4C\u0A01\u0A02\u0A70]+$/u.exec(match[0])?.[0] ?? "";
      const split = run.length > 0 && run.length < match[0].length;
      return { surface: match[0], start: match.index, stem_key: split ? match[0].slice(0, -run.length) : match[0], ending_matra: split ? run : "" };
    });
    const word = words(line.gurmukhi).find((token) => token.start === req.start);
    if (!word) return err("invalid_request", "That position is not the start of a word in this line.");
    const hits = sabad.lines.flatMap((candidate) => {
      const hit = words(candidate.gurmukhi).find((token) => token.stem_key === word.stem_key);
      return hit ? [{ line: candidate, surface: hit.surface }] : [];
    });
    const matched = new Set(hits.map((hit) => hit.line.line_id));
    const references = getState().references.flatMap((reference) => {
      const ids = reference.line_ids.filter((id) => matched.has(id));
      return ids.length > 0 ? [{ reference, ids }] : [];
    });
    return {
      status: "available",
      word: { line_id: line.line_id, shabad_id: line.shabad_id, surface: word.surface, stem_key: word.stem_key, ending_matra: word.ending_matra },
      occurrences: { total: hits.length, items: hits.slice(0, 20).map((hit) => ({ shabad_id: hit.line.shabad_id, line_id: hit.line.line_id, ang: hit.line.ang, surface: hit.surface, gurmukhi: hit.line.gurmukhi })) },
      prior_renderings: {
        total: references.length,
        items: references.slice(0, 10).map(({ reference, ids }) => ({
          reference_id: reference.id, source: reference.source, source_label: "Published in Eko (mock store)",
          line_ids: reference.line_ids, matched_line_ids: ids, english: reference.english,
        })),
      },
    };
  },
  async getSabad(req) {
    const found = await requireSabad(req.shabad_id);
    if (isErr(found)) return found.error.code === "unavailable" || found.error.code === "not_found" ? { status: "unavailable", reason: found.error.reason } : found;
    seedIfNeeded(found.sabad);
    return { status: "available", sabad: found.sabad, drafts: getState().drafts.filter((d) => d.shabad_id === found.sabad.shabad_id) };
  },
  /**
   * New draft (draft_id null): when its lines overlap existing drafts it REPLACES them (mock-only regrouping/ungrouping):
   * the overlapped drafts are removed and their current findings move to history.
   */
  async saveDraft(req) {
    const found = await requireSabad(req.shabad_id);
    if (isErr(found)) return found;
    const s = getState();
    const layer = req.layer ?? "transcreation";
    const sourceWordStart = req.source_word_start ?? null;
    const lineIds = new Set(found.sabad.lines.map((line) => line.line_id));
    if (req.line_ids.some((id) => !lineIds.has(id))) return err("invalid_request", "Every source line must belong to this Sabad.");
    if (sourceWordStart !== null) {
      if (!(layer === "annotation" || layer === "transcription") || req.line_ids.length !== 1) return err("invalid_request", "A word position needs one annotation or transcription source line.");
      const line = found.sabad.lines.find((item) => item.line_id === req.line_ids[0])!;
      const sourceToken = [...line.gurmukhi.matchAll(/\S+/gu)].find((match) => match.index === sourceWordStart)?.[0];
      const isWord = sourceToken !== undefined && !/^[\p{P}\p{S}\p{N}\u0964\u0965]+$/u.test(sourceToken);
      const isNumericTranscription = layer === "transcription" && sourceToken !== undefined && isGurmukhiNumericToken(sourceToken);
      if (!isWord && !isNumericTranscription) return err("invalid_request", "That word position does not exist in the BaniDB source line.");
    }
    if (req.draft_id === null) {
      const overlapped = s.drafts.filter((d) => d.shabad_id === req.shabad_id && d.layer === layer
        && (d.source_word_start ?? null) === sourceWordStart && d.line_ids.some((id) => req.line_ids.includes(id)));
      if (overlapped.length > 0) {
        const published = overlapped.find((draft) => draft.status === "published");
        if (published) return err("invalid_request", "This source line is part of published work; edit the published draft to reopen it instead of replacing it.");
        const gone = new Set(overlapped.map((d) => d.id));
        clearFindings((f) => gone.has(f.draft_id));
        s.drafts = s.drafts.filter((d) => !gone.has(d.id));
        s.runs = s.runs.filter((r) => !gone.has(r.draft_id));
      }
      const draft: Draft = { id: nextId("draft"), shabad_id: req.shabad_id, line_ids: req.line_ids, layer, text: req.text,
        ...(sourceWordStart === null ? {} : { source_word_start: sourceWordStart }), author: req.author, status: "draft", version: 1, updated_at: nowIso() };
      s.drafts.push(draft);
      return { draft };
    }
    const existing = findDraft(req.draft_id);
    if (!existing) return err("not_found", "That draft does not exist.");
    if (existing.shabad_id !== req.shabad_id) return err("invalid_request", "The draft belongs to a different Sabad.");
    if (existing.layer !== layer) return err("invalid_request", "A draft's layer cannot change; create a separate authored item.");
    if ((existing.source_word_start ?? null) !== sourceWordStart) return err("invalid_request", "A draft's source word cannot change; create a separate authored item.");
    if (req.expected_version !== existing.version) return err("version_conflict", "The draft changed since you loaded it; reload before saving.");
    const changed = req.text !== existing.text || !sameList(req.line_ids, existing.line_ids);
    if (!changed) return { draft: existing };
    if (!sameList(req.line_ids, existing.line_ids) && s.drafts.some((d) => d.id !== existing.id && d.layer === layer
      && (d.source_word_start ?? null) === sourceWordStart && d.line_ids.some((id) => req.line_ids.includes(id)))) {
      return err("invalid_request", "Those source lines are already covered by another draft.");
    }
    const updated: Draft = { ...existing, text: req.text, line_ids: req.line_ids, author: req.author, version: existing.version + 1, updated_at: nowIso(), status: "draft" };
    s.drafts = s.drafts.map((d) => (d.id === existing.id ? updated : d));
    clearFindings((f) => f.draft_id === existing.id);
    return { draft: updated };
  },
  async getReport(req) {
    const s = getState();
    const draft = findDraft(req.draft_id);
    if (!draft) return err("not_found", "That draft does not exist.");
    const publications = draft.status === "published" ? Object.values(s.refMeta).filter((meta) => meta.draft_id === draft.id) : [];
    const publication = publications.filter((meta) => meta.gate?.draft_version === draft.version).at(-1) ?? publications.at(-1);
    const rulesetVersion = publication?.gate?.ruleset_version ?? s.rulesetVersion;
    return {
      draft, ruleset_version: rulesetVersion, findings: currentFindings(draft, rulesetVersion),
      history: s.findings.filter((f) => f.draft_id === draft.id && f.state === "cleared"),
      decisions: s.decisions.filter((d) => d.draft_id === draft.id),
      check_runs: s.runs.filter((r) => r.draft_id === draft.id && r.draft_version === draft.version && r.ruleset_version === rulesetVersion),
    };
  },
  runCodeChecks: (req) => runPhase("code", req),
  runLlmChecks: (req) => runPhase("llm", req),
  async markReady(req) {
    const s = getState();
    const draft = findDraft(req.draft_id);
    if (!draft) return err("not_found", "That draft does not exist.");
    if (draft.version !== req.draft_version) return err("version_conflict", "The draft changed; reload before marking it ready.");
    const updated: Draft = { ...draft, status: "ready_for_review" };
    s.drafts = s.drafts.map((d) => (d.id === draft.id ? updated : d));
    return { draft: updated };
  },
  async reviewQueue() {
    return { drafts: getState().drafts.filter((d) => d.status === "ready_for_review" || d.status === "changes_requested") };
  },
  async decide(req) {
    const s = getState();
    if (blank(req.reason)) return err("invalid_request", "A written reason is required.");
    const draft = findDraft(req.draft_id);
    if (!draft) return err("not_found", "That draft does not exist.");
    const finding = s.findings.find((f) => f.id === req.finding_id && f.draft_id === req.draft_id);
    if (!finding) return err("not_found", "That finding does not exist.");
    if (draft.status === "published") return err("invalid_request", "This transcreation is published; its findings are a record. Edit the unit to reopen it before deciding.");
    if (draft.version !== req.draft_version || s.rulesetVersion !== req.ruleset_version || finding.draft_version !== req.draft_version || finding.ruleset_version !== req.ruleset_version || finding.state !== "current") {
      return err("version_conflict", "The finding is no longer current; reload the report.");
    }
    const decision: Decision = { id: nextId("decision"), finding_id: finding.id, draft_id: draft.id, draft_version: draft.version, ruleset_version: s.rulesetVersion, action: req.action, reason: req.reason, reviewer: req.reviewer, at: nowIso() };
    s.decisions.push(decision);
    let result = finding;
    if (req.action === "accept") {
      s.drafts = s.drafts.map((d) => (d.id === draft.id ? { ...d, status: "changes_requested" as const } : d));
    } else {
      result = { ...finding, state: "cleared", cleared_at: nowIso() };
      s.findings = s.findings.map((f) => (f.id === finding.id ? result : f));
    }
    return { decision, finding: result };
  },
  async getPublishGate(req) {
    const draft = findDraft(req.draft_id);
    if (!draft) return err("not_found", "That draft does not exist.");
    return computeGate(draft, new Set());
  },
  async publish(req) {
    const s = getState();
    const draft = findDraft(req.draft_id);
    if (!draft) return err("not_found", "That draft does not exist.");
    if (draft.version !== req.draft_version || s.rulesetVersion !== req.ruleset_version) return err("version_conflict", "The draft or ruleset changed; reload before publishing.");
    if (draft.status === "published") return err("invalid_request", "This draft version is already published.");
    if (blank(draft.text)) return err("invalid_request", "An empty draft cannot be published.");
    const resolved = new Set(req.departure_reasons.map((d) => d.finding_id));
    const gate = computeGate(draft, resolved);
    if (!gate.can_publish) return err("publish_blocked", "Publishing is blocked until every blocker is resolved.", gate.blockers);
    const at = nowIso();
    const published: Draft = { ...draft, status: "published" };
    s.drafts = s.drafts.map((d) => (d.id === draft.id ? published : d));
    const exceptions: Reference["exceptions"] = [];
    for (const decision of s.decisions.filter((d) => d.draft_id === draft.id && d.draft_version === draft.version && (d.action === "override" || d.action === "waive"))) {
      const finding = s.findings.find((f) => f.id === decision.finding_id);
      if (finding) exceptions.push({ rule_id: finding.rule_id, decision_id: decision.id, action: decision.action as "override" | "waive", reason: decision.reason, reviewer: decision.reviewer, at: decision.at });
    }
    for (const departure of req.departure_reasons) {
      exceptions.push({ rule_id: "CONS-01", decision_id: `mock-departure-${departure.finding_id}`, action: "context_reason", reason: departure.reason, reviewer: req.actor, at });
    }
    const reference: Reference = { id: nextId("reference"), line_ids: draft.line_ids, english: draft.text, source: "published", exceptions };
    s.references.push(reference);
    s.refMeta[reference.id] = { shabad_id: draft.shabad_id, draft_id: draft.id, approver: req.actor, at, gate };
    return { draft: published, reference, gate: computeGate(published, resolved) };
  },
  async listPublications(req) {
    const s = getState();
    const publications: ApiResponse<"listPublications">["publications"] = [];
    for (const reference of s.references) {
      const meta = s.refMeta[reference.id];
      if (!meta || meta.shabad_id !== req.shabad_id) continue;
      const draft = s.drafts.find((d) => d.id === meta.draft_id);
      // Stores saved by older builds have no gate: rebuild a clear one for the published version.
      const gate: PublishGate = meta.gate ?? { draft_id: meta.draft_id, draft_version: draft?.version ?? 1, ruleset_version: s.rulesetVersion, can_publish: true, blockers: [], warning_ids: [] };
      publications.push({ reference, draft_id: meta.draft_id, approver: meta.approver, at: meta.at, gate });
    }
    return { publications };
  },
  async getReference(req) {
    const reference = getState().references.find((r) => r.id === req.reference_id);
    return reference ? { reference } : err("not_found", "That reference does not exist.");
  },
  async listRules(req) {
    const s = getState();
    if (typeof req.ruleset_version === "number") {
      const rules = rulesForVersion(req.ruleset_version);
      return rules ? { ruleset_version: req.ruleset_version, rules } : err("not_found", `Ruleset ${req.ruleset_version} is not available.`);
    }
    return { ruleset_version: s.rulesetVersion, rules: currentRules() };
  },
  async listProposals() { return { proposals: getState().proposals }; },
  async getProposal(req) {
    const s = getState();
    const proposal = s.proposals.find((p) => p.id === req.proposal_id);
    if (!proposal) return err("not_found", "That proposal does not exist.");
    return { proposal, drift_results: s.drift.filter((d) => d.proposal_id === proposal.id) };
  },
  async submitProposal(req) {
    const s = getState();
    const proposal: Proposal = { id: nextId("proposal"), source: "free_text", rule_text: req.rule_text, example: req.example, reason: req.reason, evidence_ids: [], author: req.author, at: nowIso(), status: "pending" };
    const published = s.references.filter((r) => r.source === "published");
    const lineIds = [...new Set(published.flatMap((r) => r.line_ids))];
    const replay = published.length > 0
      ? { status: "evaluated", check: "reference_replay", outcome: "block", reason: "Mock replay (synthetic): this proposal is treated as affecting every published line.", evidence: { rule_ids: [], reference_ids: published.map((r) => r.id), affected_line_ids: lineIds, affected_count: lineIds.length, source_counts: { sikhri_sample: 0, published: lineIds.length } } }
      : { status: "evaluated", check: "reference_replay", outcome: "pass", reason: "Mock replay (synthetic): no published references to replay.", evidence: { rule_ids: [], reference_ids: [], affected_line_ids: [], affected_count: 0, source_counts: { sikhri_sample: 0, published: 0 } } };
    const assessments = [
      { status: "not_evaluable", check: "contradiction", reason: "Mock mode: contradiction check not implemented; LLM-10 pending." },
      replay,
      { status: "not_evaluable", check: "glossary_collision", reason: "No glossary authority supplied (OQ-13); unavailable, not a pass." },
    ];
    const results: DriftResult[] = assessments.map((assessment) => DriftResultSchema.parse({ id: nextId("drift"), proposal_id: proposal.id, assessment, override: null }));
    s.proposals.push(proposal);
    s.drift.push(...results);
    return { proposal, drift_results: results };
  },
  async approveProposal(req) {
    const s = getState();
    const proposal = s.proposals.find((p) => p.id === req.proposal_id);
    if (!proposal) return err("not_found", "That proposal does not exist.");
    if (proposal.status !== "pending") return err("invalid_request", "This proposal has already been decided.");
    if (blank(req.reason)) return err("invalid_request", "A written reason is required.");
    if (req.ruleset_version !== s.rulesetVersion) return err("version_conflict", "The ruleset changed; reload before approving.");
    const blocked = s.drift.filter((d) => d.proposal_id === proposal.id && d.assessment.status === "evaluated" && d.assessment.outcome === "block");
    if (blocked.length > 0 && (req.drift_override_reason === null || blank(req.drift_override_reason))) {
      return err("drift_blocked", "The drift check blocks this proposal. Approving needs a separate written reason to override it.");
    }
    const at = nowIso();
    const newVersion = s.rulesetVersion + 1;
    const provenance = { actor: req.actor, reason: req.reason, at };
    const driftOverride = blocked.length > 0 && req.drift_override_reason ? { actor: req.actor, reason: req.drift_override_reason, at } : null;
    const rule: Rule = {
      id: nextId("rule"), text: proposal.rule_text, level: "SHOULD", layers: ["transcreation"], plan: "generic_judge", severity: "warning", decision: null,
      version: newVersion, status: "approved", source: "proposal", source_tag: "proposal", prefilter: null,
      resolution: { active: true, scope: "p0_check", severity: "warning", blocks_publish: false, layers: ["transcreation"], conditional: null, decision: null },
      provenance,
    };
    s.rulesetVersion = newVersion;
    s.proposalRules.push(rule);
    s.rulesets.push({ ruleset_version: newVersion, rules: currentRules() });
    s.proposals = s.proposals.map((p) => (p.id === proposal.id ? { ...p, status: "approved" as const } : p));
    if (driftOverride) { const ids = new Set(blocked.map((d) => d.id)); s.drift = s.drift.map((d) => (ids.has(d.id) ? { ...d, override: driftOverride } : d)); }
    // Published drafts retain their historical review snapshot; only unpublished findings are cleared.
    const publishedDraftIds = new Set(s.drafts.filter((draft) => draft.status === "published").map((draft) => draft.id));
    clearFindings((finding) => !publishedDraftIds.has(finding.draft_id));
    return { rule, approval: { proposal_id: proposal.id, ruleset_version: newVersion, provenance, drift_override: driftOverride }, ruleset_version: newVersion };
  },
  async getEval() {
    if (getMockEvalMode() === "synthetic") return syntheticEval();
    return { ...evalFixture, ruleset_version: getState().rulesetVersion };
  },
};

export async function handleMock<N extends RouteName>(name: N, request: ApiRequest<N>): Promise<unknown> {
  try {
    // Seed on any route, so the review queue and nav badge are populated before the workspace is opened.
    const load = await loadMockSabad();
    if (load.status === "available") seedIfNeeded(load.sabad);
    return await (handlers[name] as Handler<N>)(request);
  } catch (error) {
    return err("internal_error", `Mock handler failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    persist();
  }
}
