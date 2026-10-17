import type { CheckInput, CheckRun, Draft, Finding, PublishGate, Rule } from "../../contracts/domain";
import { codePhaseScope, isCodeFinding, llmPhaseScope } from "../../engine/index";
import type { Repository } from "../db/repo";

/** Shared pure domain helpers over a repository/store. They never write except `clearFindings`. */
type Store = Repository;

/** The latest saved ruleset (falls back to an empty v1 when none was ever saved). */
export function currentRuleset(store: Store): { version: number; rules: Rule[] } {
  const version = store.getLatestRulesetVersion() ?? 1;
  return { version, rules: store.getRuleset(version) };
}

/** Findings that are current: state "current" and tied to this draft version and this ruleset version. */
export function currentFindings(store: Store, draft: Draft, rulesetVersion: number): Finding[] {
  return store.listFindingsForDraft(draft.id).filter((finding) =>
    finding.state === "current" && finding.draft_version === draft.version && finding.ruleset_version === rulesetVersion);
}

/** Check runs for this exact draft version and ruleset version (both phases, any status). */
export function currentRuns(store: Store, draft: Draft, rulesetVersion: number): CheckRun[] {
  return store.listCheckRunsForDraft(draft.id).filter((run) =>
    run.draft_version === draft.version && run.ruleset_version === rulesetVersion);
}

export function latestRun(store: Store, draft: Draft, phase: CheckRun["phase"], rulesetVersion: number): CheckRun | undefined {
  return currentRuns(store, draft, rulesetVersion).filter((run) => run.phase === phase).at(-1);
}

/**
 * Publish gate. Blockers: current error/flag findings; code or llm runs that are missing, pending or
 * failed for this draft and ruleset version; current CONS-01 findings with no departure reason.
 * Warnings and hints never block. Uses the store's latest ruleset version.
 *
 * CONS-01 departure: a reviewer's `override` or `waive` decision with its written reason clears the finding
 * (`state: "cleared"`, see `decide`), so it is no longer current and no longer blocks; the decision is then the
 * recorded departure reason and publish copies it into the reference's `exceptions`. An `accept` leaves the finding
 * current, so it still blocks. `departureReasonFindingIds` is the alternative: publish-time `departure_reasons`.
 */
export function computeGate(store: Store, draft: Draft, departureReasonFindingIds: Set<string> = new Set()): PublishGate {
  const rulesetVersion = currentRuleset(store).version;
  const findings = currentFindings(store, draft, rulesetVersion);
  const blockers: PublishGate["blockers"] = [];
  for (const finding of findings) {
    if (finding.rule_id === "CONS-01") {
      if (!departureReasonFindingIds.has(finding.id)) blockers.push({ kind: "departure_reason", finding_id: finding.id, rule_id: "CONS-01" });
      continue;
    }
    if (finding.severity === "error" || finding.severity === "flag") {
      blockers.push({ kind: "finding", finding_id: finding.id, rule_id: finding.rule_id, severity: finding.severity });
    }
  }
  for (const phase of ["code", "llm"] as const) {
    const run = latestRun(store, draft, phase, rulesetVersion);
    if (!run) blockers.push({ kind: "check_phase", draft_id: draft.id, phase, status: "missing" });
    else if (run.status !== "succeeded") blockers.push({ kind: "check_phase", draft_id: draft.id, phase, status: run.status });
  }
  return {
    draft_id: draft.id, draft_version: draft.version, ruleset_version: rulesetVersion,
    can_publish: blockers.length === 0, blockers,
    warning_ids: findings.filter((finding) => finding.severity === "warning").map((finding) => finding.id),
  };
}

/**
 * Every draft, grouped by Sabad (groups in first-draft order) and in source order within each Sabad.
 * Reads `listDrafts()` once; it never iterates the Sabad table, so the cost follows drafts, not the corpus.
 */
export function allDrafts(store: Store): Draft[] {
  const shabadIds = [...new Set(store.listDrafts().map((draft) => draft.shabad_id))];
  return shabadIds.flatMap((shabadId) => sabadDrafts(store, shabadId));
}

/**
 * Marks every current finding matching `predicate` as cleared at `at`; returns the findings it cleared.
 * `draftIds` scopes the scan to those drafts (pass what the caller knows); omitted, every stored draft is scanned.
 * Writes go through `store`, so inside `store.transaction` pass the transaction's store.
 */
export function clearFindings(
  store: Store, predicate: (finding: Finding) => boolean, at: string, draftIds?: Iterable<string>,
): Finding[] {
  const cleared: Finding[] = [];
  const scope = draftIds === undefined ? store.listDrafts().map((draft) => draft.id) : [...new Set(draftIds)];
  for (const draftId of scope) {
    for (const finding of store.listFindingsForDraft(draftId)) {
      if (finding.state !== "current" || !predicate(finding)) continue;
      const next: Finding = { ...finding, state: "cleared", cleared_at: at };
      store.saveFinding(next);
      cleared.push(next);
    }
  }
  return cleared;
}

const SIBLING_STALE_MESSAGE = "Out of date: another unit of this Sabad was saved, so this result must be re-checked.";

/**
 * API-03: after a unit was added, edited or regrouped, its siblings' Sabad-scoped results are stale. Call inside the
 * save transaction, after the write. For every other unit of the Sabad this (a) clears current findings of the rules
 * the engine says depend on other units (`codePhaseScope`/`llmPhaseScope` `.ruleIds`, e.g. TERM-03, TERM-07, TERM-02),
 * keeping each phase to its own findings (`isCodeFinding`), and (b) turns the sibling's succeeded run of that phase
 * into a failed "out of date" run for its current version. The publish gate then blocks the sibling, and the next check
 * (which re-checks any unit without a succeeded run, D-54) refreshes it. A phase with no Sabad-scoped rule is left alone.
 */
export function invalidateSabadScopedSiblings(store: Store, saved: Draft, at: string): void {
  const siblings = sabadDrafts(store, saved.shabad_id).filter((unit) => unit.id !== saved.id);
  const sabad = store.getSabad(saved.shabad_id);
  if (siblings.length === 0 || !sabad) return;
  const { version, rules } = currentRuleset(store);
  const input: CheckInput = {
    sabad, draft: saved, sabadDrafts: [...siblings, saved], changedLineIds: saved.line_ids,
    rules, rulesetVersion: version, references: [],
  };
  const scopes: Record<CheckRun["phase"], string[]> = { code: codePhaseScope(input).ruleIds, llm: llmPhaseScope(input).ruleIds };
  const siblingIds = siblings.map((unit) => unit.id);
  for (const phase of ["code", "llm"] as const) {
    const ruleIds = scopes[phase];
    if (ruleIds.length === 0) continue;
    clearFindings(store, (finding) => isCodeFinding(finding) === (phase === "code") && ruleIds.includes(finding.rule_id), at, siblingIds);
    for (const unit of siblings) {
      const run = latestRun(store, unit, phase, version);
      if (run?.status === "succeeded") store.saveCheckRun({ ...run, status: "failed", completed_at: at, error: SIBLING_STALE_MESSAGE });
    }
  }
}

/** A Sabad's drafts in source line order (by each draft's earliest covered line). */
export function sabadDrafts(store: Store, shabadId: string): Draft[] {
  const order = new Map((store.getSabad(shabadId)?.lines ?? []).map((line, index) => [line.line_id, index]));
  const first = (draft: Draft) => Math.min(...draft.line_ids.map((id) => order.get(id) ?? Number.MAX_SAFE_INTEGER));
  return store.listDraftsForSabad(shabadId).sort((a, b) => first(a) - first(b));
}
