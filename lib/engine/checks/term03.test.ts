import { describe, expect, it } from "vitest";
import { findingMatchesInput } from "../../contracts/domain";
import { checkedRules, compilePrefilter } from "../rules";
import { syntheticInput } from "./test-helpers";
import { term03Check } from "./term03";

function run(texts: string[]) {
  const input = syntheticInput(texts);
  const rule = checkedRules(input.rules).find((entry) => entry.id === "TERM-03")!;
  const output = term03Check.run({ input, rule, patterns: compilePrefilter(rule), drafts: input.sabadDrafts });
  for (const finding of output.findings) {
    const draft = input.sabadDrafts.find((entry) => entry.id === finding.draft_id)!;
    expect(draft.text.slice(finding.start, finding.end)).toBe(finding.quoted_span);
    expect(findingMatchesInput(finding, input)).toBe(true);
    expect(finding.explanation).not.toMatch(/incorrect|wrong/i);
    expect(finding.severity).toBe("warning");
  }
  return { ...output, input };
}

const GLOSS = "One Universal Integrative Force";

describe("TERM-03 check", () => {
  it("passes the exact spelling with a comma gloss at first use", () => {
    expect(run([`IkOankar, ${GLOSS}, pervades everything.`]).findings).toEqual([]);
  });

  it("accepts a dash gloss, with an optional 'the'", () => {
    expect(run([`IkOankar - ${GLOSS} - pervades everything.`]).findings).toEqual([]);
    expect(run([`IkOankar—the ${GLOSS}—pervades everything.`]).findings).toEqual([]);
  });

  it("flags a variant spelling at exact offsets", () => {
    const text = "Ik Onkar pervades everything.";
    const { findings } = run([text]);
    const spelling = findings.filter((finding) => finding.id.endsWith(":spelling"));
    expect(spelling).toHaveLength(1);
    expect(spelling[0]).toMatchObject({ rule_id: "TERM-03", start: 0, end: 8, quoted_span: "Ik Onkar", layer: "L1" });
    expect(spelling[0].explanation).toBe('"Ik Onkar" differs from the spelling TERM-03 specifies.');
  });

  it("flags first use without a gloss", () => {
    const { findings } = run(["IkOankar pervades everything."]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ start: 0, end: 8, quoted_span: "IkOankar" });
    expect(findings[0].id).toMatch(/:first-use-gloss$/);
    expect(findings[0].explanation).toBe('First use of "IkOankar" in this Sabad has no apposition gloss (comma or dash), which TERM-03 asks for at first use.');
  });

  it("does not accept a parenthesised gloss as an apposition", () => {
    expect(run([`IkOankar (${GLOSS}) pervades everything.`]).findings).toHaveLength(1);
  });

  it("flags the first unit when the gloss only appears on a later unit", () => {
    const { findings, input } = run(["IkOankar pervades everything.", `IkOankar, ${GLOSS}, abides.`]);
    expect(findings).toHaveLength(1);
    expect(findings[0].draft_id).toBe(input.sabadDrafts[0].id);
  });

  it("treats the first use in unit 2 as the Sabad's first use", () => {
    const { findings, input } = run(["Nothing to see here.", "IkOankar pervades everything.", "IkOankar abides."]);
    expect(findings).toHaveLength(1);
    expect(findings[0].draft_id).toBe(input.sabadDrafts[1].id);
  });

  it("never requires a gloss on a second occurrence", () => {
    expect(run([`IkOankar, ${GLOSS}, pervades.`, "IkOankar abides.", "IkOankar and IkOankar again."]).findings).toEqual([]);
    expect(run(["IkOankar pervades everything and IkOankar abides."]).findings).toHaveLength(1);
  });

  it("counts a misspelt first use as the first use for the gloss check", () => {
    const { findings } = run(["Ik Onkar pervades everything.", `IkOankar, ${GLOSS}, abides.`]);
    expect(findings.map((finding) => finding.id.split(":").pop()).sort()).toEqual(["first-use-gloss", "spelling"]);
  });

  it("gives distinct ids when spelling and gloss findings share a span", () => {
    const { findings } = run(["Ek Onkar pervades everything."]);
    expect(findings).toHaveLength(2);
    expect(findings[0].start).toBe(findings[1].start);
    expect(findings[0].end).toBe(findings[1].end);
    expect(new Set(findings.map((finding) => finding.id)).size).toBe(2);
  });

  it("flags One Universal Creator as a spelling finding", () => {
    const text = "One Universal Creator pervades everything.";
    const { findings } = run([text]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ start: 0, end: 21, quoted_span: "One Universal Creator" });
    expect(findings[0].id).toMatch(/:spelling$/);
  });

  it("is Sabad-scoped and produces no candidates", () => {
    expect(term03Check.scope).toBe("sabad");
    expect(run(["Ik Onkar pervades everything."]).candidates).toEqual([]);
  });
});
