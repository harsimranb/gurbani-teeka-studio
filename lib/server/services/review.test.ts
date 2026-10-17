import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiErrorSchema, routes, type RouteName } from "../../contracts/api";
import { GET as reviewRoute } from "../../../app/api/review/route";
import { POST as readyRoute } from "../../../app/api/drafts/[draft_id]/ready/route";
import { POST as decideRoute } from "../../../app/api/findings/[finding_id]/decisions/route";
import { GET as gateRoute } from "../../../app/api/drafts/[draft_id]/publish-gate/route";
import { POST as publishRoute } from "../../../app/api/drafts/[draft_id]/publish/route";
import { GET as referenceRoute } from "../../../app/api/references/[reference_id]/route";
import { GET as publicationsRoute } from "../../../app/api/sabads/[shabad_id]/publications/route";
import { __setSourceForTests, getStore, resetStore } from "./context";
import { __setIndexReferencesForTests, publish } from "./review";
import { makeDraft, makeFinding, makeRun, testSabad } from "./testing";

const post = (body: unknown) => new Request("http://test/x", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const get = () => new Request("http://test/x", { method: "GET" });
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

/** Asserts a 200 response parses with the route's contract and returns the parsed body. */
async function ok<N extends RouteName>(name: N, response: Response): Promise<ReturnType<(typeof routes)[N]["response"]["parse"]>> {
  expect(response.status).toBe(200);
  return routes[name].response.parse(await response.json()) as ReturnType<(typeof routes)[N]["response"]["parse"]>;
}
async function fail(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  const body = ApiErrorSchema.parse(await response.json());
  expect(body.error.code).toBe(code);
  return body.error;
}

const bothRuns = (draftId = "draft-t1") => {
  getStore().saveCheckRun(makeRun({ id: `run-code-${draftId}`, draft_id: draftId }));
  getStore().saveCheckRun(makeRun({ id: `run-llm-${draftId}`, draft_id: draftId, phase: "llm" }));
};
const decideBody = (over: Record<string, unknown> = {}) => ({ draft_id: "draft-t1", draft_version: 1, ruleset_version: 1, action: "override", reason: "Synthetic reviewer reason.", reviewer: "Reviewer", ...over });
const publishBody = (over: Record<string, unknown> = {}) => ({ draft_version: 1, ruleset_version: 1, actor: "Approver", departure_reasons: [], ...over });

beforeEach(() => {
  __setSourceForTests(testSabad());
  resetStore();
  getStore().saveDraft(makeDraft());
  __setIndexReferencesForTests(async () => {}); // never start the real embedder
});
afterEach(() => __setIndexReferencesForTests(undefined));

describe("markReady and reviewQueue", () => {
  it("moves a draft into the review queue, in source order, and rejects a stale version", async () => {
    getStore().saveDraft(makeDraft({ id: "draft-t2", line_ids: ["TEST-SABAD-L3"], status: "changes_requested" }));
    getStore().saveDraft(makeDraft({ id: "draft-t3", line_ids: ["TEST-SABAD-L2"] }));
    await fail(await readyRoute(post({ draft_version: 2, actor: "Writer" }), ctx({ draft_id: "draft-t1" })), 409, "version_conflict");
    await fail(await readyRoute(post({ draft_version: 1, actor: "Writer" }), ctx({ draft_id: "nope" })), 404, "not_found");
    const { draft } = await ok("markReady", await readyRoute(post({ draft_version: 1, actor: "Writer" }), ctx({ draft_id: "draft-t1" })));
    expect(draft.status).toBe("ready_for_review");
    const queue = await ok("reviewQueue", await reviewRoute(get()));
    expect(queue.drafts.map((d) => d.id)).toEqual(["draft-t1", "draft-t2"]);
  });
});

describe("markReady on a published draft", () => {
  it("is rejected and leaves the draft published and out of the queue", async () => {
    getStore().saveDraft(makeDraft({ status: "published" }));
    const error = await fail(await readyRoute(post({ draft_version: 1, actor: "Writer" }), ctx({ draft_id: "draft-t1" })), 400, "invalid_request");
    expect(error.reason).toContain("already published");
    expect(getStore().getDraft("draft-t1")?.status).toBe("published");
    expect((await ok("reviewQueue", await reviewRoute(get()))).drafts).toEqual([]);
  });
});

describe("decide", () => {
  beforeEach(() => getStore().saveFinding(makeFinding()));
  const run = (body: unknown, findingId = "finding-t1") => decideRoute(post(body), ctx({ finding_id: findingId }));

  it("rejects a blank reason with 400 and saves nothing", async () => {
    await fail(await run(decideBody({ reason: "   " })), 400, "invalid_request");
    expect(getStore().listDecisionsForDraft("draft-t1")).toEqual([]);
    expect(getStore().getFinding("finding-t1")?.state).toBe("current");
  });
  it("rejects stale draft, ruleset and cleared findings with 409", async () => {
    await fail(await run(decideBody({ draft_version: 2 })), 409, "version_conflict");
    await fail(await run(decideBody({ ruleset_version: 2 })), 409, "version_conflict");
    getStore().saveFinding(makeFinding({ state: "cleared", cleared_at: "2026-10-16T12:00:00.000Z" }));
    await fail(await run(decideBody()), 409, "version_conflict");
    expect(getStore().listDecisionsForDraft("draft-t1")).toEqual([]);
  });
  it("returns not_found for unknown findings and findings of another draft", async () => {
    await fail(await run(decideBody(), "nope"), 404, "not_found");
    getStore().saveDraft(makeDraft({ id: "draft-t2", line_ids: ["TEST-SABAD-L2"] }));
    await fail(await run(decideBody({ draft_id: "draft-t2" })), 404, "not_found");
  });
  it("accept keeps the finding open and requests changes", async () => {
    const result = await ok("decide", await run(decideBody({ action: "accept" })));
    expect(result.decision.id).toBe("dec-1");
    expect(result.finding.state).toBe("current");
    expect(getStore().getDraft("draft-t1")?.status).toBe("changes_requested");
    expect(getStore().getFinding("finding-t1")?.state).toBe("current");
  });
  it("accept leaves a published draft published", async () => {
    getStore().saveDraft(makeDraft({ status: "published" }));
    await ok("decide", await run(decideBody({ action: "accept" })));
    expect(getStore().getDraft("draft-t1")?.status).toBe("published");
  });
  it("override and waive clear the finding", async () => {
    const overridden = await ok("decide", await run(decideBody()));
    expect(overridden.finding.state).toBe("cleared");
    expect(overridden.finding.cleared_at).not.toBeNull();
    expect(getStore().getFinding("finding-t1")?.state).toBe("cleared");
    getStore().saveFinding(makeFinding({ id: "finding-t2" }));
    const waived = await ok("decide", await run(decideBody({ action: "waive" }), "finding-t2"));
    expect(waived.finding.state).toBe("cleared");
  });
});

describe("publish gate", () => {
  it("blocks on an error finding", async () => {
    bothRuns();
    getStore().saveFinding(makeFinding());
    const gate = await ok("getPublishGate", await gateRoute(get(), ctx({ draft_id: "draft-t1" })));
    expect(gate.can_publish).toBe(false);
    expect(gate.blockers).toEqual([{ kind: "finding", finding_id: "finding-t1", rule_id: "LAYER-07", severity: "error" }]);
  });
  it("blocks on missing and failed phases, and returns not_found for unknown drafts", async () => {
    let gate = await ok("getPublishGate", await gateRoute(get(), ctx({ draft_id: "draft-t1" })));
    expect(gate.blockers.map((b) => (b.kind === "check_phase" ? `${b.phase}:${b.status}` : b.kind))).toEqual(["code:missing", "llm:missing"]);
    getStore().saveCheckRun(makeRun());
    getStore().saveCheckRun(makeRun({ id: "run-t2", phase: "llm", status: "failed", error: "Synthetic failure." }));
    gate = await ok("getPublishGate", await gateRoute(get(), ctx({ draft_id: "draft-t1" })));
    expect(gate.blockers).toEqual([{ kind: "check_phase", draft_id: "draft-t1", phase: "llm", status: "failed" }]);
    await fail(await gateRoute(get(), ctx({ draft_id: "nope" })), 404, "not_found");
  });
  it("is clear when both phases succeeded and only warnings remain", async () => {
    bothRuns();
    getStore().saveFinding(makeFinding({ severity: "warning" }));
    const gate = await ok("getPublishGate", await gateRoute(get(), ctx({ draft_id: "draft-t1" })));
    expect(gate.can_publish).toBe(true);
    expect(gate.warning_ids).toEqual(["finding-t1"]);
  });
});

describe("publish", () => {
  const run = (body: unknown, draftId = "draft-t1") => publishRoute(post(body), ctx({ draft_id: draftId }));

  it("returns publish_blocked with blockers and the blocking rule IDs", async () => {
    bothRuns();
    getStore().saveFinding(makeFinding());
    const error = await fail(await run(publishBody()), 409, "publish_blocked");
    expect(error.blockers).toEqual([{ kind: "finding", finding_id: "finding-t1", rule_id: "LAYER-07", severity: "error" }]);
    expect(error.reason).toContain("LAYER-07");
    expect(getStore().getDraft("draft-t1")?.status).toBe("draft");
    expect(getStore().listReferences()).toEqual([]);
  });
  it("rejects stale versions, empty text and already-published drafts", async () => {
    bothRuns();
    await fail(await run(publishBody({ draft_version: 2 })), 409, "version_conflict");
    await fail(await run(publishBody({ ruleset_version: 2 })), 409, "version_conflict");
    getStore().saveDraft(makeDraft({ text: "   " }));
    await fail(await run(publishBody()), 400, "invalid_request");
    getStore().saveDraft(makeDraft({ status: "published" }));
    await fail(await run(publishBody()), 400, "invalid_request");
    await fail(await run(publishBody(), "nope"), 404, "not_found");
  });
  it("publishes with warnings open, creating a reference and a publication", async () => {
    bothRuns();
    getStore().saveFinding(makeFinding({ severity: "warning" }));
    const result = await ok("publish", await run(publishBody()));
    expect(result.draft.status).toBe("published");
    expect(result.reference).toMatchObject({ id: "PUB-0001", line_ids: ["TEST-SABAD-L1"], english: "SYNTHETIC TEST: [sample]", source: "published", exceptions: [] });
    expect(result.gate.can_publish).toBe(true);
    const { publications } = await ok("listPublications", await publicationsRoute(get(), ctx({ shabad_id: "TEST-SABAD" })));
    expect(publications).toHaveLength(1);
    expect(publications[0]).toMatchObject({ draft_id: "draft-t1", approver: "Approver", gate: result.gate });
    const fetched = await ok("getReference", await referenceRoute(get(), ctx({ reference_id: "PUB-0001" })));
    expect(fetched.reference).toEqual(result.reference);
  });
  it("records override/waive decisions and departure reasons as exceptions", async () => {
    bothRuns();
    getStore().saveFinding(makeFinding());
    getStore().saveFinding(makeFinding({ id: "finding-cons", rule_id: "CONS-01", severity: "warning", reference_ids: ["PUB-0000"] }));
    await ok("decide", await decideRoute(post(decideBody()), ctx({ finding_id: "finding-t1" })));
    // The CONS-01 finding blocks until a departure reason is given.
    const blocked = await fail(await run(publishBody()), 409, "publish_blocked");
    expect(blocked.blockers).toEqual([{ kind: "departure_reason", finding_id: "finding-cons", rule_id: "CONS-01" }]);
    await fail(await run(publishBody({ departure_reasons: [{ finding_id: "unknown", reason: "Synthetic reason." }] })), 400, "invalid_request");
    const result = await ok("publish", await run(publishBody({ departure_reasons: [{ finding_id: "finding-cons", reason: "Synthetic departure reason." }] })));
    expect(result.reference.exceptions).toEqual([
      expect.objectContaining({ rule_id: "LAYER-07", decision_id: "dec-1", action: "override", reason: "Synthetic reviewer reason.", reviewer: "Reviewer" }),
      expect.objectContaining({ rule_id: "CONS-01", decision_id: "departure-finding-cons", action: "context_reason", reason: "Synthetic departure reason.", reviewer: "Approver" }),
    ]);
    expect(getStore().getReference("PUB-0001")).toEqual(result.reference);
  });
  it("lists publications oldest first and returns an empty list for unknown Sabads", async () => {
    getStore().saveDraft(makeDraft({ id: "draft-t2", line_ids: ["TEST-SABAD-L2"] }));
    bothRuns();
    bothRuns("draft-t2");
    await ok("publish", await run(publishBody()));
    await ok("publish", await run(publishBody(), "draft-t2"));
    const { publications } = await ok("listPublications", await publicationsRoute(get(), ctx({ shabad_id: "TEST-SABAD" })));
    expect(publications.map((p) => p.reference.id)).toEqual(["PUB-0001", "PUB-0002"]);
    expect((await ok("listPublications", await publicationsRoute(get(), ctx({ shabad_id: "UNKNOWN" })))).publications).toEqual([]);
  });
});

describe("publish reference warm-up", () => {
  it("resolves even when the warm-up never settles, and passes it the store references", async () => {
    bothRuns();
    const spy = vi.fn(() => new Promise<void>(() => {}));
    const result = await publish({ draft_id: "draft-t1", ...publishBody(), departure_reasons: [] } as Parameters<typeof publish>[0], { indexReferences: spy });
    expect(result.draft.status).toBe("published");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(getStore().listReferences());
    expect(getStore().listReferences()).toEqual([result.reference]);
  });
  it("logs a short warning and still publishes when the warm-up rejects", async () => {
    bothRuns();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await publish({ draft_id: "draft-t1", ...publishBody(), departure_reasons: [] } as Parameters<typeof publish>[0], { indexReferences: async () => { throw new Error("embedder offline"); } });
    expect(result.draft.status).toBe("published");
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    warn.mockRestore();
  });
});

describe("getReference", () => {
  it("returns not_found for an unknown reference", async () => {
    await fail(await referenceRoute(get(), ctx({ reference_id: "PUB-9999" })), 404, "not_found");
  });
});
