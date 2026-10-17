import type { ApiResponse } from "../../contracts/api";
import { CheckInputSchema, type CheckInput, type CheckResult, type CheckRun, type Draft, type Finding, type Rule } from "../../contracts/domain";
import type { Engine } from "../../contracts/ports";
import { codePhaseScope, createLlmClient, isCodeFinding, llmPhaseScope, runChecks } from "../../engine/index";
import { getStore, nextId, nowIso } from "./context";
import { ServiceError, type ParsedRequest } from "./http";
import type { AppStore } from "./memory-repo";
import { clearFindings, currentRuleset, sabadDrafts } from "./state";

/**
 * API-03: run one check phase for a draft. Calls the real engine (`lib/engine/index.ts`) and persists
 * findings and runs in the store. The engine call is injectable (`runChecksWith`) so tests can substitute
 * a slow or failing engine; routes use the default.
 *
 * Published units are approved work and immutable here: they are passed to the engine as Sabad context
 * (`sabadDrafts`, for first-use and collapse rules) but are never a check target, and nothing is stored on them.
 */
type Phase = CheckRun["phase"];
type CheckRequest = ParsedRequest<"runCodeChecks">;
type CheckResponse = ApiResponse<"runCodeChecks">;
type EngineRunChecks = Engine["runChecks"];

const MAX_ERROR_LENGTH = 300;
const isPublished = (unit: Draft): boolean => unit.status === "published";

export const runCodeChecks = (req: CheckRequest): Promise<CheckResponse> => runChecksWith(runChecks, "code", req);
export const runLlmChecks = (req: CheckRequest): Promise<CheckResponse> => runChecksWith(runChecks, "llm", req);

/**
 * True when a result computed from `snapshot` can no longer be trusted: the ruleset moved on, or any authored
 * unit of the Sabad was added, removed or edited since the snapshot was taken. Exported for unit tests.
 */
export function isSnapshotStale(
  store: AppStore,
  snapshot: { shabadId: string; rulesetVersion: number; drafts: Draft[]; sabadWide?: boolean },
): boolean {
  if (currentRuleset(store).version !== snapshot.rulesetVersion) return true;
  const now = store.listDraftsForSabad(snapshot.shabadId);
  // Sabad-wide (default, code phase): Sabad-scoped rules depend on siblings, so any added/removed unit counts.
  // Unit-only (model phase): just the listed units must still exist at the same version.
  if (snapshot.sabadWide !== false && now.length !== snapshot.drafts.length) return true;
  const versions = new Map(now.map((draft) => [draft.id, draft.version]));
  return snapshot.drafts.some((draft) => versions.get(draft.id) !== draft.version);
}

const NO_JUDGE_REASON = "No model judge is configured yet (LLM-01); this rule was not evaluated by a model.";

/**
 * While no model judge is configured, the engine lists only rules that had a packet. A model phase must never read
 * as a pass, so every active p0_check rule not already listed is reported not evaluable (engine reasons kept).
 */
function withUnjudgedRules(notEvaluable: CheckResult["notEvaluable"], rules: Rule[]): CheckResult["notEvaluable"] {
  const listed = new Set(notEvaluable.map((entry) => entry.ruleId));
  const extra = rules
    .filter((rule) => rule.resolution.active && rule.resolution.scope === "p0_check" && !listed.has(rule.id))
    .map((rule) => ({ ruleId: rule.id, reason: NO_JUDGE_REASON }));
  return [...notEvaluable, ...extra];
}

/** Saves `next` only if the stored run for its key is still `previous` (a concurrent re-check owns it otherwise). */
function settleRun(store: AppStore, previous: CheckRun, next: CheckRun): void {
  const owner = store.listCheckRunsForDraft(previous.draft_id)
    .find((run) => run.draft_version === previous.draft_version && run.ruleset_version === previous.ruleset_version && run.phase === previous.phase);
  if (owner?.id === previous.id) store.saveCheckRun(next);
}

/** Ids of findings a reviewer overrode or waived at the finding's own draft and ruleset version; they are never resurrected. */
function reviewerClearedIds(store: AppStore, drafts: Draft[]): Set<string> {
  const ids = new Set<string>();
  for (const draft of drafts) {
    const cleared = new Map(store.listFindingsForDraft(draft.id).filter((finding) => finding.state === "cleared").map((finding) => [finding.id, finding]));
    for (const decision of store.listDecisionsForDraft(draft.id)) {
      const finding = cleared.get(decision.finding_id);
      if (finding && decision.action !== "accept" && decision.draft_version === finding.draft_version && decision.ruleset_version === finding.ruleset_version) ids.add(finding.id);
    }
  }
  return ids;
}

function neutralError(error: unknown): string {
  const detail = error instanceof Error && error.message.trim() ? error.message.trim() : "unknown error";
  return `Check failed before completing: ${detail}`.slice(0, MAX_ERROR_LENGTH);
}

/**
 * `judgeConfigured` defaults to whether the engine has a model client (`createLlmClient() !== null`). Only when it is
 * false is the blanket "not evaluated by a model" merge applied; with a model the engine's own result passes through.
 */
export async function runChecksWith(
  engineRunChecks: EngineRunChecks, phase: Phase, req: CheckRequest, options: { judgeConfigured?: boolean } = {},
): Promise<CheckResponse> {
  const store = getStore();
  const draft = store.getDraft(req.draft_id);
  if (!draft) throw new ServiceError("not_found", "Draft not found.");
  const ruleset = currentRuleset(store);
  if (req.draft_version !== draft.version) throw new ServiceError("version_conflict", "Draft changed since this check was requested; reload and re-run.");
  if (req.ruleset_version !== ruleset.version) throw new ServiceError("version_conflict", "Ruleset changed since this check was requested; reload and re-run.");
  if (draft.status === "published") throw new ServiceError("invalid_request", "This draft version is already published; checks are not re-run on published work. Edit it to start a new version.");
  const sabad = store.getSabad(draft.shabad_id);
  if (!sabad) throw new ServiceError("not_found", "Source Sabad for this draft is not available.");
  if (draft.line_ids.some((id) => !req.changed_line_ids.includes(id))) {
    throw new ServiceError("invalid_request", "changed_line_ids must include every source line of the draft's group.");
  }

  const drafts = sabadDrafts(store, draft.shabad_id);
  // The request itself must not split a group; checked before the code phase widens the changed set below.
  for (const unit of drafts) {
    const covered = unit.line_ids.filter((id) => req.changed_line_ids.includes(id)).length;
    if (covered > 0 && covered < unit.line_ids.length) throw new ServiceError("invalid_request", "changed_line_ids must cover every source line of any group they touch.");
  }
  // Published units are context only: never changed, never re-checked, whatever the request lists.
  const publishedLines = new Set(drafts.filter(isPublished).flatMap((unit) => unit.line_ids));
  // A sibling with no succeeded run of this phase for its current draft and ruleset version has never been fully
  // checked, so re-check it in full. That keeps its persisted "succeeded" run truthful and the publish gate honest.
  const changedLineIds = [...new Set([...req.changed_line_ids.filter((id) => !publishedLines.has(id)), ...drafts
    .filter((unit) => !isPublished(unit) && !store.listCheckRunsForDraft(unit.id).some((run) => run.phase === phase && run.status === "succeeded" && run.draft_version === unit.version && run.ruleset_version === ruleset.version))
    .flatMap((unit) => unit.line_ids)])];
  const parsed = CheckInputSchema.safeParse({
    sabad, draft, sabadDrafts: drafts, changedLineIds,
    rules: ruleset.rules, rulesetVersion: ruleset.version, references: store.listReferences(),
  });
  if (!parsed.success) {
    // Paths and rule messages only: never echo source or draft text.
    const detail = parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join(".") || "(input)"}: ${issue.message}`).join("; ");
    throw new ServiceError("invalid_request", `Check input does not match its contract. ${detail}`);
  }
  const input: CheckInput = parsed.data;

  // Units this phase re-checks. Their runs go `pending` now, so the publish gate blocks until the phase settles.
  // The engine's scope says which units a result owns (`draftIds`) and which rules it owns on every unit (`ruleIds`).
  const scope = phase === "code" ? codePhaseScope(input) : llmPhaseScope(input);
  const unitIds = new Set([...scope.draftIds, draft.id]);
  const units = drafts.filter((unit) => unitIds.has(unit.id) && !isPublished(unit));
  // Sabad-scoped rules read siblings, so with any in scope a Sabad change invalidates the result; otherwise only its units.
  const sabadWide = scope.ruleIds.length > 0;
  const snapshot = { shabadId: draft.shabad_id, rulesetVersion: ruleset.version, drafts: sabadWide ? drafts : units, sabadWide };
  const startedAt = nowIso();
  const pending = units.map((unit): CheckRun => ({
    id: nextId("run"), draft_id: unit.id, draft_version: unit.version, ruleset_version: ruleset.version, phase,
    status: "pending", started_at: startedAt, completed_at: null, error: null, cached: false, not_evaluable: [],
  }));
  store.transaction((tx) => { for (const run of pending) tx.saveCheckRun(run); });

  // The engine call is async, so it runs here, outside any transaction. Everything below that writes is synchronous
  // and runs inside one transaction that first re-reads the store and re-checks staleness (race-free check-then-write).
  let result: CheckResult;
  try {
    result = await engineRunChecks(input, phase);
  } catch (error) {
    const message = neutralError(error);
    const failed = store.transaction((tx): CheckRun[] | null => {
      if (isSnapshotStale(tx, snapshot)) { supersede(tx, pending); return null; }
      const runs = pending.map((run): CheckRun => ({ ...run, status: "failed", completed_at: nowIso(), error: message }));
      pending.forEach((run, index) => settleRun(tx, run, runs[index]));
      return runs;
    });
    if (failed === null) throw supersededError();
    // A failed run is a valid, retryable outcome: 200 with the failed runs and an empty result.
    return { affected_drafts: units, check_runs: failed, result: { findings: [], notEvaluable: [] } };
  }

  const notEvaluable = phase === "llm" && !(options.judgeConfigured ?? createLlmClient() !== null) ? withUnjudgedRules(result.notEvaluable, ruleset.rules) : result.notEvaluable;
  const engineFindings = result.findings;

  let outcome: { saved: Finding[]; affected: Draft[]; runs: CheckRun[] } | null;
  try {
    outcome = store.transaction((tx) => {
      // The store may have moved while the engine ran: drop the result rather than persist stale findings.
      if (isSnapshotStale(tx, snapshot)) { supersede(tx, pending); return null; }

      // Re-read the Sabad's units inside the transaction, so every decision below uses the state being written over.
      const siblings = sabadDrafts(tx, draft.shabad_id);
      // Units published meanwhile are immutable too: only unpublished units receive findings, clears and runs.
      const writable = siblings.filter((unit) => !isPublished(unit));
      const writableIds = new Set(writable.map((unit) => unit.id));
      // Never resurrect a reviewer's override/waive: collect before clearing, since clearing re-labels findings.
      const reviewerCleared = reviewerClearedIds(tx, siblings);
      // A Sabad-scoped finding the engine locates in a published unit (e.g. first use) is dropped, not stored.
      const saved: Finding[] = engineFindings.filter((finding) => !reviewerCleared.has(finding.id) && writableIds.has(finding.draft_id));
      const at = nowIso();
      const byId = new Map(writable.map((unit) => [unit.id, unit]));
      const current = (finding: Finding) => {
        const unit = byId.get(finding.draft_id);
        return !!unit && finding.draft_version === unit.version && finding.ruleset_version === ruleset.version;
      };
      // Own units: all rules of this phase. Every unit: only Sabad-scoped rules, whose result depends on sibling units.
      // Code findings are replaced only by the code phase, model findings only by the model phase.
      const cleared = clearFindings(tx, (finding) => isCodeFinding(finding) === (phase === "code") && current(finding)
        && (scope.draftIds.includes(finding.draft_id) || scope.ruleIds.includes(finding.rule_id)), at, writableIds);
      for (const finding of saved) tx.saveFinding(finding);

      // Affected = re-checked units, plus any sibling that received or lost findings under Sabad scope.
      const affectedIds = new Set([...unitIds, ...saved.map((finding) => finding.draft_id), ...cleared.map((finding) => finding.draft_id)]);
      const affected = writable.filter((unit) => affectedIds.has(unit.id));
      const pendingByDraft = new Map(pending.map((run) => [run.draft_id, run]));
      const completedAt = nowIso();
      const runs = affected.map((unit): CheckRun => ({
        id: pendingByDraft.get(unit.id)?.id ?? nextId("run", tx), draft_id: unit.id, draft_version: unit.version, ruleset_version: ruleset.version, phase,
        status: "succeeded", started_at: pendingByDraft.get(unit.id)?.started_at ?? startedAt, completed_at: completedAt, error: null, cached: false,
        not_evaluable: notEvaluable,
      }));
      for (const run of runs) tx.saveCheckRun(run);
      return { saved, affected, runs };
    });
  } catch (error) {
    // The transaction rolled back, so nothing partial was written. Do not leave the gate stuck on `pending`.
    failPending(store, pending, neutralError(error));
    throw error;
  }
  if (outcome === null) throw supersededError();
  return { affected_drafts: outcome.affected, check_runs: outcome.runs, result: { findings: outcome.saved, notEvaluable } };
}

/** Best effort after a rolled-back persist: settle this attempt's still-owned pending runs as failed. Never throws. */
function failPending(store: AppStore, pending: CheckRun[], message: string): void {
  try {
    store.transaction((tx) => {
      for (const run of pending) {
        if (!tx.getDraft(run.draft_id)) continue;
        settleRun(tx, run, { ...run, status: "failed", completed_at: nowIso(), error: message });
      }
    });
  } catch { /* the original error is the one worth reporting */ }
}

/** Marks this attempt's pending runs failed ("superseded") when still ours. Writes only; the caller reports the conflict. */
function supersede(store: AppStore, pending: CheckRun[]): void {
  for (const run of pending) {
    if (!store.getDraft(run.draft_id)) continue; // the draft was deleted meanwhile; nothing to settle
    settleRun(store, run, { ...run, status: "failed", completed_at: nowIso(), error: "Superseded: the draft or ruleset changed while this check ran; the result was discarded." });
  }
}

const supersededError = (): ServiceError =>
  new ServiceError("version_conflict", "The draft or ruleset changed while the check ran; the result was discarded. Re-run the check.");
