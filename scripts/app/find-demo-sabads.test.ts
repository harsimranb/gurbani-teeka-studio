import { describe, expect, it } from "vitest";
import seed from "../../_docs/rules/rules.resolved.json";
import { hasFamilyToken, kartarFamily, openingGlyph } from "./find-demo-sabads";

describe("demo Sabad search helpers", () => {
  it("picks the pair where one alternative extends the other by a base letter, not by a vowel sign", () => {
    const sign = "́"; // combining mark standing in for a vowel sign
    expect(kartarFamily(`(?:hari|ka|kab|sah|sah${sign}|ram)`).sort()).toEqual(["ka", "kab"]);
    expect(() => kartarFamily("(?:hari|ram)")).toThrow(/exactly two/);
  });

  it("matches whole tokens, allowing trailing marks only", () => {
    const family = ["ka", "kab"];
    expect(hasFamilyToken("x ka y", family)).toBe(true);
    expect(hasFamilyToken("x ká y", family)).toBe(true);
    expect(hasFamilyToken("x kac y", family)).toBe(false);
    expect(hasFamilyToken("x kaa", family)).toBe(false);
  });

  it("reads the glyph from the TERM-03 keywords, never typed", () => {
    const keywords = seed.rules.find((rule) => rule.id === "TERM-03")!.prefilter!.keywords;
    expect([...openingGlyph(keywords)]).toHaveLength(1);
    expect(() => openingGlyph(["the One"])).toThrow();
  });

  it("derives the real karta/kartar pair from the TERM-02 seed pattern", () => {
    const pattern = seed.rules.find((rule) => rule.id === "TERM-02")!.prefilter!.patterns[0].pattern;
    const family = kartarFamily(pattern).sort((a, b) => a.length - b.length);
    expect(family[1].startsWith(family[0])).toBe(true);
  });
});
