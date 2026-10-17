import { beforeEach, describe, expect, it, vi } from "vitest";
import { rulesFixture } from "../../contracts/fixtures";
import { createMemoryRepository, type AppStore } from "./memory-repo";
import { allDrafts, clearFindings, computeGate, currentFindings, currentRuleset, currentRuns, latestRun, sabadDrafts } from "./state";
import { makeDraft, makeFinding, makeRun, testSabad, TEST_AT } from "./testing";

let store: AppStore;
const draft = makeDraft();
beforeEach(() => {
  store = createMemoryRepository();
  store.saveRuleset(1, rulesFixture);
  store.saveSabad(testSabad());
  store.saveDraft(draft);
});
const bothRuns = () => { store.saveCheckRun(makeRun()); store.saveCheckRun(makeRun({ id: "run-t2", phase: "llm" })); };

describe("currentFindings", () => {
  it("keeps only current findings for this draft version and ruleset version", () => {
    const keep = makeFinding();
    store.saveFinding(keep);
    store.saveFinding(makeFinding({ id: "f-cleared", state: "cleared", cleared_at: TEST_AT }));
    store.saveFinding(makeFinding({ id: "f-old-draft", draft_version: 2 }));
    store.saveFinding(makeFinding({ id: "f-old-rules", ruleset_version: 2 }));
    store.saveFinding(makeFinding({ id: "f-other-draft", draft_id: "other" }));
    expect(currentFindings(store, draft, 1)).toEqual([keep]);
    expect(currentFindings(store, { ...draft, version: 2 }, 2)).toEqual([]);
  });
});

describe("runs and ruleset", () => {
  it("scopes runs to the draft and ruleset version and picks the latest per phase", () => {
    store.saveCheckRun(makeRun());
    store.saveCheckRun(makeRun({ id: "run-old", draft_version: 2 }));
    store.saveCheckRun(makeRun({ id: "run-rules2", ruleset_version: 2 }));
    expect(currentRuns(store, draft, 1).map((run) => run.id)).toEqual(["run-t1"]);
    expect(latestRun(store, draft, "code", 1)?.id).toBe("run-t1");
    expect(latestRun(store, draft, "llm", 1)).toBeUndefined();
  });
  it("reads the latest ruleset", () => {
    expect(currentRuleset(store).version).toBe(1);
    expect(currentRuleset(store).rules).toHaveLength(rulesFixture.length);
    store.saveRuleset(2, rulesFixture);
    expect(currentRuleset(store).version).toBe(2);
  });
});

describe("computeGate", () => {
  beforeEach(() => {
    store.saveDraft(makeDraft({ id: "literal-flow", layer: "literal", text: "Synthetic literal." }));
    store.saveDraft(makeDraft({ id: "annotation-flow", layer: "annotation", source_word_start: 0, text: "literal; implied\nnoun; singular" }));
  });
  it("blocks on missing phases", () => {
    const gate = computeGate(store, draft);
    expect(gate.can_publish).toBe(false);
    expect(gate.blockers).toEqual([
      { kind: "check_phase", draft_id: draft.id, phase: "code", status: "missing" },
      { kind: "check_phase", draft_id: draft.id, phase: "llm", status: "missing" },
    ]);
  });
  it("reports pending and failed phases", () => {
    store.saveCheckRun(makeRun({ status: "pending", completed_at: null }));
    store.saveCheckRun(makeRun({ id: "run-t2", phase: "llm", status: "failed", error: "Synthetic failure." }));
    expect(computeGate(store, draft).blockers).toEqual([
      { kind: "check_phase", draft_id: draft.id, phase: "code", status: "pending" },
      { kind: "check_phase", draft_id: draft.id, phase: "llm", status: "failed" },
    ]);
  });
  it("passes when both phases succeeded and nothing blocks; warnings and hints do not block", () => {
    bothRuns();
    store.saveFinding(makeFinding({ id: "w1", severity: "warning" }));
    store.saveFinding(makeFinding({ id: "h1", severity: "hint" }));
    const gate = computeGate(store, draft);
    expect(gate).toEqual({ draft_id: draft.id, draft_version: 1, ruleset_version: 1, can_publish: true, blockers: [], warning_ids: ["w1"] });
  });
  it("blocks on current error and flag findings only", () => {
    bothRuns();
    store.saveFinding(makeFinding({ id: "e1" }));
    store.saveFinding(makeFinding({ id: "f1", severity: "flag" }));
    store.saveFinding(makeFinding({ id: "gone", state: "cleared", cleared_at: TEST_AT }));
    expect(computeGate(store, draft).blockers).toEqual([
      { kind: "finding", finding_id: "e1", rule_id: "LAYER-07", severity: "error" },
      { kind: "finding", finding_id: "f1", rule_id: "LAYER-07", severity: "flag" },
    ]);
  });
  it("turns CONS-01 findings into departure_reason blockers unless a reason is supplied", () => {
    bothRuns();
    store.saveFinding(makeFinding({ id: "c1", rule_id: "CONS-01", severity: "warning", reference_ids: ["PUB-0001"] }));
    expect(computeGate(store, draft).blockers).toEqual([{ kind: "departure_reason", finding_id: "c1", rule_id: "CONS-01" }]);
    const resolved = computeGate(store, draft, new Set(["c1"]));
    expect(resolved.can_publish).toBe(true);
    expect(resolved.warning_ids).toEqual(["c1"]);
  });
  it("ignores stale-version runs and findings", () => {
    bothRuns();
    store.saveFinding(makeFinding({ id: "stale", draft_version: 3 }));
    expect(computeGate(store, draft).can_publish).toBe(true);
    // A new draft version has no runs yet.
    expect(computeGate(store, { ...draft, version: 2 }).blockers).toHaveLength(2);
  });
  it("uses the store's latest ruleset version", () => {
    bothRuns();
    store.saveRuleset(2, rulesFixture);
    const gate = computeGate(store, draft);
    expect(gate.ruleset_version).toBe(2);
    expect(gate.blockers.every((b) => b.kind === "check_phase")).toBe(true);
  });
});

describe("clearFindings and sabadDrafts", () => {
  it("clears only matching current findings and stamps cleared_at", () => {
    store.saveFinding(makeFinding({ id: "a" }));
    store.saveFinding(makeFinding({ id: "b", rule_id: "TERM-01" }));
    const cleared = clearFindings(store, (f) => f.rule_id === "TERM-01", "2026-10-17T00:00:00.000Z");
    expect(cleared.map((f) => f.id)).toEqual(["b"]);
    expect(store.getFinding("b")).toMatchObject({ state: "cleared", cleared_at: "2026-10-17T00:00:00.000Z" });
    expect(store.getFinding("a")?.state).toBe("current");
  });
  it("lists a Sabad's drafts in source line order", () => {
    store.saveDraft(makeDraft({ id: "late", line_ids: ["TEST-SABAD-L4"] }));
    store.saveDraft(makeDraft({ id: "mid", line_ids: ["TEST-SABAD-L3", "TEST-SABAD-L2"] }));
    expect(sabadDrafts(store, "TEST-SABAD").map((d) => d.id)).toEqual([draft.id, "mid", "late"]);
    expect(sabadDrafts(store, "NOPE")).toEqual([]);
  });
});

describe("scoped scans", () => {
  it("clearFindings with draft IDs only touches those drafts", () => {
    store.saveDraft(makeDraft({ id: "other", line_ids: ["TEST-SABAD-L2"] }));
    store.saveFinding(makeFinding({ id: "mine" }));
    store.saveFinding(makeFinding({ id: "theirs", draft_id: "other" }));
    const cleared = clearFindings(store, () => true, TEST_AT, [draft.id]);
    expect(cleared.map((f) => f.id)).toEqual(["mine"]);
    expect(store.getFinding("mine")?.state).toBe("cleared");
    expect(store.getFinding("theirs")?.state).toBe("current");
    // An empty scope scans nothing; an unknown draft ID is harmless.
    expect(clearFindings(store, () => true, TEST_AT, [])).toEqual([]);
    expect(clearFindings(store, () => true, TEST_AT, ["nope"])).toEqual([]);
  });
  it("without draft IDs, scans every stored draft via listDrafts and never the Sabad table", () => {
    store.saveDraft(makeDraft({ id: "other", line_ids: ["TEST-SABAD-L2"] }));
    store.saveFinding(makeFinding({ id: "mine" }));
    store.saveFinding(makeFinding({ id: "theirs", draft_id: "other" }));
    const sabads = vi.spyOn(store, "listSabads");
    const cleared = clearFindings(store, () => true, TEST_AT);
    expect(cleared.map((f) => f.id).sort()).toEqual(["mine", "theirs"]);
    expect(sabads).not.toHaveBeenCalled();
  });
  it("allDrafts reads drafts, not every Sabad, and keeps source order within a Sabad", () => {
    store.saveSabad(testSabad("EMPTY-SABAD", 2));
    store.saveDraft(makeDraft({ id: "late", line_ids: ["TEST-SABAD-L4"] }));
    store.saveDraft(makeDraft({ id: "mid", line_ids: ["TEST-SABAD-L2"] }));
    const sabads = vi.spyOn(store, "listSabads");
    expect(allDrafts(store).map((d) => d.id)).toEqual([draft.id, "mid", "late"]);
    expect(sabads).not.toHaveBeenCalled();
  });
});
