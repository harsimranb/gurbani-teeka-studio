import { describe, expect, it } from "vitest";
import { rulesFixture } from "../../contracts/fixtures";
import { findingMatchesInput } from "../../contracts/domain";
import { compilePrefilter } from "../rules";
import { genericCheck, layer07Check, term01Check } from "./generic";
import type { CheckOutput, CodeCheck } from "./types";
import { syntheticInput } from "./test-helpers";

function run(check: CodeCheck, text: string): { output: CheckOutput; input: ReturnType<typeof syntheticInput> } {
  const input = syntheticInput([text]);
  const rule = rulesFixture.find((entry) => entry.id === check.ruleId)!;
  const output = check.run({ input, rule, patterns: compilePrefilter(rule), drafts: input.sabadDrafts });
  return { output, input };
}

const spans = (output: CheckOutput) => output.findings.map((finding) => [finding.quoted_span, finding.start, finding.end]);
const candidateSpans = (output: CheckOutput) => output.candidates.map((candidate) => candidate.quoted_span);

function expectWellFormed(check: CodeCheck, text: string) {
  const { output, input } = run(check, text);
  const severity = rulesFixture.find((entry) => entry.id === check.ruleId)!.resolution.severity;
  for (const finding of output.findings) {
    expect(findingMatchesInput(finding, input)).toBe(true);
    expect(finding).toMatchObject({ rule_id: check.ruleId, layer: "L1", model: "eko-code", severity, state: "current", reference_ids: [] });
    expect(finding.quoted_span).toBe(text.slice(finding.start, finding.end));
    expect(finding.explanation).not.toMatch(/incorrect|wrong/i);
  }
  return output;
}

describe("CHK-04 TERM-01", () => {
  const term01 = term01Check;
  const sentence = (word: string) => `They remember ${word} daily.`;

  it.each([
    ["God", "God"], ["Lord", "Lord"], ["God's", "God's"],
    ["Godhead", "Godhead"], ["Lordship", "Lordship"], ["Lord-Master", "Lord-Master"],
  ])("flags %s as an error finding at its exact span", (word, span) => {
    const text = sentence(word);
    const output = expectWellFormed(term01, text);
    const start = text.indexOf(word);
    expect(spans(output)).toEqual([[span, start, start + span.length]]);
    expect(output.findings[0].severity).toBe("error");
    expect(output.candidates).toEqual([]);
  });

  it.each([["gods"], ["lords"], ["goddess"], ["god"], ["lordly"], ["Lords"], ["Gods"]])("leaves lowercase or plural %s to the model as a candidate", (word) => {
    const output = expectWellFormed(term01, sentence(word));
    expect(output.findings).toEqual([]);
    expect(candidateSpans(output)).toEqual([word]);
    expect(output.candidates[0]).toMatchObject({ ruleId: "TERM-01", draftId: "synthetic-draft-1", start: sentence(word).indexOf(word) });
  });

  it("does not match inside landlord or warlord", () => {
    const output = expectWellFormed(term01, "The landlord demanded rent; the warlord took the harvest.");
    expect(output).toEqual({ findings: [], candidates: [] });
  });

  it("does nothing for Creator wording", () => {
    const output = expectWellFormed(term01, "The Creator sustains all, and nothing lies outside the Creator's Command.");
    expect(output).toEqual({ findings: [], candidates: [] });
  });

  it("reports every occurrence and keeps non-BMP offsets in UTF-16 units", () => {
    const text = "\u{1F600} God and Lord.";
    const output = expectWellFormed(term01, text);
    expect(spans(output)).toEqual([["God", 3, 6], ["Lord", 11, 15]]);
  });

  it("gives each finding a distinct stable id", () => {
    const { output } = run(term01, "God and Lord.");
    expect(new Set(output.findings.map((finding) => finding.id)).size).toBe(2);
    expect(run(term01, "God and Lord.").output.findings.map((finding) => finding.id)).toEqual(output.findings.map((finding) => finding.id));
  });
});

describe("CHK-05 LAYER-07", () => {
  it("reports each bracket character as its own error finding", () => {
    const text = "The mind (which is restless) finds [rest].";
    const output = expectWellFormed(layer07Check, text);
    expect(spans(output)).toEqual([["(", 9, 10], [")", 27, 28], ["[", 35, 36], ["]", 40, 41]]);
    expect(output.findings.every((finding) => finding.severity === "error")).toBe(true);
    expect(output.candidates).toEqual([]);
  });

  it.each(["(", ")", "[", "]"])("flags a lone %s", (bracket) => {
    const text = `The mind ${bracket} wanders.`;
    expect(spans(expectWellFormed(layer07Check, text))).toEqual([[bracket, 9, 10]]);
  });

  it("does nothing without brackets", () => {
    const output = expectWellFormed(layer07Check, "The restless mind finds its rest in the Wisdom of the Guru.");
    expect(output).toEqual({ findings: [], candidates: [] });
  });
});

describe("CHK-08 LAYER-06", () => {
  const layer06 = genericCheck("LAYER-06");

  it.each(["thee", "thou", "thy", "thine", "hath", "doth", "unto", "Thou"])("flags the closed-list archaism %s", (word) => {
    const text = `Praise be ${word} always.`;
    const output = expectWellFormed(layer06, text);
    expect(spans(output)).toEqual([[word, 10, 10 + word.length]]);
    expect(output.findings[0].severity).toBe("flag");
  });

  it("flags the archaisms in the synthetic Thou art sentence and leaves art to the model", () => {
    const output = expectWellFormed(layer06, "Thou art the Giver; Thy gifts are endless.");
    expect(spans(output)).toEqual([["Thou", 0, 4], ["Thy", 20, 23]]);
    expect(candidateSpans(output)).toEqual(["art"]);
  });

  it.each(["art", "ye", "lo", "behold"])("leaves ambiguous %s as a candidate only", (word) => {
    const output = expectWellFormed(layer06, `Why ${word} wander so.`);
    expect(output.findings).toEqual([]);
    expect(candidateSpans(output)).toEqual([word]);
  });

  it.each(["walketh", "knowest"])("leaves the -eth/-est word %s as a candidate only", (word) => {
    const output = expectWellFormed(layer06, `He ${word} on.`);
    expect(output.findings).toEqual([]);
    expect(candidateSpans(output)).toEqual([word]);
  });

  it("raises no finding for -est words inside ordinary English", () => {
    const output = expectWellFormed(layer06, "The best rest is found in the forest of contentment.");
    expect(output.findings).toEqual([]);
    expect(candidateSpans(output)).toEqual(["forest"]);
  });

  it("does nothing for plain contemporary wording", () => {
    const output = expectWellFormed(layer06, "You are the Giver; Your gifts never run out.");
    expect(output).toEqual({ findings: [], candidates: [] });
  });
});

describe("PRIN-04 deterministic tier", () => {
  const prin04 = genericCheck("PRIN-04");

  it("flags a claim that other translations are wrong, with neutral wording", () => {
    const text = "Experts agree that other translations are wrong here.";
    const output = expectWellFormed(prin04, text);
    expect(spans(output)).toEqual([["other translations are wrong", 19, 47]]);
    expect(output.findings[0].severity).toBe("flag");
  });

  it("leaves a claim of a single correct translation to the model", () => {
    const output = expectWellFormed(prin04, "This is the only correct translation of the line.");
    expect(output.findings).toEqual([]);
    expect(candidateSpans(output)).toEqual(["the only correct translation"]);
  });

  it("does nothing for ordinary use of true", () => {
    const output = expectWellFormed(prin04, "He was a true friend when it mattered.");
    expect(output).toEqual({ findings: [], candidates: [] });
  });

  it("does nothing for hedged readings", () => {
    const output = expectWellFormed(prin04, "Some read this line as fear; here it is read as awe.");
    expect(output).toEqual({ findings: [], candidates: [] });
  });
});

describe("unit scope", () => {
  it("reports only on the drafts it is given", () => {
    const input = syntheticInput(["The Lord sustains.", "God sustains."]);
    const rule = rulesFixture.find((entry) => entry.id === "TERM-01")!;
    const output = genericCheck("TERM-01").run({ input, rule, patterns: compilePrefilter(rule), drafts: [input.sabadDrafts[1]] });
    expect(output.findings.map((finding) => finding.draft_id)).toEqual(["synthetic-draft-2"]);
  });
});
