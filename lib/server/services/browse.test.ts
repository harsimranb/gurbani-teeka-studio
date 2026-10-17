import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as browseRoute } from "../../../app/api/browse/route";
import { GET as listSabadsRoute } from "../../../app/api/sabads/route";
import { ApiErrorSchema, routes } from "../../contracts/api";
import type { Draft, Line } from "../../contracts/domain";
import { __setSourceForTests, __setStoreForTests } from "./context";
import { browseStatus } from "./browse";
import { createMemoryRepository, type AppStore } from "./memory-repo";
import { makeDraft } from "./testing";

// Source text is an ASCII marker, never Gurmukhi.
const line = (id: string, shabad: string, ang: number, raag: string, writer: string): Line =>
  ({ line_id: id, shabad_id: shabad, ang, raag, writer, is_rahao: false, gurmukhi: `TEST-SOURCE-${id}` });
const draftOf = (id: string, shabad: string, lineIds: string[], status: Draft["status"]) => makeDraft({ id, shabad_id: shabad, line_ids: lineIds, status });
const browse = (query = "") => browseRoute(new Request(`http://t/api/browse${query}`));

let store: AppStore;
beforeEach(() => {
  __setSourceForTests(undefined);
  store = createMemoryRepository();
  store.saveSabad({ shabad_id: "1", lines: [line("11", "1", 1, "RAAG-A", "WRITER-X"), line("12", "1", 1, "RAAG-A", "WRITER-X")] });
  store.saveSabad({ shabad_id: "2", lines: [line("21", "2", 2, "RAAG-B", "WRITER-X"), line("22", "2", 3, "RAAG-B", "WRITER-X")] });
  store.saveSabad({ shabad_id: "3", lines: [line("31", "3", 3, "RAAG-A", "WRITER-Y")] });
  store.saveSabad({ shabad_id: "4", lines: [line("41", "4", 9, "RAAG-C", "WRITER-Y")] });
  __setStoreForTests(store);
});
afterEach(() => { __setStoreForTests(null); __setSourceForTests(undefined); });

async function ok(response: Response) {
  expect(response.status).toBe(200);
  return routes.browseSabads.response.parse(await response.json());
}

describe("browseSabads (FE-10)", () => {
  it("lists the whole loaded corpus in corpus order with the filter values", async () => {
    const body = await ok(await browse());
    expect(body.total).toBe(4);
    expect(body.sabads.map((s) => s.shabad_id)).toEqual(["1", "2", "3", "4"]);
    expect(body.sabads[1]).toMatchObject({ ang: 2, last_ang: 3, line_count: 2, raag: "RAAG-B", writer: "WRITER-X", first_line_gurmukhi: "TEST-SOURCE-21" });
    expect(body.raags).toEqual(["RAAG-A", "RAAG-B", "RAAG-C"]);
    expect(body.writers).toEqual(["WRITER-X", "WRITER-Y"]);
  });

  it("filters by ang, raag and writer, singly and together", async () => {
    const ids = async (query: string) => (await ok(await browse(query))).sabads.map((s) => s.shabad_id);
    expect(await ids("?ang=3")).toEqual(["2", "3"]);                       // Sabad 2 has a line on ang 3
    expect(await ids("?raag=RAAG-A")).toEqual(["1", "3"]);
    expect(await ids("?writer=WRITER-Y")).toEqual(["3", "4"]);
    expect(await ids("?ang=3&raag=RAAG-A&writer=WRITER-Y")).toEqual(["3"]);
    expect(await ids("?raag=RAAG-A&writer=WRITER-Z")).toEqual([]);
    expect((await ok(await browse("?raag=RAAG-C"))).total).toBe(1);
    // Filter values stay available whatever is selected, so the controls never narrow themselves.
    expect((await ok(await browse("?raag=RAAG-C"))).raags).toEqual(["RAAG-A", "RAAG-B", "RAAG-C"]);
  });

  it("pages with limit and offset and keeps the total", async () => {
    const first = await ok(await browse("?limit=3"));
    expect([first.total, first.limit, first.offset, first.sabads.map((s) => s.shabad_id)]).toEqual([4, 3, 0, ["1", "2", "3"]]);
    const second = await ok(await browse("?limit=3&offset=3"));
    expect([second.total, second.offset, second.sabads.map((s) => s.shabad_id)]).toEqual([4, 3, ["4"]]);
  });

  it("reports each Sabad's review status from its stored drafts", async () => {
    store.saveDraft(draftOf("d-2", "2", ["21"], "draft"));
    store.saveDraft(draftOf("d-3a", "3", ["31"], "ready_for_review"));
    store.saveDraft(draftOf("d-4", "4", ["41"], "published"));
    store.saveDraft(draftOf("d-1a", "1", ["11"], "published"));
    store.saveDraft(draftOf("d-1b", "1", ["12"], "draft"));
    const status = Object.fromEntries((await ok(await browse())).sabads.map((s) => [s.shabad_id, s.status]));
    expect(status).toEqual({ "1": "partly_published", "2": "draft", "3": "ready_for_review", "4": "published" });
    store.saveDraft(draftOf("d-2", "2", ["21"], "changes_requested"));
    expect((await ok(await browse("?raag=RAAG-B"))).sabads[0].status).toBe("changes_requested");
    store.deleteDraft("d-2");
    expect((await ok(await browse("?raag=RAAG-B"))).sabads[0].status).toBe("not_started");
  });

  it("derives one status from a set of drafts", () => {
    const d = (status: Draft["status"]) => draftOf(`x-${status}`, "1", ["11"], status);
    expect(browseStatus([])).toBe("not_started");
    expect(browseStatus([d("draft")])).toBe("draft");
    expect(browseStatus([d("ready_for_review")])).toBe("ready_for_review");
    expect(browseStatus([d("ready_for_review"), d("draft")])).toBe("draft");
    expect(browseStatus([d("changes_requested"), d("draft")])).toBe("changes_requested");
    expect(browseStatus([d("published"), d("changes_requested")])).toBe("partly_published");
    expect(browseStatus([d("published")])).toBe("published");
  });

  it("rejects bad filters with the contract and never echoes values", async () => {
    for (const query of ["?ang=0", "?ang=1431", "?ang=abc", "?limit=0", "?limit=101", "?offset=-1", "?raag=%20", "?unknown=1"]) {
      const response = await browse(query);
      expect(response.status, query).toBe(400);
      expect(ApiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
    }
  });

  it("answers unavailable when no source is loaded, and leaves listSabads unchanged", async () => {
    __setStoreForTests(createMemoryRepository());
    const empty = await browse();
    expect(empty.status).toBe(503);
    expect(ApiErrorSchema.parse(await empty.json()).error.code).toBe("unavailable");
    // listSabads still offers the demo list (or every Sabad when none of the demo IDs exist).
    __setStoreForTests(store);
    const listed = routes.listSabads.response.parse(await (await listSabadsRoute(new Request("http://t/api/sabads"))).json());
    expect(listed.sabads.map((s) => s.shabad_id)).toEqual(["1", "2", "3", "4"]);
  });
});
