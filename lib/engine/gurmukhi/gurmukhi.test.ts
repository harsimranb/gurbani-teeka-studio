import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SabadSchema, WordSchema } from "../../contracts/domain";
import { rulesFixture } from "../../contracts/fixtures";
import { divineNameFamilies, findDivineNames, sabadDivineNames, toWords, tokenize } from "./index";

const sourcePath = new URL("../../contracts/fixtures/sabad.demo.json", import.meta.url);
let sabad: ReturnType<typeof SabadSchema.parse> | undefined;
try { sabad = SabadSchema.parse(JSON.parse(readFileSync(sourcePath, "utf8"))); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const sourceTests = sabad ? describe : describe.skip;

describe("TERM-02 divine-name alternatives from the rules seed", () => {
  const families = divineNameFamilies(rulesFixture);
  const alternatives = families.flatMap((family) => family.alternatives);
  it("groups 12 alternatives into 7 families", () => {
    expect(alternatives).toHaveLength(12);
    expect(families).toHaveLength(7);
    expect(divineNameFamilies(rulesFixture.filter((rule) => rule.id !== "TERM-02"))).toEqual([]);
  });
  it("tokenizes every alternative to one token whose stem is in its family", () => {
    for (const family of families) for (const alternative of family.alternatives) {
      const tokens = tokenize(alternative);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].stem_key + tokens[0].ending_matra).toBe(alternative);
      expect(family.stemKeys).toContain(tokens[0].stem_key);
      expect(family.stemKeys.some((stem) => stem.length >= family.key.length)).toBe(true);
    }
  });
  it("has variant spellings sharing a family", () => {
    expect(families.some((family) => family.alternatives.length >= 3)).toBe(true);
    expect(families.some((family) => family.stemKeys.length >= 2)).toBe(true);
  });
  it("rejects non-NFC input", () => {
    const decomposed = alternatives.find((alternative) => alternative.normalize("NFD") !== alternative);
    if (decomposed) expect(() => tokenize(decomposed.normalize("NFD"))).toThrow();
  });
  it("tracks offsets and indexes across whitespace and drops punctuation-only tokens", () => {
    const [a, b] = alternatives;
    const text = `  ${a}\t\u0965 \u0A67 ${b}\n${a}  `;
    const tokens = tokenize(text);
    expect(tokens.map((token) => token.surface)).toEqual([a, b, a]);
    expect(tokens.map((token) => token.index)).toEqual([0, 1, 2]);
    for (const token of tokens) expect(text.slice(token.start, token.end)).toBe(token.surface);
  });
});

sourceTests("private BaniDB fixture", () => {
  const lines = sabad!.lines;
  it("tokenizes every line with invariants and no punctuation-only tokens", () => {
    for (const line of lines) {
      const tokens = tokenize(line.gurmukhi);
      expect(tokens.length).toBeGreaterThan(0);
      tokens.forEach((token, i) => {
        expect(token.index).toBe(i);
        expect(line.gurmukhi.slice(token.start, token.end)).toBe(token.surface);
        expect(token.stem_key + token.ending_matra).toBe(token.surface);
        expect(token.stem_key.length).toBeGreaterThan(0);
        expect(token.surface.normalize("NFC")).toBe(token.surface);
        expect(/^[\p{P}\p{S}\p{N}\u0964\u0965]+$/u.test(token.surface)).toBe(false);
      });
      const raw = line.gurmukhi.split(/\s+/).filter(Boolean);
      expect(tokens.length).toBeLessThan(raw.length);
    }
  });
  it("toWords output validates against WordSchema", () => {
    for (const line of lines) {
      const words = toWords(line);
      expect(words).toHaveLength(tokenize(line.gurmukhi).length);
      for (const word of words) expect(WordSchema.safeParse(word).success).toBe(true);
    }
  });
  it("finds divine names whose tokens come from tokenize", () => {
    const hits = sabadDivineNames(sabad!, rulesFixture);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const families = divineNameFamilies(rulesFixture);
    for (const hit of hits) {
      const line = lines.find((candidate) => candidate.line_id === hit.line_id)!;
      expect(tokenize(line.gurmukhi)).toContainEqual(hit.token);
      expect(families.map((family) => family.key)).toContain(hit.family);
    }
    expect(hits).toEqual(lines.flatMap((line) => findDivineNames(line, families)));
  });
});
