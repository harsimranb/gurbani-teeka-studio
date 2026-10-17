import { beforeEach, describe, expect, it } from "vitest";
import { ApiErrorSchema, routes } from "../../contracts/api";
import type { CheckResult, Draft } from "../../contracts/domain";
import { rulesFixture } from "../../contracts/fixtures";
import { POST as postCode } from "../../../app/api/check/route";
import { POST as postLlm } from "../../../app/api/check/llm/route";
import { isSnapshotStale, runChecksWith } from "./checks";
import { runChecks } from "../../engine/index";
import { __setSourceForTests, __setStoreForTests, getStore, resetStore } from "./context";
import type { AppStore } from "./memory-repo";
import { currentFindings, currentRuns } from "./state";
import { makeDraft, makeFinding, testSabad, TEST_AT } from "./testing";

// SYNTHETIC English strings from RULES_NOTES section 10; no Gurmukhi anywhere.
const LORD = "The Lord sustains all, and nothing lies outside His Command.";
const PAREN = "The mind (which is restless) finds rest in Wisdom.";
const CLEAN = "The Creator sustains all, and nothing lies outside the Creator's Command.";
const NO_GLOSS = "IkOankar pervades everything.";
const FOREST = "The best rest is found in the forest of contentment.";

const L = (n: number) => `TEST-SABAD-L${n}`;
const store = () => getStore();
const seed = (id: string, lines: number[], text: string, overrides: Partial<Draft> = {}) => {
  const draft = makeDraft({ id, line_ids: lines.map(L), text, ...overrides });
  store().saveDraft(draft);
  return draft;
};
const body = (draft: Draft, overrides: Record<string, unknown> = {}) => ({
  draft_id: draft.id, draft_version: draft.version, ruleset_version: 1, changed_line_ids: draft.line_ids, ...overrides,
});
const post = (handler: typeof postCode, payload: unknown) => handler(new Request("http://localhost/api/check", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
}));
const ok = async (response: Response) => {
  expect(response.status).toBe(200);
  return routes.runCodeChecks.response.parse(await response.json());
};
const errorOf = async (response: Response) => ApiErrorSchema.parse(await response.json()).error;
const emptyResult: CheckResult = { findings: [], notEvaluable: [] };

beforeEach(() => {
  __setSourceForTests(testSabad());
  resetStore();
});

describe("POST /api/check (code phase)", () => {
  it("produces exact-span TERM-01 and LAYER-07 findings and a succeeded run", async () => {
    const draft = seed("d1", [1], "The Lord (which is restless) finds rest.");
    const response = await ok(await post(postCode, body(draft)));
    const byRule = new Map(response.result.findings.map((finding) => [finding.rule_id, finding]));
    const term = byRule.get("TERM-01")!;
    expect(term.quoted_span).toBe("Lord");
    expect(draft.text.slice(term.start, term.end)).toBe("Lord");
    const layer = byRule.get("LAYER-07")!;
    expect(draft.text.slice(layer.start, layer.end)).toBe(layer.quoted_span);
    expect(response.affected_drafts.map((unit) => unit.id)).toEqual(["d1"]);
    expect(response.check_runs).toHaveLength(1);
    expect(response.check_runs[0]).toMatchObject({ phase: "code", status: "succeeded", cached: false, draft_version: 1, ruleset_version: 1 });
    expect(currentFindings(store(), draft, 1).map((finding) => finding.id).sort()).toEqual(response.result.findings.map((finding) => finding.id).sort());
    expect(currentRuns(store(), draft, 1)).toHaveLength(1);
  });

  it("returns 404 for an unknown draft", async () => {
    const response = await post(postCode, { draft_id: "nope", draft_version: 1, ruleset_version: 1, changed_line_ids: [L(1)] });
    expect(response.status).toBe(404);
    expect((await errorOf(response)).code).toBe("not_found");
  });

  it("returns 409 for a stale draft_version or ruleset_version", async () => {
    const draft = seed("d1", [1], LORD, { version: 2 });
    for (const stale of [{ draft_version: 1 }, { ruleset_version: 2 }]) {
      const response = await post(postCode, body(draft, stale));
      expect(response.status).toBe(409);
      expect((await errorOf(response)).code).toBe("version_conflict");
    }
    expect(store().listCheckRunsForDraft("d1")).toEqual([]);
  });

  it("rejects changed_line_ids that cover only part of a group", async () => {
    const draft = seed("d1", [1, 2], LORD);
    const response = await post(postCode, body(draft, { changed_line_ids: [L(1)] }));
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("invalid_request");
    // Partially covering another group is rejected by CheckInputSchema.
    const other = seed("d2", [3, 4], CLEAN);
    const partial = await post(postCode, body(other, { changed_line_ids: [L(3), L(4), L(2)] }));
    expect(partial.status).toBe(400);
  });

  it("accepts changed_line_ids covering other whole groups and re-checks those units", async () => {
    const a = seed("d1", [1], LORD);
    const b = seed("d2", [2], PAREN);
    const response = await ok(await post(postCode, body(a, { changed_line_ids: [L(1), L(2)] })));
    expect(response.affected_drafts.map((unit) => unit.id).sort()).toEqual(["d1", "d2"]);
    expect(response.check_runs).toHaveLength(2);
    expect(currentFindings(store(), b, 1).some((finding) => finding.rule_id === "LAYER-07")).toBe(true);
  });

  it("re-checking after an edit replaces the old findings", async () => {
    const draft = seed("d1", [1], LORD);
    const first = await ok(await post(postCode, body(draft)));
    expect(first.result.findings.some((finding) => finding.rule_id === "TERM-01")).toBe(true);
    const edited = { ...draft, text: CLEAN, version: 2 };
    store().saveDraft(edited);
    const second = await ok(await post(postCode, body(edited, { draft_version: 2 })));
    expect(second.result.findings.filter((finding) => finding.rule_id === "TERM-01")).toEqual([]);
    expect(currentFindings(store(), edited, 1).filter((finding) => finding.rule_id === "TERM-01")).toEqual([]);
  });

  it("re-running the same version replaces findings without duplicating them", async () => {
    const draft = seed("d1", [1], LORD);
    const first = await ok(await post(postCode, body(draft)));
    const second = await ok(await post(postCode, body(draft)));
    expect(second.result.findings.map((finding) => finding.id).sort()).toEqual(first.result.findings.map((finding) => finding.id).sort());
    expect(currentFindings(store(), draft, 1)).toHaveLength(first.result.findings.length);
    expect(currentRuns(store(), draft, 1)).toHaveLength(1);
  });

  it("never resurrects a finding the reviewer overrode", async () => {
    const draft = seed("d1", [1], LORD);
    const first = await ok(await post(postCode, body(draft)));
    const target = first.result.findings.find((finding) => finding.rule_id === "TERM-01")!;
    store().saveFinding({ ...target, state: "cleared", cleared_at: TEST_AT });
    store().saveDecision({ id: "dec-x", finding_id: target.id, draft_id: "d1", draft_version: 1, ruleset_version: 1, action: "override", reason: "Test reason", reviewer: "Tester", at: TEST_AT });
    const again = await ok(await post(postCode, body(draft)));
    expect(again.result.findings.some((finding) => finding.id === target.id)).toBe(false);
    expect(currentFindings(store(), draft, 1).some((finding) => finding.id === target.id)).toBe(false);
    expect(store().getFinding(target.id)?.state).toBe("cleared");
  });

  it("includes sibling drafts that receive or lose Sabad-scoped findings in affected_drafts", async () => {
    const a = seed("d1", [1], NO_GLOSS);
    const b = seed("d2", [2], NO_GLOSS);
    // Checking only the second unit still evaluates first use (Sabad scope) on the first.
    const response = await ok(await post(postCode, body(b)));
    const ids = response.affected_drafts.map((unit) => unit.id);
    expect(ids).toContain("d2");
    expect(response.result.findings.filter((finding) => finding.draft_id === "d1").length).toBeGreaterThan(0);
    expect(ids).toContain("d1");
    expect(response.check_runs.map((run) => run.draft_id).sort()).toEqual([...ids].sort());
    expect(currentFindings(store(), a, 1).length).toBeGreaterThan(0);
  });
});

describe("code phase and siblings never fully checked", () => {
  it("fully re-checks a sibling with no current-version code run, so its succeeded run is truthful", async () => {
    const a = seed("d1", [1], LORD);
    const b = seed("d2", [2], CLEAN);
    await ok(await post(postCode, body(a)));
    expect(currentRuns(store(), a, 1)).toHaveLength(1);
    store().saveRuleset(2, store().getRuleset(1)); // ruleset v2: A has no v2 code run
    const response = await ok(await post(postCode, body(b, { ruleset_version: 2 })));
    const ids = response.affected_drafts.map((unit) => unit.id).sort();
    expect(ids).toEqual(["d1", "d2"]);
    expect(response.check_runs.every((run) => run.ruleset_version === 2 && run.status === "succeeded")).toBe(true);
    // A's non-Sabad-scoped finding (capitalised "Lord") exists at v2, not just a bare run.
    expect(currentFindings(store(), a, 2).some((finding) => finding.rule_id === "TERM-01" && finding.quoted_span === "Lord")).toBe(true);
    expect(currentRuns(store(), a, 2).map((run) => run.phase)).toEqual(["code"]);
  });

  it("keeps Sabad-scoped-only behaviour for a sibling that already has a current succeeded code run", async () => {
    const a = seed("d1", [1], LORD);
    const b = seed("d2", [2], CLEAN);
    await ok(await post(postCode, body(a)));
    const response = await ok(await post(postCode, body(b, { changed_line_ids: [L(2)] })));
    // b has no run yet so it is checked; a is current and only re-evaluated if a Sabad-scoped finding touches it.
    expect(response.affected_drafts.map((unit) => unit.id)).toContain("d2");
    expect(response.check_runs.find((run) => run.draft_id === "d1")?.status ?? "succeeded").toBe("succeeded");
    expect(currentFindings(store(), a, 1).some((finding) => finding.rule_id === "TERM-01")).toBe(true);
  });
});

describe("POST /api/check/llm (model phase)", () => {
  it("returns not_evaluable entries and no findings, with a succeeded llm run", async () => {
    const draft = seed("d1", [1], FOREST);
    const response = await ok(await post(postLlm, body(draft)));
    expect(response.result.findings).toEqual([]);
    expect(response.result.notEvaluable.length).toBeGreaterThan(0);
    expect(response.check_runs[0]).toMatchObject({ phase: "llm", status: "succeeded" });
    expect(response.check_runs[0].not_evaluable).toEqual(response.result.notEvaluable);
  });

  it("lists every active p0_check rule as not evaluable even when the text has no candidates", async () => {
    const draft = seed("d1", [1], CLEAN);
    const response = await ok(await post(postLlm, body(draft)));
    const active = rulesFixture.filter((rule) => rule.resolution.active && rule.resolution.scope === "p0_check").map((rule) => rule.id);
    expect(active.length).toBeGreaterThan(0);
    const listed = response.result.notEvaluable.map((entry) => entry.ruleId);
    expect(new Set(listed).size).toBe(listed.length);
    expect(active.every((id) => listed.includes(id))).toBe(true);
    expect(response.check_runs[0].not_evaluable).toEqual(response.result.notEvaluable);
    expect(response.check_runs[0].not_evaluable.length).toBeGreaterThan(0);
  });

  it("keeps the engine's own reason and skips the merge when a judge is configured", async () => {
    const draft = seed("d1", [1], CLEAN);
    const own = { ruleId: "TERM-01", reason: "Engine reason." };
    const merged = await runChecksWith(async () => ({ findings: [], notEvaluable: [own] }), "llm", body(draft) as never);
    expect(merged.result.notEvaluable.filter((entry) => entry.ruleId === "TERM-01")).toEqual([own]);
    expect(merged.result.notEvaluable.length).toBeGreaterThan(1);
    const judged = await runChecksWith(async () => ({ findings: [], notEvaluable: [own] }), "llm", body(draft) as never, { judgeConfigured: true });
    expect(judged.result.notEvaluable).toEqual([own]);
    expect(judged.check_runs[0].not_evaluable).toEqual([own]);
  });

  const llmRun = (draftId: string, rulesetVersion: number) => store().saveCheckRun({
    id: `run-${draftId}-llm`, draft_id: draftId, draft_version: 1, ruleset_version: rulesetVersion, phase: "llm", status: "succeeded",
    started_at: TEST_AT, completed_at: TEST_AT, error: null, cached: false, not_evaluable: [],
  });

  it("does not drop a model result when an unrelated sibling is edited and no Sabad-scoped model rule is active", async () => {
    store().saveRuleset(2, store().getRuleset(1).filter((rule) => rule.id !== "TERM-02"));
    const a = seed("d1", [1], LORD);
    const b = seed("d2", [2], CLEAN);
    llmRun("d2", 2);
    const engine = async (): Promise<CheckResult> => { store().saveDraft({ ...b, text: PAREN, version: 2 }); return emptyResult; };
    const response = routes.runLlmChecks.response.parse(await runChecksWith(engine, "llm", body(a, { ruleset_version: 2 }) as never));
    expect(response.affected_drafts.map((unit) => unit.id)).toEqual(["d1"]);
    expect(response.check_runs[0].status).toBe("succeeded");
    // An edit to the checked unit itself still drops the result.
    const c = seed("d3", [3], CLEAN);
    const racing = async (): Promise<CheckResult> => { store().saveDraft({ ...c, version: 2 }); return emptyResult; };
    await expect(runChecksWith(racing, "llm", body(c, { ruleset_version: 2 }) as never)).rejects.toMatchObject({ code: "version_conflict" });
  });

  it("drops a model result on a sibling edit while a Sabad-scoped model rule (TERM-02) is active", async () => {
    const a = seed("d1", [1], LORD);
    const b = seed("d2", [2], CLEAN);
    llmRun("d2", 1);
    const engine = async (): Promise<CheckResult> => { store().saveDraft({ ...b, text: PAREN, version: 2 }); return emptyResult; };
    await expect(runChecksWith(engine, "llm", body(a) as never)).rejects.toMatchObject({ code: "version_conflict" });
  });

  it("leaves code findings in place", async () => {
    const draft = seed("d1", [1], LORD);
    const code = await ok(await post(postCode, body(draft)));
    await ok(await post(postLlm, body(draft)));
    expect(currentFindings(store(), draft, 1)).toHaveLength(code.result.findings.length);
    expect(currentRuns(store(), draft, 1).map((run) => run.phase).sort()).toEqual(["code", "llm"]);
  });

  it("clears prior model findings only", async () => {
    const draft = seed("d1", [1], LORD);
    await ok(await post(postCode, body(draft)));
    store().saveFinding(makeFinding({ id: "llm-old", draft_id: "d1", rule_id: "TERM-01", quoted_span: "Lord", start: 4, end: 8, model: "test-model" }));
    await ok(await post(postLlm, body(draft)));
    expect(store().getFinding("llm-old")?.state).toBe("cleared");
    expect(currentFindings(store(), draft, 1).length).toBeGreaterThan(0);
  });

  it("returns 409 for a stale version", async () => {
    const draft = seed("d1", [1], LORD);
    expect((await post(postLlm, body(draft, { draft_version: 9 }))).status).toBe(409);
  });
});

describe("mid-run changes and engine failure", () => {
  it("drops the result and marks the pending run superseded when the draft changes during the engine call", async () => {
    const draft = seed("d1", [1], LORD);
    const slowEngine = async (): Promise<CheckResult> => {
      store().saveDraft({ ...draft, text: CLEAN, version: 2 }); // a concurrent edit lands while the engine runs
      return { findings: [], notEvaluable: [] };
    };
    await expect(runChecksWith(slowEngine, "code", body(draft) as never)).rejects.toMatchObject({ code: "version_conflict" });
    expect(store().listFindingsForDraft("d1")).toEqual([]);
    const runs = store().listCheckRunsForDraft("d1");
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ draft_version: 1, status: "failed" });
    expect(runs[0].error).toMatch(/superseded/i);
  });

  it("drops the result when the ruleset changes during the engine call", async () => {
    const draft = seed("d1", [1], LORD);
    const engine = async (): Promise<CheckResult> => { store().saveRuleset(2, store().getRuleset(1)); return emptyResult; };
    await expect(runChecksWith(engine, "llm", body(draft) as never)).rejects.toMatchObject({ code: "version_conflict" });
    expect(store().listCheckRunsForDraft("d1")[0].status).toBe("failed");
  });

  it("does not overwrite a run that another attempt now owns when superseded", async () => {
    const draft = seed("d1", [1], LORD);
    const engine = async (): Promise<CheckResult> => {
      store().saveCheckRun({ id: "run-other", draft_id: "d1", draft_version: 1, ruleset_version: 1, phase: "code", status: "succeeded", started_at: TEST_AT, completed_at: TEST_AT, error: null, cached: false, not_evaluable: [] });
      store().saveRuleset(2, store().getRuleset(1));
      return emptyResult;
    };
    await expect(runChecksWith(engine, "code", body(draft) as never)).rejects.toMatchObject({ code: "version_conflict" });
    expect(store().listCheckRunsForDraft("d1").find((run) => run.ruleset_version === 1)).toMatchObject({ id: "run-other", status: "succeeded" });
  });

  it("returns a failed run and an empty result when the engine throws", async () => {
    const draft = seed("d1", [1], LORD);
    const response = routes.runCodeChecks.response.parse(await runChecksWith(async () => { throw new Error("engine unavailable"); }, "code", body(draft) as never));
    expect(response.result).toEqual(emptyResult);
    expect(response.check_runs[0]).toMatchObject({ status: "failed", phase: "code" });
    expect(response.check_runs[0].error).toContain("engine unavailable");
    expect(response.check_runs[0].completed_at).not.toBeNull();
    expect(store().listCheckRunsForDraft("d1")[0].status).toBe("failed");
    expect(store().listFindingsForDraft("d1")).toEqual([]);
  });

  it("records a pending run before the engine is called", async () => {
    const draft = seed("d1", [1], LORD);
    let seen: string | undefined;
    await runChecksWith(async () => { seen = store().listCheckRunsForDraft("d1")[0]?.status; return emptyResult; }, "llm", body(draft) as never);
    expect(seen).toBe("pending");
    expect(store().listCheckRunsForDraft("d1")[0].status).toBe("succeeded");
  });
});

describe("isSnapshotStale", () => {
  it("compares ruleset version, draft versions and the set of drafts", () => {
    const draft = seed("d1", [1], LORD);
    const snapshot = { shabadId: "TEST-SABAD", rulesetVersion: 1, drafts: [draft] };
    expect(isSnapshotStale(store(), snapshot)).toBe(false);
    expect(isSnapshotStale(store(), { ...snapshot, rulesetVersion: 2 })).toBe(true);
    store().saveDraft({ ...draft, version: 2 });
    expect(isSnapshotStale(store(), snapshot)).toBe(true);
    store().saveDraft(draft);
    expect(isSnapshotStale(store(), snapshot)).toBe(false);
    seed("d2", [2], CLEAN);
    expect(isSnapshotStale(store(), snapshot)).toBe(true);
    expect(isSnapshotStale(store(), { ...snapshot, sabadWide: false })).toBe(false);
    store().deleteDraft("d2");
    store().deleteDraft("d1");
    expect(isSnapshotStale(store(), snapshot)).toBe(true);
    expect(isSnapshotStale(store(), { ...snapshot, sabadWide: false })).toBe(true);
  });
});

/**
 * Rollback-test double: delegates to `base` but makes `method` throw when `when(firstArg)` is true.
 * `transaction` hands the callback this wrapper, so the failure fires inside the transaction.
 */
function failingStore(base: AppStore, method: keyof AppStore, when: (arg: never) => boolean = () => true): AppStore {
  const wrapped: AppStore = {
    ...base,
    [method]: (...args: unknown[]) => {
      if (when(args[0] as never)) throw new Error("SYNTHETIC TEST: injected write failure");
      return (base[method] as (...a: unknown[]) => unknown)(...args);
    },
    transaction: (fn) => base.transaction(() => fn(wrapped)),
  };
  return wrapped;
}

describe("persist atomicity", () => {
  it("rolls the whole persist step back and settles the runs failed when a write throws", async () => {
    const draft = seed("d1", [1], LORD);
    const first = await ok(await post(postCode, body(draft)));
    expect(first.result.findings.length).toBeGreaterThan(0);
    const before = store().listFindingsForDraft("d1");
    expect(before.every((finding) => finding.state === "current")).toBe(true);
    // Clearing the old findings succeeds, then saving the re-found ones throws: nothing may stay half-written.
    __setStoreForTests(failingStore(store(), "saveFinding", (finding) => (finding as { state: string }).state === "current"));
    await expect(runChecksWith(runChecks, "code", body(draft))).rejects.toThrow("injected write failure");
    expect(store().listFindingsForDraft("d1")).toEqual(before);
    const runs = store().listCheckRunsForDraft("d1");
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ phase: "code", status: "failed" });
    expect(runs[0].error).toContain("Check failed before completing");
  });
});
