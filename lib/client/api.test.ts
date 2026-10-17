import { beforeEach, describe, expect, it } from "vitest";
import { ApiClientError, createApiClient } from "./api";
import { __setMockDelaysForTests, __setMockSabadForTests, mockPublication, resetMockStore, setMockEvalMode } from "./mock-handler";
import { runMockChecks } from "./mock-checks";
import { rulesFixture } from "../contracts/fixtures";
import type { Sabad } from "../contracts/domain";

// Source text in tests is an ASCII marker, never Gurmukhi.
const testSabad: Sabad = {
  shabad_id: "TEST-SABAD",
  lines: [1, 2, 3, 4, 5].map((n) => ({ line_id: `TEST-L${n}`, shabad_id: "TEST-SABAD", ang: 1, raag: "TEST-RAAG", writer: "TEST-WRITER", is_rahao: n === 2, gurmukhi: `TEST-SOURCE-${n}` })),
};
const client = createApiClient({ useMocks: true });

beforeEach(() => {
  __setMockSabadForTests(null);
  __setMockDelaysForTests({ code: 0, llm: 0 });
  resetMockStore();
  setMockEvalMode("unavailable");
});

describe("typed client boundary", () => {
  it("uses schema-validated fixtures and reports missing private source explicitly", async () => {
    expect((await client.request("listRules", {})).rules).toHaveLength(66);
    expect((await client.request("getSabad", { shabad_id: "55" })).status).toBe("unavailable");
    expect((await client.request("listSabads", {})).sabads).toEqual([]);
    expect((await client.request("getEval", {})).status).toBe("unavailable");
  });
  it("validates the request before reaching a transport", async () => {
    let calls = 0;
    const real = createApiClient({ useMocks: false, fetcher: async () => { calls++; return new Response("{}"); } });
    await expect(real.request("decide", { finding_id: "f", draft_id: "d", draft_version: 1, ruleset_version: 1, action: "waive", reason: " ", reviewer: "Test" })).rejects.toThrow();
    expect(calls).toBe(0);
  });
  it("encodes path IDs and validates actual transport responses", async () => {
    let url = "";
    const real = createApiClient({ useMocks: false, fetcher: async (input) => { url = String(input); return Response.json({ status: "unavailable", reason: "Source unavailable." }); } });
    expect((await real.request("getSabad", { shabad_id: "id/with space" })).status).toBe("unavailable");
    expect(url).toBe("/api/sabads/id%2Fwith%20space");
    const malformed = createApiClient({ useMocks: false, fetcher: async () => Response.json({ catch_rate: 1 }) });
    await expect(malformed.request("getEval", {})).rejects.toThrow();
  });
  it("turns mock failures into typed errors", async () => {
    await expect(client.request("publish", { draft_id: "missing", draft_version: 1, ruleset_version: 1, actor: "Test", departure_reasons: [] })).rejects.toMatchObject({ code: "not_found" });
    expect(ApiClientError).toBeDefined();
  });
  it("serves a synthetic evaluation sample only when asked", async () => {
    setMockEvalMode("synthetic");
    const run = await client.request("getEval", {});
    expect(run.status === "available" && run.data_label).toBe("synthetic_test");
    if (run.status !== "available") return;
    expect(run.at).toBe("2026-10-16T12:00:00.000Z");
    expect(run.catch_rate.denominator).toBe(run.n_corrections);
    const perRule = run.per_rule;
    const sum = (pick: (r: (typeof perRule)[number]) => number) => perRule.reduce((t, r) => t + pick(r), 0);
    expect(sum((r) => r.catch_rate.numerator)).toBe(run.catch_rate.numerator);
    expect(sum((r) => r.false_flag_rate.denominator)).toBe(run.n_findings);
    for (const r of perRule) {
      expect(r.catch_rate.numerator).toBeLessThanOrEqual(r.catch_rate.denominator);
      expect(r.false_flag_rate.numerator).toBeLessThanOrEqual(r.false_flag_rate.denominator);
    }
  });
});

describe("synthetic checker", () => {
  it("reports exact UTF-16 spans and lists unevaluated rules", () => {
    const draft = { id: "d1", shabad_id: "s", line_ids: ["l"], layer: "transcreation" as const, text: "He is the Lord [x] and thee.", author: "T", status: "draft" as const, version: 1, updated_at: "2026-10-16T12:00:00.000Z" };
    const result = runMockChecks([draft], rulesFixture, 1, "code");
    expect(result.findings.map((f) => f.rule_id).sort()).toEqual(["LAYER-06", "LAYER-07", "TERM-01"]);
    for (const f of result.findings) expect(draft.text.slice(f.start, f.end)).toBe(f.quoted_span);
    expect(result.notEvaluable.every((n) => n.reason.startsWith("Mock mode: no real code check ran"))).toBe(true);
    const ids = (r: typeof result) => r.notEvaluable.map((n) => n.ruleId);
    expect(ids(result)).toContain("TERM-07");
    for (const evaluated of ["TERM-01", "LAYER-07", "LAYER-06"]) expect(ids(result)).not.toContain(evaluated);
    const llm = runMockChecks([draft], rulesFixture, 1, "llm");
    expect(ids(llm)).not.toContain("TERM-07");
    for (const other of ["TERM-01", "LAYER-07", "LAYER-06"]) expect(ids(llm)).toContain(other);
  });
});

describe("stateful mock workflow", () => {
  it("runs write, check, decide, publish and propose end to end", async () => {
    __setMockSabadForTests(testSabad);
    const text = "Praise the Lord (here).";
    const { draft } = await client.request("saveDraft", { draft_id: null, expected_version: null, shabad_id: "TEST-SABAD", line_ids: ["TEST-L1"], text, author: "Tester" });
    expect(draft.version).toBe(1);
    await expect(client.request("saveDraft", { draft_id: draft.id, expected_version: 7, shabad_id: "TEST-SABAD", line_ids: ["TEST-L1"], text: "x", author: "Tester" })).rejects.toMatchObject({ code: "version_conflict" });
    await expect(client.request("saveDraft", { draft_id: null, expected_version: null, shabad_id: "TEST-SABAD", line_ids: ["NOPE"], text: "x", author: "Tester" })).rejects.toMatchObject({ code: "invalid_request" });

    const base = { draft_id: draft.id, draft_version: 1, ruleset_version: 1 };
    const code = await client.request("runCodeChecks", { ...base, changed_line_ids: ["TEST-L1"] });
    const found = code.result.findings;
    expect(found.map((f) => f.rule_id).sort()).toEqual(["LAYER-07", "TERM-01"]);
    for (const f of found) expect(text.slice(f.start, f.end)).toBe(f.quoted_span);
    expect(found.find((f) => f.rule_id === "TERM-01")?.quoted_span).toBe("Lord");
    expect(found.every((f) => f.model === "mock-ui-stub" && f.explanation.startsWith("Mock finding (synthetic, no real check ran)"))).toBe(true);

    const gate = await client.request("getPublishGate", { draft_id: draft.id });
    expect(gate.can_publish).toBe(false);
    expect(gate.blockers.filter((b) => b.kind === "finding")).toHaveLength(2);
    expect(gate.blockers).toContainEqual({ kind: "check_phase", draft_id: draft.id, phase: "llm", status: "missing" });

    const decide = (finding_id: string, reason: string) => client.request("decide", { ...base, finding_id, action: "override", reason, reviewer: "Reviewer" });
    await expect(decide(found[0].id, "   ")).rejects.toThrow();
    for (const f of found) {
      const done = await decide(f.id, "Context justifies this.");
      expect(done.finding.state).toBe("cleared");
    }
    // Overridden findings stay cleared when the same version is re-checked.
    expect((await client.request("runCodeChecks", { ...base, changed_line_ids: ["TEST-L1"] })).result.findings).toHaveLength(0);

    const publishArgs = { ...base, actor: "Approver", departure_reasons: [] };
    await expect(client.request("publish", publishArgs)).rejects.toMatchObject({ code: "publish_blocked" });
    const llm = await client.request("runLlmChecks", { ...base, changed_line_ids: ["TEST-L1"] });
    expect(llm.check_runs[0].status).toBe("succeeded");
    const published = await client.request("publish", publishArgs);
    expect(published.draft.status).toBe("published");
    expect(published.reference.id).toBe("PUB-0001");
    expect(published.reference.english).toBe(text);
    expect(published.reference.exceptions.map((e) => e.action)).toEqual(["override", "override"]);
    const listed = await client.request("listPublications", { shabad_id: "TEST-SABAD" });
    expect(listed.publications).toHaveLength(1);
    expect(listed.publications[0]).toMatchObject({ draft_id: draft.id, approver: "Approver", reference: { id: "PUB-0001" }, gate: published.gate });
    expect((await client.request("listPublications", { shabad_id: "OTHER" })).publications).toEqual([]);
    const publication = mockPublication(draft.id);
    expect(publication).toMatchObject({ reference_id: "PUB-0001", approver: "Approver" });
    expect(publication?.gate).toEqual(published.gate);
    // Editing a published (or ready) draft puts it back to draft status.
    const edited = await client.request("saveDraft", { draft_id: draft.id, expected_version: 1, shabad_id: "TEST-SABAD", line_ids: ["TEST-L1"], text: "Edited text.", author: "Tester" });
    expect(edited.draft.status).toBe("draft");
    expect(edited.draft.version).toBe(2);

    const proposed = await client.request("submitProposal", { rule_text: "Test rule text.", example: "Test example", reason: "Test reason", author: "Proposer" });
    expect(proposed.proposal.id).toBe("PR-001");
    const replay = proposed.drift_results.find((d) => d.assessment.check === "reference_replay");
    expect(replay?.assessment).toMatchObject({ status: "evaluated", outcome: "block" });
    const approval = { proposal_id: proposed.proposal.id, ruleset_version: 1, actor: "Approver", reason: "Reasoned approval." };
    await expect(client.request("approveProposal", { ...approval, drift_override_reason: null })).rejects.toMatchObject({ code: "drift_blocked" });
    expect((await client.request("listRules", {})).ruleset_version).toBe(1);
    const approved = await client.request("approveProposal", { ...approval, drift_override_reason: "Override the replay block." });
    expect(approved.ruleset_version).toBe(2);
    expect(approved.rule.text).toBe("Test rule text.");
    expect((await client.request("listRules", {})).rules).toHaveLength(67);
    // The ruleset changed: old runs no longer count, so the gate asks for both phases again.
    const after = await client.request("getPublishGate", { draft_id: draft.id });
    expect(after.ruleset_version).toBe(2);
    expect(after.blockers.filter((b) => b.kind === "check_phase")).toHaveLength(2);
  });

  it("replaces overlapped drafts when a grouped draft is saved", async () => {
    __setMockSabadForTests(testSabad);
    const save = (line_ids: string[]) => client.request("saveDraft", { draft_id: null, expected_version: null, shabad_id: "TEST-SABAD", line_ids, text: "one", author: "Tester" });
    await save(["TEST-L1"]);
    await save(["TEST-L2"]);
    await save(["TEST-L1", "TEST-L2"]);
    const sabad = await client.request("getSabad", { shabad_id: "TEST-SABAD" });
    // The seeded demo units also exist; only the drafts touching L1/L2 matter here.
    const touching = sabad.status === "available" ? sabad.drafts.filter((d) => d.line_ids.some((id) => id === "TEST-L1" || id === "TEST-L2")) : [];
    expect(touching.map((d) => d.line_ids)).toEqual([["TEST-L1", "TEST-L2"]]);
  });

  it("drops a stale model-check result when the draft changes mid-run", async () => {
    __setMockSabadForTests(testSabad);
    __setMockDelaysForTests({ llm: 30 });
    const { draft } = await client.request("saveDraft", { draft_id: null, expected_version: null, shabad_id: "TEST-SABAD", line_ids: ["TEST-L1"], text: "first", author: "Tester" });
    const running = client.request("runLlmChecks", { draft_id: draft.id, draft_version: 1, ruleset_version: 1, changed_line_ids: ["TEST-L1"] });
    const midReport = await client.request("getReport", { draft_id: draft.id });
    expect(midReport.check_runs.some((r) => r.phase === "llm" && r.status === "pending")).toBe(true);
    await client.request("saveDraft", { draft_id: draft.id, expected_version: 1, shabad_id: "TEST-SABAD", line_ids: ["TEST-L1"], text: "second", author: "Tester" });
    await expect(running).rejects.toMatchObject({ code: "version_conflict" });
  });
});
