import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../../contracts/api";
import { POST as decideRoute } from "../../../app/api/findings/[finding_id]/decisions/route";
import { GET as getProposalRoute } from "../../../app/api/proposals/[proposal_id]/route";
import { POST as approveRoute } from "../../../app/api/proposals/[proposal_id]/approve/route";
import { __setSourceForTests, getStore, resetStore } from "./context";
import { currentRuleset } from "./state";
import { makeDraft, makeFinding, testSabad } from "./testing";

const post = (body: unknown) => new Request("http://test/x", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

const RULE = "LAYER-07";
const override = async (findingId: string, reviewer: string, over: Record<string, unknown> = {}) =>
  decideRoute(post({ draft_id: "draft-t1", draft_version: 1, ruleset_version: 1, action: "override", reason: `SYNTHETIC reason from ${reviewer}`, reviewer, ...over }), ctx({ finding_id: findingId }));
const drafted = () => getStore().listProposals().filter((proposal) => proposal.source === "overrides");

beforeEach(() => {
  __setSourceForTests(testSabad());
  resetStore();
  getStore().saveDraft(makeDraft());
  for (const n of [1, 2, 3, 4]) getStore().saveFinding(makeFinding({ id: `finding-t${n}`, rule_id: n === 4 ? "LAYER-01" : RULE }));
});
afterEach(() => { vi.restoreAllMocks(); __setSourceForTests(undefined); });

describe("proposals drafted from repeated overrides (FR-16b)", () => {
  it("one override, or only a waive, drafts nothing", async () => {
    expect((await override("finding-t1", "Asha")).status).toBe(200);
    expect((await override("finding-t2", "Ben", { action: "waive" })).status).toBe(200);
    expect(drafted()).toEqual([]);
  });

  it("two distinct reviewers overriding one rule draft exactly one pending proposal with the evidence", async () => {
    await override("finding-t1", "Asha");
    expect(drafted()).toEqual([]);
    expect((await override("finding-t2", "Ben")).status).toBe(200);
    const [proposal, ...rest] = drafted();
    expect(rest).toEqual([]);
    const decisions = getStore().listDecisionsForDraft("draft-t1");
    expect(proposal).toMatchObject({ id: "PR-001", source: "overrides", status: "pending", author: "Eko (drafted from overrides)" });
    expect(proposal.evidence_ids).toEqual([RULE, decisions[0].id, "finding-t1", decisions[1].id, "finding-t2"]);
    expect(proposal.reason).toContain("Asha");
    expect(proposal.reason).toContain("SYNTHETIC reason from Ben");
    expect(proposal.rule_text).toContain(currentRuleset(getStore()).rules.find((rule) => rule.id === RULE)!.text);
    // Drift is deferred and labelled unavailable, never passed.
    const drift = getStore().listDriftResultsForProposal(proposal.id);
    expect(drift.length).toBeGreaterThan(0);
    expect(drift.every((result) => result.assessment.status === "not_evaluable" && result.override === null)).toBe(true);
    // It is readable through the normal proposal view and satisfies the contract.
    const view = routes.getProposal.response.parse(await (await getProposalRoute(new Request("http://test/x"), ctx({ proposal_id: proposal.id }))).json());
    expect(view.proposal.id).toBe(proposal.id);
  });

  it("the same name twice (any case or spacing) drafts nothing", async () => {
    await override("finding-t1", "Asha");
    await override("finding-t2", "  asha ");
    expect(drafted()).toEqual([]);
  });

  it("overrides of different rules are counted separately", async () => {
    await override("finding-t1", "Asha");
    await override("finding-t4", "Ben");
    expect(drafted()).toEqual([]);
  });

  it("a third override keeps one proposal and adds its evidence", async () => {
    await override("finding-t1", "Asha");
    await override("finding-t2", "Ben");
    const first = drafted()[0];
    await override("finding-t3", "Cara");
    const [proposal, ...rest] = drafted();
    expect(rest).toEqual([]);
    expect(proposal.id).toBe(first.id);
    expect(proposal.evidence_ids).toHaveLength(first.evidence_ids.length + 2);
    expect(proposal.evidence_ids).toContain("finding-t3");
    expect(proposal.reason).toContain("Cara");
    expect(getStore().listDriftResultsForProposal(proposal.id)).toHaveLength(3);
  });

  it("is not approved, does not change the ruleset, and approval still needs a reason", async () => {
    await override("finding-t1", "Asha");
    await override("finding-t2", "Ben");
    const proposal = drafted()[0];
    expect(proposal.status).toBe("pending");
    expect(getStore().getLatestRulesetVersion()).toBe(1);

    const approve = (reason: string) => approveRoute(post({ proposal_id: proposal.id, ruleset_version: 1, actor: "Approver", reason, drift_override_reason: null }), ctx({ proposal_id: proposal.id }));
    expect((await approve("  ")).status).toBe(400);
    expect(getStore().getLatestRulesetVersion()).toBe(1);
    expect((await approve("SYNTHETIC approval reason")).status).toBe(200);
    expect(getStore().getLatestRulesetVersion()).toBe(2);
    expect(getStore().getProposal(proposal.id)?.status).toBe("approved");
  });

  it("rolls back the decision when drafting fails", async () => {
    await override("finding-t1", "Asha");
    vi.spyOn(getStore(), "saveProposal").mockImplementation(() => { throw new Error("SYNTHETIC write failure"); });
    const response = await override("finding-t2", "Ben");
    expect(response.status).toBeGreaterThanOrEqual(500);
    vi.restoreAllMocks();
    expect(getStore().listDecisionsForDraft("draft-t1")).toHaveLength(1);
    expect(getStore().getFinding("finding-t2")?.state).toBe("current");
    expect(drafted()).toEqual([]);
  });
});
