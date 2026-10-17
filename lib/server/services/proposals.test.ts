import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiErrorSchema, routes } from "../../contracts/api";
import { rulesFixture } from "../../contracts/fixtures";
import { GET as getRules } from "../../../app/api/rules/route";
import { GET as listProposalsRoute, POST as submitRoute } from "../../../app/api/proposals/route";
import { GET as getProposalRoute } from "../../../app/api/proposals/[proposal_id]/route";
import { POST as approveRoute } from "../../../app/api/proposals/[proposal_id]/approve/route";
import type { DriftContext, DriftResult, Proposal } from "../../contracts/domain";
import { approveProposal as approveService, submitProposal as submitService } from "./proposals";
import type { AppStore } from "./memory-repo";
import { __setSourceForTests, __setStoreForTests, getStore, resetStore } from "./context";
import { computeGate, currentFindings, currentRuns, currentRuleset } from "./state";
import { makeDraft, makeFinding, makeRun, testSabad } from "./testing";

const VERBATIM = "SYNTHETIC TEST rule: <script>alert(1)</script>  keep   spacing & \"quotes\" verbatim.";
const post = (url: string, body: unknown) => new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const get = (url: string) => new Request(`http://localhost${url}`);
const ctx = (proposal_id: string) => ({ params: Promise.resolve({ proposal_id }) });
const submitBody = { rule_text: VERBATIM, example: "SYNTHETIC TEST example", reason: "SYNTHETIC TEST reason", author: "Test author" };

async function submit(body: unknown = submitBody) {
  const response = await submitRoute(post("/api/proposals", body));
  expect(response.status).toBe(200);
  return routes.submitProposal.response.parse(await response.json());
}
const approve = (id: string, body: Record<string, unknown>) =>
  approveRoute(post(`/api/proposals/${id}/approve`, { proposal_id: id, ruleset_version: 1, actor: "Test approver", reason: "SYNTHETIC TEST approval reason", drift_override_reason: null, ...body }), ctx(id));
const errorOf = async (response: Response) => ApiErrorSchema.parse(await response.json()).error;
const addPublishedReference = () => getStore().saveReference({
  id: "PUB-0001", line_ids: ["TEST-SABAD-L1", "TEST-SABAD-L2"], english: "SYNTHETIC TEST published", source: "published", exceptions: [],
});

// Route tests use the offline stub path: no model key, so nothing can reach the network.
beforeEach(() => { vi.stubEnv("ANTHROPIC_API_KEY", ""); __setSourceForTests(testSabad()); });
afterEach(() => { vi.unstubAllEnvs(); __setSourceForTests(undefined); __setStoreForTests(null); });

describe("listRules", () => {
  it("returns ruleset v1 with the 66 seeded rules, unchanged", async () => {
    const response = await getRules(get("/api/rules"));
    expect(response.status).toBe(200);
    const body = routes.listRules.response.parse(await response.json());
    expect(body.ruleset_version).toBe(1);
    expect(body.rules).toHaveLength(66);
    expect(body.rules.map((rule) => rule.id).sort()).toEqual(rulesFixture.map((rule) => rule.id).sort());
  });
});

describe("submitProposal / getProposal / listProposals", () => {
  it("creates a pending free_text proposal with the rule text stored verbatim", async () => {
    const { proposal, drift_results } = await submit();
    expect(proposal).toMatchObject({ id: "PR-001", source: "free_text", status: "pending", evidence_ids: [], author: "Test author", rule_text: VERBATIM });
    expect(drift_results.map((result) => result.assessment.check)).toEqual(["contradiction", "reference_replay", "glossary_collision"]);
    expect(drift_results.every((result) => result.override === null && result.proposal_id === "PR-001")).toBe(true);
    // Nothing about the rule text changed the ruleset.
    expect(currentRuleset(getStore()).version).toBe(1);
  });

  it("replay passes with no published references; the other checks are honestly not evaluable", async () => {
    const { drift_results } = await submit();
    const byCheck = Object.fromEntries(drift_results.map((result) => [result.assessment.check, result.assessment]));
    expect(byCheck.reference_replay).toMatchObject({ status: "evaluated", outcome: "pass", evidence: { affected_count: 0, affected_line_ids: [], reference_ids: [] } });
    expect(byCheck.contradiction).toMatchObject({ status: "not_evaluable" });
    expect(byCheck.glossary_collision).toMatchObject({ status: "not_evaluable", reason: expect.stringContaining("OQ-13") });
  });

  it("replay blocks when a published reference exists, citing its IDs and unique line IDs", async () => {
    addPublishedReference();
    getStore().saveReference({ id: "PUB-0002", line_ids: ["TEST-SABAD-L2"], english: "SYNTHETIC TEST published 2", source: "published", exceptions: [] });
    // A non-published reference must not be counted.
    getStore().saveReference({ id: "SIK-1", line_ids: ["TEST-SABAD-L3"], english: "SYNTHETIC TEST sample", source: "sikhri_sample", exceptions: [] });
    const { drift_results } = await submit();
    const replay = drift_results.find((result) => result.assessment.check === "reference_replay")!.assessment;
    expect(replay.status).toBe("evaluated");
    if (replay.status !== "evaluated") throw new Error("unreachable");
    expect(replay.outcome).toBe("block");
    expect(replay.reason).toMatch(/^Synthetic replay stub/);
    expect(replay.evidence.reference_ids.sort()).toEqual(["PUB-0001", "PUB-0002"]);
    expect(replay.evidence.affected_line_ids.sort()).toEqual(["TEST-SABAD-L1", "TEST-SABAD-L2"]);
    expect(replay.evidence.affected_count).toBe(2);
    expect(replay.evidence.source_counts).toEqual({ sikhri_sample: 0, published: 2 });
  });

  it("rejects blank fields at the boundary and creates nothing", async () => {
    const response = await submitRoute(post("/api/proposals", { ...submitBody, reason: "   " }));
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("invalid_request");
    expect(getStore().listProposals()).toEqual([]);
  });

  it("lists proposals oldest first and gets one with its drift results", async () => {
    await submit();
    await submit({ ...submitBody, rule_text: "SYNTHETIC TEST second rule" });
    const list = routes.listProposals.response.parse(await (await listProposalsRoute(get("/api/proposals"))).json());
    expect(list.proposals.map((proposal) => proposal.id)).toEqual(["PR-001", "PR-002"]);
    const one = routes.getProposal.response.parse(await (await getProposalRoute(get("/api/proposals/PR-002"), ctx("PR-002"))).json());
    expect(one.proposal.id).toBe("PR-002");
    expect(one.drift_results).toHaveLength(3);
    expect(one.drift_results.every((result) => result.proposal_id === "PR-002")).toBe(true);
  });

  it("returns not_found for an unknown proposal", async () => {
    const response = await getProposalRoute(get("/api/proposals/PR-404"), ctx("PR-404"));
    expect(response.status).toBe(404);
    expect((await errorOf(response)).code).toBe("not_found");
  });
});

describe("approveProposal", () => {
  it("approves with reasons: saves v2 = v1 + the new rule, marks the proposal approved", async () => {
    await submit();
    const response = await approve("PR-001", {});
    expect(response.status).toBe(200);
    const body = routes.approveProposal.response.parse(await response.json());
    expect(body.ruleset_version).toBe(2);
    expect(body.rule).toMatchObject({
      id: "PROP-001", text: VERBATIM, level: "SHOULD", layers: ["transcreation"], plan: "free_text_llm", severity: "warning", decision: null,
      version: 2, status: "approved", source: "proposal", source_tag: "proposal", prefilter: null,
      resolution: { active: true, scope: "p0_check", severity: "warning", blocks_publish: false, layers: ["transcreation"], conditional: null, decision: null },
      provenance: { actor: "Test approver", reason: "SYNTHETIC TEST approval reason" },
    });
    expect(body.approval).toMatchObject({ proposal_id: "PR-001", ruleset_version: 2, drift_override: null, provenance: { actor: "Test approver" } });

    const listed = routes.listRules.response.parse(await (await getRules(get("/api/rules"))).json());
    expect(listed.ruleset_version).toBe(2);
    expect(listed.rules).toHaveLength(67);
    expect(listed.rules.find((rule) => rule.id === "PROP-001")?.text).toBe(VERBATIM);
    // v1 is untouched and the seeded rules keep their own versions.
    expect(getStore().getRuleset(1)).toHaveLength(66);
    expect(getStore().getProposal("PR-001")?.status).toBe("approved");
  });

  it("rejects a blocked proposal without an override reason (409 drift_blocked) and leaves everything unchanged", async () => {
    addPublishedReference();
    await submit();
    for (const override of [null, "", "   "]) {
      const response = await approve("PR-001", { drift_override_reason: override });
      // A blank string fails the request contract; null reaches the service. Either way nothing changes.
      expect([400, 409]).toContain(response.status);
      if (override === null) {
        expect(response.status).toBe(409);
        expect((await errorOf(response)).code).toBe("drift_blocked");
      }
      expect(getStore().getLatestRulesetVersion()).toBe(1);
      expect(getStore().getRuleset(2)).toEqual([]);
      expect(getStore().getProposal("PR-001")?.status).toBe("pending");
      expect(getStore().listDriftResultsForProposal("PR-001").every((result) => result.override === null)).toBe(true);
    }
  });

  it("approves a blocked proposal with an override reason and records the override on the blocking result", async () => {
    addPublishedReference();
    await submit();
    const response = await approve("PR-001", { drift_override_reason: "SYNTHETIC TEST override reason" });
    expect(response.status).toBe(200);
    const body = routes.approveProposal.response.parse(await response.json());
    expect(body.approval.drift_override).toMatchObject({ actor: "Test approver", reason: "SYNTHETIC TEST override reason" });
    expect(body.ruleset_version).toBe(2);
    const results = getStore().listDriftResultsForProposal("PR-001");
    const replay = results.find((result) => result.assessment.check === "reference_replay")!;
    expect(replay.override).toMatchObject({ reason: "SYNTHETIC TEST override reason" });
    expect(results.filter((result) => result.override !== null)).toHaveLength(1);
  });

  it("does not record a drift override when nothing blocks, even if a reason is supplied", async () => {
    await submit();
    const body = routes.approveProposal.response.parse(await (await approve("PR-001", { drift_override_reason: "SYNTHETIC TEST unneeded" })).json());
    expect(body.approval.drift_override).toBeNull();
  });

  it("rejects a stale ruleset_version with 409 version_conflict and changes nothing", async () => {
    await submit();
    const response = await approve("PR-001", { ruleset_version: 7 });
    expect(response.status).toBe(409);
    expect((await errorOf(response)).code).toBe("version_conflict");
    expect(getStore().getLatestRulesetVersion()).toBe(1);
    expect(getStore().getProposal("PR-001")?.status).toBe("pending");
  });

  it("rejects a blank reason and an unknown or already-decided proposal", async () => {
    await submit();
    const blank = await approve("PR-001", { reason: "  " });
    expect(blank.status).toBe(400);
    expect(getStore().getLatestRulesetVersion()).toBe(1);

    const missing = await approve("PR-404", {});
    expect(missing.status).toBe(404);

    expect((await approve("PR-001", {})).status).toBe(200);
    const again = await approve("PR-001", { ruleset_version: 2 });
    expect(again.status).toBe(400);
    expect((await errorOf(again)).code).toBe("invalid_request");
    expect(getStore().getLatestRulesetVersion()).toBe(2);
  });

  it("assigns sequential rule IDs and versions across approvals", async () => {
    await submit();
    await submit({ ...submitBody, rule_text: "SYNTHETIC TEST second rule" });
    await approve("PR-001", {});
    const second = routes.approveProposal.response.parse(await (await approve("PR-002", { ruleset_version: 2 })).json());
    expect(second.rule).toMatchObject({ id: "PROP-002", version: 3 });
    expect(getStore().getRuleset(3)).toHaveLength(68);
  });

  it("leaves no partial state if the new ruleset cannot be saved", async () => {
    await submit();
    const store = getStore();
    const original = store.saveRuleset.bind(store);
    store.saveRuleset = () => { throw new Error("simulated write failure"); };
    const response = await approve("PR-001", {});
    store.saveRuleset = original;
    expect(response.status).toBe(500);
    expect(store.getLatestRulesetVersion()).toBe(1);
    expect(store.getProposal("PR-001")?.status).toBe("pending");
  });

  it("keeps old findings tied to v1: reports and gates show checks missing until re-run", async () => {
    const store = resetStore();
    const draft = makeDraft();
    store.saveDraft(draft);
    store.saveFinding(makeFinding({ severity: "warning" }));
    store.saveCheckRun(makeRun({ id: "run-code", phase: "code" }));
    store.saveCheckRun(makeRun({ id: "run-llm", phase: "llm" }));
    expect(currentFindings(store, draft, 1)).toHaveLength(1);
    expect(computeGate(store, draft).can_publish).toBe(true);

    await submit();
    expect((await approve("PR-001", {})).status).toBe(200);

    expect(currentFindings(store, draft, 2)).toEqual([]);
    expect(currentRuns(store, draft, 2)).toEqual([]);
    const gate = computeGate(store, draft);
    expect(gate.ruleset_version).toBe(2);
    expect(gate.can_publish).toBe(false);
    expect(gate.blockers).toEqual([
      { kind: "check_phase", draft_id: draft.id, phase: "code", status: "missing" },
      { kind: "check_phase", draft_id: draft.id, phase: "llm", status: "missing" },
    ]);
    // History is kept under the old ruleset version.
    expect(store.listFindingsForDraft(draft.id)).toHaveLength(1);
    expect(store.listFindingsForDraft(draft.id)[0].ruleset_version).toBe(1);
  });
});

describe("submitProposal drift paths", () => {
  const request = { rule_text: VERBATIM, example: "SYNTHETIC TEST example", reason: "SYNTHETIC TEST reason", author: "Test author" };

  it("with no model configured, uses the labelled synthetic stub and never calls the engine", async () => {
    const runDriftCheck = vi.fn();
    const { drift_results } = await submitService(request, { hasModel: () => false, runDriftCheck });
    expect(runDriftCheck).not.toHaveBeenCalled();
    expect(drift_results.map((result) => result.assessment.check)).toEqual(["contradiction", "reference_replay", "glossary_collision"]);
    expect(drift_results.find((result) => result.assessment.check === "reference_replay")?.assessment.reason).toMatch(/^Synthetic replay stub/);
  });

  it("with a model configured, calls the engine drift check with the current rules, references and no glossary, and stores its results", async () => {
    addPublishedReference();
    const seen: { proposal?: Proposal; context?: DriftContext } = {};
    const runDriftCheck = vi.fn(async (proposal: Proposal, context: DriftContext): Promise<DriftResult[]> => {
      seen.proposal = proposal;
      seen.context = context;
      return [{
        id: `drift:${proposal.id}:duplicate`, proposal_id: proposal.id, override: null,
        assessment: { status: "evaluated", check: "duplicate", outcome: "warn", reason: "SYNTHETIC TEST engine result.", evidence: { rule_ids: ["TERM-01"], reference_ids: [], affected_line_ids: [], affected_count: 0, source_counts: { sikhri_sample: 0, published: 0 } } },
      }, {
        id: `drift:${proposal.id}:glossary_collision`, proposal_id: proposal.id, override: null,
        assessment: { status: "not_evaluable", check: "glossary_collision", reason: "SYNTHETIC TEST no glossary." },
      }];
    });
    const response = await submitService(request, { hasModel: () => true, runDriftCheck });
    expect(runDriftCheck).toHaveBeenCalledTimes(1);
    expect(seen.proposal).toMatchObject({ id: "PR-001", rule_text: VERBATIM, status: "pending" });
    expect(seen.context).toMatchObject({ rulesetVersion: 1, glossary: null });
    expect(seen.context?.rules).toHaveLength(66);
    expect(seen.context?.references.map((reference) => reference.id)).toEqual(["PUB-0001"]);
    // The engine's results are returned and persisted as-is; the stub's results are not mixed in.
    expect(response.drift_results.map((result) => result.id)).toEqual(["drift:PR-001:duplicate", "drift:PR-001:glossary_collision"]);
    expect(getStore().listDriftResultsForProposal("PR-001")).toHaveLength(2);
    expect(routes.submitProposal.response.parse(response)).toBeTruthy();
  });

  it("saves nothing when the engine drift check fails", async () => {
    const runDriftCheck = vi.fn(async () => { throw new Error("simulated model failure"); });
    await expect(submitService(request, { hasModel: () => true, runDriftCheck })).rejects.toThrow("simulated model failure");
    expect(getStore().listProposals()).toEqual([]);
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

describe("transaction atomicity", () => {
  it("approve: a failing proposal write leaves the ruleset version unchanged and the proposal pending", async () => {
    await submit();
    const base = getStore();
    __setStoreForTests(failingStore(base, "saveProposal"));
    expect(() => approveService({ proposal_id: "PR-001", ruleset_version: 1, actor: "Test approver", reason: "SYNTHETIC TEST approval reason", drift_override_reason: null }))
      .toThrow("injected write failure");
    expect(base.getLatestRulesetVersion()).toBe(1);
    expect(base.getRuleset(2)).toEqual([]);
    expect(base.getProposal("PR-001")?.status).toBe("pending");
  });
  it("approve: a failing drift override write rolls back the ruleset and proposal too", async () => {
    addPublishedReference();
    await submit();
    const base = getStore();
    __setStoreForTests(failingStore(base, "saveDriftResult"));
    expect(() => approveService({ proposal_id: "PR-001", ruleset_version: 1, actor: "Test approver", reason: "SYNTHETIC TEST approval reason", drift_override_reason: "SYNTHETIC TEST override" }))
      .toThrow("injected write failure");
    expect(base.getLatestRulesetVersion()).toBe(1);
    expect(base.getProposal("PR-001")?.status).toBe("pending");
    expect(base.listDriftResultsForProposal("PR-001").every((result) => result.override === null)).toBe(true);
  });
  it("submit: a failing drift result write leaves no proposal and no drift results", async () => {
    const base = getStore();
    __setStoreForTests(failingStore(base, "saveDriftResult"));
    await expect(submitService(submitBody, { hasModel: () => false })).rejects.toThrow("injected write failure");
    expect(base.listProposals()).toEqual([]);
    expect(base.listDriftResultsForProposal("PR-001")).toEqual([]);
  });
});
