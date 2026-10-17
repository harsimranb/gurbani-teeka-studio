import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { ApiErrorSchema, routes, type RouteName } from "../../contracts/api";
import { GET as listSabadsRoute } from "../../../app/api/sabads/route";
import { GET as getSabadRoute } from "../../../app/api/sabads/[shabad_id]/route";
import { POST as saveDraftRoute } from "../../../app/api/drafts/route";
import { GET as reportRoute } from "../../../app/api/drafts/[draft_id]/report/route";
import { __setSourceForTests, __setStoreForTests, getStore } from "./context";
import { currentRuns } from "./state";
import { makeFinding, makeRun, TEST_AT, testSabad } from "./testing";

const SABAD = "TEST-SABAD";
const L = (n: number) => `${SABAD}-L${n}`;

beforeEach(() => { __setSourceForTests(testSabad(SABAD, 5)); });
afterEach(() => { __setSourceForTests(undefined); __setStoreForTests(null); });

const post = (body: unknown) => saveDraftRoute(new Request("http://t/api/drafts", { method: "POST", body: JSON.stringify(body) }));
const save = (over: Record<string, unknown> = {}) => post({
  draft_id: null, expected_version: null, shabad_id: SABAD, line_ids: [L(1)], text: "SYNTHETIC TEST: one", author: "Writer", ...over,
});
const getSabad = (id = SABAD) => getSabadRoute(new Request(`http://t/api/sabads/${id}`), { params: Promise.resolve({ shabad_id: id }) });
const getReport = (id: string) => reportRoute(new Request(`http://t/api/drafts/${id}/report`), { params: Promise.resolve({ draft_id: id }) });
const sabadList = () => listSabadsRoute(new Request("http://t/api/sabads"));

/** Asserts a 200 whose body parses with the route's response contract. */
async function ok<N extends RouteName>(name: N, response: Response): Promise<z.output<(typeof routes)[N]["response"]>> {
  expect(response.status).toBe(200);
  return routes[name].response.parse(await response.json()) as z.output<(typeof routes)[N]["response"]>;
}
async function failure(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(ApiErrorSchema.parse(await response.json()).error.code).toBe(code);
}

describe("sabads", () => {
  it("lists Sabads from the first line's metadata", async () => {
    const body = await ok("listSabads", await sabadList());
    expect(body.sabads).toEqual([{ shabad_id: SABAD, ang: 1, raag: "TEST-RAAG", writer: "TEST-WRITER" }]);
  });
  it("returns the Sabad with its drafts in source order", async () => {
    await save({ line_ids: [L(3)], text: "SYNTHETIC TEST: three" });
    await save({ line_ids: [L(1), L(2)], text: "SYNTHETIC TEST: one-two" });
    const body = await ok("getSabad", await getSabad());
    if (body.status !== "available") throw new Error("expected available");
    expect(body.sabad.lines).toHaveLength(5);
    expect(body.drafts.map((draft) => draft.line_ids)).toEqual([[L(1), L(2)], [L(3)]]);
  });
  it("answers 200 unavailable for an unknown Sabad", async () => {
    expect((await ok("getSabad", await getSabad("NO-SUCH"))).status).toBe("unavailable");
  });
  it("answers 200 unavailable when the source is missing, with an empty list", async () => {
    __setSourceForTests(null);
    expect((await ok("getSabad", await getSabad())).status).toBe("unavailable");
    expect((await ok("listSabads", await sabadList())).sabads).toEqual([]);
    await failure(await save(), 503, "unavailable");
  });
});

describe("saveDraft", () => {
  it("creates version 1 with status draft", async () => {
    const { draft } = await ok("saveDraft", await save());
    expect(draft).toMatchObject({ version: 1, status: "draft", line_ids: [L(1)], author: "Writer", layer: "transcreation" });
    expect(getStore().getDraft(draft.id)).toEqual(draft);
  });
  it("rejects a line outside the Sabad", async () => {
    await failure(await save({ line_ids: ["OTHER-L1"] }), 400, "invalid_request");
  });
  it("updates, bumps the version, resets status and clears current findings", async () => {
    const store = getStore();
    const { draft } = await ok("saveDraft", await save());
    store.saveDraft({ ...draft, status: "published" });
    store.saveFinding(makeFinding({ id: "f1", draft_id: draft.id, draft_version: 1 }));
    store.saveCheckRun(makeRun({ id: "r1", draft_id: draft.id, draft_version: 1 }));
    const next = await ok("saveDraft", await save({ draft_id: draft.id, expected_version: 1, text: "SYNTHETIC TEST: edited", author: "Editor" }));
    expect(next.draft).toMatchObject({ version: 2, status: "draft", text: "SYNTHETIC TEST: edited", author: "Editor" });
    expect(store.getFinding("f1")?.state).toBe("cleared");
    expect(currentRuns(store, next.draft, 1)).toEqual([]);
  });
  it("returns the existing draft when nothing changed", async () => {
    const { draft } = await ok("saveDraft", await save());
    const same = await ok("saveDraft", await save({ draft_id: draft.id, expected_version: 1, author: "Someone else" }));
    expect(same.draft).toEqual(draft);
  });
  it("rejects a stale expected_version with 409", async () => {
    const { draft } = await ok("saveDraft", await save());
    await ok("saveDraft", await save({ draft_id: draft.id, expected_version: 1, text: "SYNTHETIC TEST: v2" }));
    await failure(await save({ draft_id: draft.id, expected_version: 1, text: "SYNTHETIC TEST: v3" }), 409, "version_conflict");
  });
  it("returns not_found for an unknown draft", async () => {
    await failure(await save({ draft_id: "draft-nope", expected_version: 1 }), 404, "not_found");
  });
  it("replaces overlapped drafts when a new draft regroups lines", async () => {
    const store = getStore();
    const a = (await ok("saveDraft", await save({ line_ids: [L(1)] }))).draft;
    const b = (await ok("saveDraft", await save({ line_ids: [L(2)] }))).draft;
    const c = (await ok("saveDraft", await save({ line_ids: [L(4)] }))).draft;
    store.saveFinding(makeFinding({ id: "fa", draft_id: a.id }));
    const group = (await ok("saveDraft", await save({ line_ids: [L(1), L(2)], text: "SYNTHETIC TEST: group" }))).draft;
    expect(store.getDraft(a.id)).toBeUndefined();
    expect(store.getDraft(b.id)).toBeUndefined();
    expect(store.getDraft(c.id)).toBeDefined();
    expect(store.listFindingsForDraft(a.id)).toEqual([]);
    expect(store.listDraftsForSabad(SABAD).map((draft) => draft.id).sort()).toEqual([c.id, group.id].sort());
  });
  it("rejects regrouping an existing draft onto another draft's lines, allows free lines", async () => {
    const a = (await ok("saveDraft", await save({ line_ids: [L(1)] }))).draft;
    await ok("saveDraft", await save({ line_ids: [L(2)] }));
    await failure(await save({ draft_id: a.id, expected_version: 1, line_ids: [L(1), L(2)] }), 400, "invalid_request");
    const wider = await ok("saveDraft", await save({ draft_id: a.id, expected_version: 1, line_ids: [L(1), L(3)] }));
    expect(wider.draft).toMatchObject({ version: 2, line_ids: [L(1), L(3)] });
  });
  it("rejects a malformed request", async () => {
    await failure(await save({ draft_id: "draft-1", expected_version: null }), 400, "invalid_request");
  });
});

describe("getReport", () => {
  it("returns not_found for an unknown draft", async () => {
    await failure(await getReport("draft-nope"), 404, "not_found");
  });
  it("has the contract shape after a save, with history, decisions and only current runs", async () => {
    const store = getStore();
    const { draft } = await ok("saveDraft", await save({ text: "SYNTHETIC TEST: [sample]" }));
    store.saveFinding(makeFinding({ id: "old", draft_id: draft.id, draft_version: 1 }));
    store.saveCheckRun(makeRun({ id: "run-old", draft_id: draft.id, draft_version: 1 }));
    store.saveDecision({
      id: "dec-t1", finding_id: "old", draft_id: draft.id, draft_version: 1, ruleset_version: 1,
      action: "accept", reason: "Synthetic reason.", reviewer: "Reviewer", at: TEST_AT,
    });
    const v2 = (await ok("saveDraft", await save({ draft_id: draft.id, expected_version: 1, text: "SYNTHETIC TEST: [sample] v2" }))).draft;
    store.saveFinding(makeFinding({ id: "new", draft_id: v2.id, draft_version: 2, quoted_span: "[", start: 16, end: 17 }));
    store.saveCheckRun(makeRun({ id: "run-new", draft_id: v2.id, draft_version: 2 }));
    store.saveCheckRun(makeRun({ id: "run-other-ruleset", draft_id: v2.id, draft_version: 2, ruleset_version: 2 }));
    const report = await ok("getReport", await getReport(v2.id));
    expect(report.draft).toEqual(v2);
    expect(report.ruleset_version).toBe(1);
    expect(report.findings.map((finding) => finding.id)).toEqual(["new"]);
    expect(report.history.map((finding) => finding.id)).toEqual(["old"]);
    expect(report.decisions.map((decision) => decision.id)).toEqual(["dec-t1"]);
    expect(report.check_runs.map((run) => run.id)).toEqual(["run-new"]);
  });
});
