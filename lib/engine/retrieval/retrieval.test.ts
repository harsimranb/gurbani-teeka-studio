import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DraftSchema, ReferenceSchema, SabadSchema, type Draft, type Line, type Reference, type Sabad } from "../../contracts/domain";
import { tokenize } from "../gurmukhi";
import { createReferenceIndex, type Embedder } from "./index";

// SYNTHETIC test data only: English strings and IDs below are labelled test values, not SikhRI data.
const at = "2026-10-16T12:00:00.000Z";
const draft = (over: Partial<Draft> = {}): Draft => DraftSchema.parse({ id: "synthetic-draft", shabad_id: "synthetic-sabad", line_ids: ["synthetic-line-1"], layer: "transcreation", text: "SYNTHETIC the restless mind finds peace in stillness", author: "Synthetic author", status: "draft", version: 1, updated_at: at, ...over });
const ref = (id: string, english: string, over: Partial<Reference> = {}): Reference => ReferenceSchema.parse({ id, line_ids: ["synthetic-other"], english, source: "published", exceptions: [], ...over });
const exception = { rule_id: "TERM-01", decision_id: "synthetic-decision", action: "waive" as const, reason: "SYNTHETIC reason", reviewer: "Synthetic reviewer", at };
// No Gurmukhi here: the stem method is exercised against the private fixture below; these tests need no source text.
const emptySabad = { shabad_id: "synthetic-sabad", lines: [] } as unknown as Sabad;
const query = (references: Reference[], over: Partial<Draft> = {}, k?: number) => ({ draft: draft(over), lines: [] as Line[], sabad: emptySabad, references, k });

// Fake embedder: one axis per keyword, so cosine ordering is predictable.
const AXES = ["mind", "peace", "river", "fire"];
const fake: Embedder = async (texts) => texts.map((text) => AXES.map((axis) => (text.toLowerCase().includes(axis) ? 1 : 0)));

describe("createReferenceIndex", () => {
  it("ranks a line-id overlap first with score 1", async () => {
    const references = [ref("b", "SYNTHETIC the restless mind finds peace in stillness"), ref("a", "SYNTHETIC unrelated river text", { line_ids: ["synthetic-line-1", "synthetic-line-9"] })];
    const result = await createReferenceIndex({ embedder: null }).lookup(query(references));
    expect(result.ordinary[0]).toMatchObject({ reference: { id: "a" }, score: 1, method: "line" });
    expect(result.ordinary.map((entry) => entry.reference.id)).toEqual(["a", "b"]);
  });

  it("weighs sikhri_sample and published equally (D-57)", async () => {
    const text = "SYNTHETIC the restless mind finds peace";
    const result = await createReferenceIndex({ embedder: null }).lookup(query([ref("x", text, { source: "sikhri_sample" }), ref("y", text, { source: "published" })]));
    expect(result.ordinary).toHaveLength(2);
    expect(result.ordinary[0].score).toBe(result.ordinary[1].score);
    expect(result.ordinary.map((entry) => entry.reference.id)).toEqual(["x", "y"]);
  });

  it("splits exception-marked references out with their marks intact", async () => {
    const marked = ref("m", "SYNTHETIC the restless mind finds peace", { exceptions: [exception] });
    const plain = ref("p", "SYNTHETIC the restless mind finds peace");
    const result = await createReferenceIndex({ embedder: null }).lookup(query([marked, plain]));
    expect(result.ordinary.map((entry) => entry.reference.id)).toEqual(["p"]);
    expect(result.exceptions).toHaveLength(1);
    expect(result.exceptions[0]).toMatchObject({ exception: true, reference: marked });
    expect(result.exceptions[0].reference.exceptions).toEqual([exception]);
    expect(result.ordinary[0].exception).toBe(false);
  });

  it("falls back to lexical overlap when no embedder is given", async () => {
    const result = await createReferenceIndex({ embedder: null }).lookup(query([ref("hit", "SYNTHETIC the restless mind finds peace"), ref("miss", "SYNTHETIC rivers of fire")]));
    expect(result.mode).toBe("lexical");
    expect(result.ordinary.map((entry) => [entry.reference.id, entry.method])).toEqual([["hit", "lexical"]]);
  });

  it("uses a custom embedder: cosine ordering, minScore cut, mode embedding", async () => {
    const references = [ref("both", "SYNTHETIC mind and peace together"), ref("one", "SYNTHETIC mind alone"), ref("none", "SYNTHETIC river and fire")];
    const result = await createReferenceIndex({ embedder: fake, minScore: 0.5 }).lookup(query(references, { text: "SYNTHETIC mind peace" }));
    expect(result.mode).toBe("embedding");
    expect(result.ordinary.map((entry) => [entry.reference.id, entry.method])).toEqual([["both", "embedding"], ["one", "embedding"]]);
    expect(result.ordinary[0].score).toBeCloseTo(1);
    expect(result.ordinary[1].score).toBeCloseTo(Math.SQRT1_2);
    const strict = await createReferenceIndex({ embedder: fake, minScore: 0.9 }).lookup(query(references, { text: "SYNTHETIC mind peace" }));
    expect(strict.ordinary.map((entry) => entry.reference.id)).toEqual(["both"]);
  });

  it("falls back to lexical, and says so, when the embedder fails", async () => {
    const failing = vi.fn<Embedder>().mockRejectedValue(new Error("offline"));
    const result = await createReferenceIndex({ embedder: failing }).lookup(query([ref("hit", "SYNTHETIC the restless mind finds peace")]));
    expect(failing).toHaveBeenCalled();
    expect(result.mode).toBe("lexical");
    expect(result.ordinary[0]).toMatchObject({ method: "lexical" });
  });

  it("falls back to lexical when the embedder returns the wrong number of vectors", async () => {
    const result = await createReferenceIndex({ embedder: async () => [[1, 0]] }).lookup(query([ref("hit", "SYNTHETIC the restless mind finds peace")]));
    expect(result.mode).toBe("lexical");
  });

  it("works cold, and warm() makes later lookups reuse vectors", async () => {
    const embedder = vi.fn(fake);
    const references = [ref("r1", "SYNTHETIC mind peace"), ref("r2", "SYNTHETIC river")];
    const cold = await createReferenceIndex({ embedder }).lookup(query(references, { text: "SYNTHETIC mind" }));
    expect(cold.mode).toBe("embedding");
    expect(cold.ordinary.map((entry) => entry.reference.id)).toEqual(["r1"]);

    const index = createReferenceIndex({ embedder: vi.fn(fake) });
    await index.warm(references);
    const spy = vi.fn(fake);
    const warmed = createReferenceIndex({ embedder: spy });
    await warmed.warm(references);
    await warmed.lookup(query(references, { text: "SYNTHETIC mind" }));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1][0]).toEqual(["SYNTHETIC mind"]);
  });

  it("warm is a no-op without an embedder and never throws on a failing one", async () => {
    await expect(createReferenceIndex({ embedder: null }).warm([ref("r", "SYNTHETIC text")])).resolves.toBeUndefined();
    await expect(createReferenceIndex({ embedder: async () => { throw new Error("offline"); } }).warm([ref("r", "SYNTHETIC text")])).resolves.toBeUndefined();
  });

  it("returns an empty result for no references, and cuts to k", async () => {
    const empty = await createReferenceIndex({ embedder: fake }).lookup(query([]));
    expect(empty).toEqual({ ordinary: [], exceptions: [], mode: "lexical" });
    const many = Array.from({ length: 6 }, (_, i) => ref(`r${i}`, "SYNTHETIC the restless mind finds peace"));
    const cut = await createReferenceIndex({ embedder: null }).lookup(query(many, {}, 3));
    expect(cut.ordinary.map((entry) => entry.reference.id)).toEqual(["r0", "r1", "r2"]);
  });

  it("applies k to ordinary and exception-marked references separately", async () => {
    const text = "SYNTHETIC the restless mind finds peace";
    const marked = Array.from({ length: 4 }, (_, i) => ref(`m${i}`, text, { line_ids: ["synthetic-line-1"], exceptions: [exception] }));
    const plain = Array.from({ length: 4 }, (_, i) => ref(`p${i}`, text));
    const result = await createReferenceIndex({ embedder: null }).lookup(query([...marked, ...plain], {}, 2));
    expect(result.exceptions.map((entry) => entry.reference.id)).toEqual(["m0", "m1"]);
    expect(result.ordinary.map((entry) => entry.reference.id)).toEqual(["p0", "p1"]);
  });

  it("keeps each reference's best method when several match", async () => {
    const both = ref("both", "SYNTHETIC the restless mind finds peace", { line_ids: ["synthetic-line-1"] });
    const result = await createReferenceIndex({ embedder: null }).lookup(query([both]));
    expect(result.ordinary).toHaveLength(1);
    expect(result.ordinary[0]).toMatchObject({ method: "line", score: 1 });
  });
});

const fixture = new URL("../../contracts/fixtures/sabad.demo.json", import.meta.url);
describe.skipIf(!existsSync(fixture))("stem lookup on the private BaniDB fixture", () => {
  const sabad = SabadSchema.parse(JSON.parse(readFileSync(fixture, "utf8")));
  const stems = (line: Line) => new Set(tokenize(line.gurmukhi).map((token) => token.stem_key));
  const shared = (a: Line, b: Line) => [...stems(a)].filter((stem) => stems(b).has(stem)).length;
  // Pick two tukks that share at least one stem, and a third that shares none with the first.
  const pair = sabad.lines.flatMap((a) => sabad.lines.filter((b) => b !== a && shared(a, b) > 0).map((b) => [a, b] as const))[0];
  const stranger = sabad.lines.find((line) => line !== pair[0] && shared(pair[0], line) === 0);

  it("ranks a reference on a stem-sharing tukk, scored by shared stems over draft stems", async () => {
    const [own, other] = pair;
    const references = [ref("on-other", "SYNTHETIC alpha beta", { line_ids: [other.line_id] }), ref("on-own", "SYNTHETIC gamma delta", { line_ids: [own.line_id] })];
    if (stranger) references.push(ref("on-stranger", "SYNTHETIC gamma delta", { line_ids: [stranger.line_id] }));
    const result = await createReferenceIndex({ embedder: null, minStemScore: 0 }).lookup({ draft: draft({ shabad_id: sabad.shabad_id, line_ids: [own.line_id], text: "zzz qqq" }), lines: [own], sabad, references });
    expect(result.ordinary[0]).toMatchObject({ reference: { id: "on-own" }, method: "line", score: 1 });
    const stem = result.ordinary.find((entry) => entry.reference.id === "on-other")!;
    expect(stem.method).toBe("stem");
    expect(stem.score).toBeCloseTo(shared(own, other) / stems(own).size);
    expect(stem.score).toBeLessThan(1);
    expect(result.ordinary.some((entry) => entry.reference.id === "on-stranger")).toBe(false);
  });

  it("keeps a stem match only at or above minStemScore", async () => {
    const [own, other] = pair;
    const score = Math.min(shared(own, other) / stems(own).size, 0.99);
    const lookup = (minStemScore?: number) => createReferenceIndex({ embedder: null, minStemScore }).lookup({ draft: draft({ shabad_id: sabad.shabad_id, line_ids: [own.line_id], text: "zzz qqq" }), lines: [own], sabad, references: [ref("on-other", "SYNTHETIC alpha beta", { line_ids: [other.line_id] })] });
    expect((await lookup(score)).ordinary.map((entry) => entry.method)).toEqual(["stem"]);
    expect((await lookup(score + 0.01)).ordinary).toEqual([]);
    expect((await lookup()).ordinary.length).toBe(score >= 0.25 ? 1 : 0);
  });
});
