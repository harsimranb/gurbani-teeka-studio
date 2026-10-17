import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as lookupRoute } from "../../../app/api/lines/[line_id]/words/[start]/route";
import { ApiErrorSchema, routes } from "../../contracts/api";
import { SabadSchema, type Line, type Reference, type Sabad } from "../../contracts/domain";
import { rulesFixture } from "../../contracts/fixtures";
import { divineNameFamilies, tokenize } from "../../engine/index";
import { __setSourceForTests, __setStoreForTests } from "./context";
import { createMemoryRepository } from "./memory-repo";
import { OCCURRENCE_CAP, RENDERING_CAP } from "./words";

// Gurmukhi in these tests is read from the repository's own data (the TERM-02 alternatives in the rules seed, or the
// private BaniDB fixture); nothing is typed here. Plain ASCII markers stand in where the script does not matter.
const families = divineNameFamilies(rulesFixture);
const spellings = (() => {
  const byStem = new Map<string, string[]>();
  for (const alternative of families.flatMap((family) => family.alternatives)) {
    const stem = tokenize(alternative)[0].stem_key;
    byStem.set(stem, [...(byStem.get(stem) ?? []), alternative]);
  }
  return [...byStem.values()].find((group) => group.length >= 3 && new Set(group).size === group.length)!;
})();
const other = families.flatMap((family) => family.alternatives).find((alternative) => tokenize(alternative)[0].stem_key !== tokenize(spellings[0])[0].stem_key)!;

const line = (id: string, shabad: string, ang: number, gurmukhi: string): Line =>
  ({ line_id: id, shabad_id: shabad, ang, raag: "TEST-RAAG", writer: "TEST-WRITER", is_rahao: false, gurmukhi });
const lookup = (lineId: string, start: number | string) =>
  lookupRoute(new Request(`http://t/api/lines/${lineId}/words/${start}`), { params: Promise.resolve({ line_id: lineId, start: String(start) }) });
const reference = (id: string, lineIds: string[], source: Reference["source"], english: string): Reference =>
  ({ id, line_ids: lineIds, english, source, exceptions: [] });

async function available(response: Response) {
  expect(response.status).toBe(200);
  const body = routes.lookupWord.response.parse(await response.json());
  if (body.status !== "available") throw new Error("expected an available lookup");
  return body;
}

beforeEach(() => {
  __setSourceForTests(undefined);
  const store = createMemoryRepository();
  store.saveSabad({ shabad_id: "10", lines: [line("101", "10", 3, `${spellings[0]} ${other}`), line("102", "10", 3, `${other} ${spellings[1]}`)] });
  store.saveSabad({ shabad_id: "20", lines: [line("201", "20", 8, `${other} ${other}`), line("202", "20", 9, spellings[2])] });
  store.saveReference(reference("PUB-0001", ["102"], "published", "SYNTHETIC published rendering of lines"));
  store.saveReference(reference("SIKHRI-1", ["101", "102"], "sikhri_sample", "SYNTHETIC sample rendering"));
  store.saveReference(reference("PUB-0002", ["201"], "published", "SYNTHETIC rendering that does not cover the word"));
  __setStoreForTests(store);
});
afterEach(() => { __setStoreForTests(null); __setSourceForTests(undefined); });

describe("lookupWord (FE-11)", () => {
  it("groups spellings by the engine stem key and cites each line's Sabad, ang and line ID", async () => {
    const body = await available(await lookup("101", 0));
    expect(body.word).toEqual({ line_id: "101", shabad_id: "10", surface: spellings[0], stem_key: tokenize(spellings[0])[0].stem_key, ending_matra: tokenize(spellings[0])[0].ending_matra });
    expect(body.occurrences.total).toBe(3);
    expect(body.occurrences.items.map((item) => [item.shabad_id, item.line_id, item.ang, item.surface])).toEqual([
      ["10", "101", 3, spellings[0]], ["10", "102", 3, spellings[1]], ["20", "202", 9, spellings[2]],
    ]);
    expect(body.occurrences.items[1].gurmukhi).toBe(`${other} ${spellings[1]}`);
  });

  it("selects the word by its offset in the line", async () => {
    const body = await available(await lookup("101", spellings[0].length + 1));
    expect(body.word.surface).toBe(other);
    expect(body.occurrences.total).toBe(3);
    expect(body.occurrences.items.map((item) => item.line_id)).toEqual(["101", "102", "201"]);
  });

  it("returns prior renderings only for references covering a matching line, labelled as line-level evidence with source IDs", async () => {
    const body = await available(await lookup("101", 0));
    expect(body.prior_renderings.total).toBe(2);
    expect(body.prior_renderings.items).toEqual([
      { reference_id: "PUB-0001", source: "published", source_label: "Published in Eko", line_ids: ["102"], matched_line_ids: ["102"], english: "SYNTHETIC published rendering of lines" },
      { reference_id: "SIKHRI-1", source: "sikhri_sample", source_label: "SikhRI reference sample", line_ids: ["101", "102"], matched_line_ids: ["101", "102"], english: "SYNTHETIC sample rendering" },
    ]);
  });

  it("reports no prior renderings when no reference covers the word", async () => {
    const store = createMemoryRepository();
    store.saveSabad({ shabad_id: "10", lines: [line("101", "10", 3, `${spellings[0]} ${other}`)] });
    __setStoreForTests(store);
    const body = await available(await lookup("101", 0));
    expect(body.prior_renderings).toEqual({ total: 0, items: [] });
  });

  it("caps each list but reports the full count", async () => {
    const store = createMemoryRepository();
    const many = OCCURRENCE_CAP + 7;
    store.saveSabad({ shabad_id: "10", lines: Array.from({ length: many }, (_, i) => line(String(100 + i), "10", 3, `${spellings[0]} ${other}`)) });
    for (let i = 0; i < RENDERING_CAP + 3; i++) store.saveReference(reference(`PUB-${String(i + 1).padStart(4, "0")}`, ["100"], "published", `SYNTHETIC rendering ${i}`));
    __setStoreForTests(store);
    const body = await available(await lookup("100", 0));
    expect(body.occurrences.total).toBe(many);
    expect(body.occurrences.items).toHaveLength(OCCURRENCE_CAP);
    expect(body.prior_renderings.total).toBe(RENDERING_CAP + 3);
    expect(body.prior_renderings.items).toHaveLength(RENDERING_CAP);
  });

  it("never carries wording beyond the stored references: every response field is contract-strict", async () => {
    const body = await available(await lookup("101", 0));
    const strict = routes.lookupWord.response.safeParse({ ...body, suggested_rendering: "SYNTHETIC" });
    expect(strict.success).toBe(false);
    const stored = new Set(["SYNTHETIC published rendering of lines", "SYNTHETIC sample rendering"]);
    expect(body.prior_renderings.items.every((item) => stored.has(item.english))).toBe(true);
  });

  it("rejects an unknown line, a position that is not a word start, and a blank ID", async () => {
    const code = async (response: Response) => ApiErrorSchema.parse(await response.json()).error.code;
    const missing = await lookup("nope", 0);
    expect([missing.status, await code(missing)]).toEqual([404, "not_found"]);
    const middle = await lookup("101", 1);
    expect([middle.status, await code(middle)]).toEqual([400, "invalid_request"]);
    const negative = await lookup("101", "-1");
    expect([negative.status, await code(negative)]).toEqual([400, "invalid_request"]);
    const text = await lookup("101", "abc");
    expect([text.status, await code(text)]).toEqual([400, "invalid_request"]);
  });

  it("answers unavailable when no source is loaded", async () => {
    __setStoreForTests(createMemoryRepository());
    const response = await lookup("101", 0);
    expect(response.status).toBe(200);
    expect(routes.lookupWord.response.parse(await response.json())).toMatchObject({ status: "unavailable" });
  });
});

// Differential check against the private BaniDB export, when this clone has it: the route must agree with a brute-force
// pass over the same lines using the engine tokenizer.
const fixturePath = new URL("../../contracts/fixtures/sabad.demo.json", import.meta.url);
let demo: Sabad | undefined;
try { demo = SabadSchema.parse(JSON.parse(readFileSync(fixturePath, "utf8"))); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
(demo ? describe : describe.skip)("lookupWord on the BaniDB demo export", () => {
  it("finds, for every word of every line, exactly the lines a brute-force stem-key scan finds", async () => {
    const store = createMemoryRepository();
    store.saveSabad(demo!);
    __setStoreForTests(store);
    for (const source of demo!.lines) {
      for (const token of tokenize(source.gurmukhi)) {
        const body = await available(await lookup(source.line_id, token.start));
        const expected = demo!.lines.filter((candidate) => tokenize(candidate.gurmukhi).some((t) => t.stem_key === token.stem_key)).map((candidate) => candidate.line_id);
        expect(body.occurrences.items.map((item) => item.line_id)).toEqual(expected);
        expect(body.occurrences.total).toBe(expected.length);
        expect(expected).toContain(source.line_id);
      }
    }
  });
});
