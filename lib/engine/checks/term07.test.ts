import { describe, expect, it } from "vitest";
import { findingMatchesInput } from "../../contracts/domain";
import { compilePrefilter } from "../rules";
import { parseGlossedTerms, term07Check } from "./term07";
import { syntheticInput } from "./test-helpers";

function run(texts: string[]) {
  const input = syntheticInput(texts);
  const rule = input.rules.find((candidate) => candidate.id === "TERM-07")!;
  const output = term07Check.run({ input, rule, patterns: compilePrefilter(rule), drafts: input.sabadDrafts });
  for (const finding of output.findings) {
    const draft = input.sabadDrafts.find((unit) => unit.id === finding.draft_id)!;
    expect(findingMatchesInput(finding, input)).toBe(true);
    expect(draft.text.slice(finding.start, finding.end)).toBe(finding.quoted_span);
    expect(finding.explanation).not.toMatch(/incorrect|wrong/i);
  }
  return { input, rule, ...output };
}

describe("TERM-07", () => {
  it("passes a glossed Sabad with the preferred spelling", () => {
    const { findings, candidates } = run(["Through Sabad, Infinite Wisdom, the mind is steadied."]);
    expect(findings).toEqual([]);
    expect(candidates).toEqual([]);
  });

  it("flags Shabad as a spelling warning at exact offsets", () => {
    const text = "Through the Shabad, the mind is steadied.";
    const { findings } = run([text]);
    const spelling = findings.filter((finding) => finding.id.endsWith(":spelling"));
    expect(spelling).toHaveLength(1);
    expect(spelling[0]).toMatchObject({ severity: "warning", quoted_span: "Shabad", start: text.indexOf("Shabad"), end: text.indexOf("Shabad") + 6, rule_id: "TERM-07" });
    expect(spelling[0].explanation).toBe('"Shabad" differs from the spelling TERM-07 lists for this term.');
  });

  it("flags Naam", () => {
    const { findings } = run(["Meditate on Naam and be free."]);
    expect(findings.filter((finding) => finding.quoted_span === "Naam" && finding.severity === "warning")).toHaveLength(1);
  });

  it("exempts Shabad Hazare and Shabad Hazaray titles but not a bare Shabad beside them", () => {
    const { findings } = run(["He recited Shabad Hazare and Shabad Hazaray."]);
    expect(findings.filter((finding) => finding.id.endsWith(":spelling"))).toEqual([]);
    const text = "He recited Shabad Hazare, then the Shabad.";
    const mixed = run([text]);
    expect(mixed.findings.filter((finding) => finding.id.endsWith(":spelling")).map((finding) => finding.start)).toEqual([text.lastIndexOf("Shabad")]);
  });

  it("flags Padshah and Parkash Purab", () => {
    const { findings } = run(["The Padshah came for Parkash Purab."]);
    expect(findings.filter((finding) => finding.id.endsWith(":spelling")).map((finding) => finding.quoted_span)).toEqual(["Padshah", "Parkash Purab"]);
  });

  it("turns the Word / the Name / hymn into candidates, not findings", () => {
    const { findings, candidates } = run(["Through the Word and the Name, sing a hymn."]);
    expect(findings.filter((finding) => finding.id.endsWith(":spelling"))).toEqual([]);
    expect(candidates.map((candidate) => candidate.quoted_span)).toEqual(["the Word", "the Name", "hymn"]);
    expect(candidates.every((candidate) => candidate.ruleId === "TERM-07")).toBe(true);
  });

  it("ignores lowercase word and name", () => {
    const { findings, candidates } = run(["A kind word and a good name."]);
    expect(findings).toEqual([]);
    expect(candidates).toEqual([]);
  });

  it("parses the five glossed pairs from the verbatim rule text", () => {
    const { rule } = run(["x"]);
    expect(parseGlossedTerms(rule.text)).toEqual([
      { term: "Sabad", gloss: "Infinite Wisdom" },
      { term: "Nam", gloss: "Identification with IkOankar" },
      { term: "Panth", gloss: "Collective" },
      { term: "Patshah", gloss: "Sovereign" },
      { term: "Prakash Purab", gloss: "Illumination Day" },
    ]);
  });

  it("hints on a bare first use, with a neutral explanation on the term span", () => {
    const text = "Through Sabad the mind is steadied.";
    const { findings } = run([text]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "hint", quoted_span: "Sabad", start: 8, end: 13 });
    expect(findings[0].id.endsWith(":first-use-gloss")).toBe(true);
    expect(findings[0].explanation).toBe('First use of "Sabad" in this Sabad has no apposition gloss (comma or dash); TERM-07 asks for a gloss at first use.');
  });

  it("hints only on first use in the Sabad", () => {
    const glossedFirst = run(["Through Sabad, Infinite Wisdom, we rise.", "Sabad steadies the mind."]);
    expect(glossedFirst.findings).toEqual([]);
    const bareFirst = run(["Through Sabad we rise.", "Sabad, Infinite Wisdom, steadies the mind."]);
    expect(bareFirst.findings).toHaveLength(1);
    expect(bareFirst.findings[0]).toMatchObject({ draft_id: "synthetic-draft-1", severity: "hint", quoted_span: "Sabad" });
  });

  it("accepts dash glosses and an optional 'the'", () => {
    for (const text of ["Through Sabad - Infinite Wisdom - we rise.", "Through Sabad—the Infinite Wisdom—we rise.", "Panth – Collective gathers.", "Patshah,Sovereign, speaks."]) {
      expect(run([text]).findings).toEqual([]);
    }
  });

  it("hints for other glossed terms and skips unglossed ones", () => {
    const { findings } = run(["Nam and Panth and Bani and Gurmat."]);
    expect(findings.map((finding) => finding.quoted_span)).toEqual(["Nam", "Panth"]);
  });

  it("exempts a Bani title from spelling while still checking a later glossed first use", () => {
    expect(run(["Shabad Hazare is sung. Through Sabad, Infinite Wisdom, we rise."]).findings).toEqual([]);
  });
});
