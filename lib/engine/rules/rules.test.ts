import { describe, expect, it } from "vitest";
import type { Rule } from "../../contracts/domain";
import { rulesFixture } from "../../contracts/fixtures";
import { checkedRules, compilePrefilter, scanPatterns } from "./index";

const EXPECTED_SEVERITY: Record<string, string> = {
  "PRIN-04": "flag", "TERM-01": "error", "TERM-02": "flag", "TERM-03": "warning",
  "TERM-07": "warning", "LAYER-06": "flag", "LAYER-07": "error", "CONS-01": "warning",
};

const rule = (id: string): Rule => rulesFixture.find((entry) => entry.id === id)!;
const patch = (id: string, change: (rule: Rule) => Rule): Rule[] => rulesFixture.map((entry) => (entry.id === id ? change(entry) : entry));
const hits = (id: string, text: string) => scanPatterns(compilePrefilter(rule(id)), text).map((hit) => ({ text: hit.text, start: hit.start, end: hit.end, action: hit.action }));

describe("checkedRules", () => {
  it("is exactly the eight active approved p0_check transcreation rules with resolved severities", () => {
    const checked = checkedRules(rulesFixture);
    expect(checked.map((entry) => entry.id).sort()).toEqual(Object.keys(EXPECTED_SEVERITY).sort());
    for (const entry of checked) expect(entry.resolution.severity, entry.id).toBe(EXPECTED_SEVERITY[entry.id]);
  });

  it("excludes retired, inactive, wrong-scope and literal-only rules", () => {
    const ids = (rules: Rule[]) => checkedRules(rules).map((entry) => entry.id);
    expect(ids(patch("TERM-01", (entry) => ({ ...entry, status: "retired" })))).not.toContain("TERM-01");
    expect(ids(patch("TERM-01", (entry) => ({ ...entry, resolution: { ...entry.resolution, active: false } })))).not.toContain("TERM-01");
    expect(ids(patch("TERM-01", (entry) => ({ ...entry, resolution: { ...entry.resolution, scope: "p1_check" } })))).not.toContain("TERM-01");
    expect(ids(patch("TERM-01", (entry) => ({ ...entry, resolution: { ...entry.resolution, layers: ["literal"] } })))).not.toContain("TERM-01");
    expect(ids(patch("TERM-01", (entry) => ({ ...entry, resolution: { ...entry.resolution, layers: ["literal", "transcreation"] } })))).toContain("TERM-01");
    expect(ids(patch("TERM-01", (entry) => ({ ...entry, status: "retired" }))).length).toBe(7);
  });

  it("leaves out rules whose resolution scope is not p0_check", () => {
    const outside = rulesFixture.filter((entry) => entry.resolution.scope !== "p0_check");
    expect(outside.length).toBeGreaterThan(0);
    const checked = new Set(checkedRules(rulesFixture).map((entry) => entry.id));
    for (const entry of outside) expect(checked.has(entry.id), entry.id).toBe(false);
  });
});

describe("compilePrefilter", () => {
  it("converts a leading (?i) into the i flag and keeps other flags", () => {
    const patterns = compilePrefilter(rule("LAYER-06"));
    expect(patterns[0].regex.flags).toContain("i");
    expect(patterns[0].regex.source.startsWith("(?i)")).toBe(false);
    expect(patterns[0].regex.test("THOU")).toBe(true);
  });

  it("keeps patterns without (?i) case-sensitive", () => {
    const patterns = compilePrefilter(rule("TERM-01"));
    expect(patterns[0].regex.flags).not.toContain("i");
    expect(patterns[0].action).toBe("flag");
    expect(hits("TERM-01", "Remembering God").filter((hit) => hit.action === "flag")).toHaveLength(1);
    expect(hits("TERM-01", "Remembering god")).toEqual([{ text: "god", start: 12, end: 15, action: "llm_confirm" }]);
  });

  it("returns no patterns for a rule without a prefilter", () => {
    expect(compilePrefilter(rule("CONS-01"))).toEqual([]);
    expect(compilePrefilter({ ...rule("CONS-01"), prefilter: null })).toEqual([]);
  });

  it("indexes patterns in seed order", () => {
    expect(compilePrefilter(rule("TERM-01")).map((pattern) => pattern.index)).toEqual([0, 1, 2]);
  });
});

describe("scanPatterns overlap resolution", () => {
  it("lets a deterministic flag beat an llm_confirm hit on the same span", () => {
    const found = hits("TERM-01", "The Lord sustains all.");
    expect(found).toEqual([{ text: "Lord", start: 4, end: 8, action: "flag" }]);
  });

  it("keeps one hit spanning a compound over the shorter flag inside it", () => {
    const found = hits("TERM-01", "Lord-Master of all.");
    expect(found).toEqual([{ text: "Lord-Master", start: 0, end: 11, action: "flag" }]);
  });

  it("keeps the llm_confirm hit when nothing deterministic overlaps", () => {
    expect(hits("TERM-01", "the gods and lords")).toEqual([
      { text: "gods", start: 4, end: 8, action: "llm_confirm" },
      { text: "lords", start: 13, end: 18, action: "llm_confirm" },
    ]);
  });

  it("returns hits in text order with non-overlapping spans", () => {
    const found = hits("TERM-01", "God and Lord, then lords.");
    expect(found.map((hit) => hit.start)).toEqual([...found.map((hit) => hit.start)].sort((a, b) => a - b));
    for (let i = 1; i < found.length; i += 1) expect(found[i].start).toBeGreaterThanOrEqual(found[i - 1].end);
  });

  it("reports exact UTF-16 offsets after a non-BMP character", () => {
    const text = "\u{1F600} Lord";
    const [hit] = scanPatterns(compilePrefilter(rule("TERM-01")), text);
    expect(hit).toMatchObject({ start: 3, end: 7, text: "Lord" });
    expect(text.slice(hit.start, hit.end)).toBe("Lord");
  });

  it("prefers the longer span, then the earlier pattern, when actions tie", () => {
    const base = rule("TERM-01");
    const custom: Rule = { ...base, prefilter: { proposal: false, keywords: [], notes: "", patterns: [
      { pattern: "ab", flags: "", action: "flag" }, { pattern: "abc", flags: "", action: "flag" }, { pattern: "abc", flags: "", action: "flag" },
    ] } };
    const [hit, ...rest] = scanPatterns(compilePrefilter(custom), "abc");
    expect(rest).toEqual([]);
    expect(hit).toMatchObject({ text: "abc", patternIndex: 1 });
  });
});
