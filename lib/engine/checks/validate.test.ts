import { describe, expect, it } from "vitest";
import { CheckInputSchema } from "../../contracts/domain";
import type { CheckInput, Finding } from "../../contracts/domain";
import { rulesFixture } from "../../contracts/fixtures";
import { makeFinding } from "./finding";
import { syntheticInput } from "./test-helpers";
import { validateFindings } from "./validate";

const term01 = rulesFixture.find((rule) => rule.id === "TERM-01")!;

function valid(input: CheckInput, draftIndex = 0, text = input.sabadDrafts[draftIndex].text): Finding {
  const start = text.indexOf("Lord");
  return makeFinding({ input, draft: input.sabadDrafts[draftIndex], rule: term01, start, end: start + 4, explanation: "Matches a TERM-01 pattern." });
}

describe("CHK-09 validateFindings", () => {
  const input = syntheticInput(["The Lord sustains all.", "The Lord guides all."]);
  const good = valid(input);

  it("keeps a valid finding unchanged", () => {
    expect(validateFindings([good], input)).toEqual([good]);
  });

  const mutations: Array<[string, unknown]> = [
    ["unknown rule_id", { ...good, rule_id: "NOPE-01" }],
    ["wrong rule_version", { ...good, rule_version: 2 }],
    ["unknown reference_id", { ...good, reference_ids: ["missing-reference"] }],
    ["quoted_span differing from the slice", { ...good, quoted_span: "Lard" }],
    ["offsets shifted forward by one", { ...good, start: good.start + 1, end: good.end + 1 }],
    ["offsets shifted back by one", { ...good, start: good.start - 1, end: good.end - 1 }],
    ["end past the text", { ...good, end: 500, quoted_span: "Lord" }],
    ["draft_id not in sabadDrafts", { ...good, draft_id: "no-such-draft" }],
    ["stale draft_version", { ...good, draft_version: 2 }],
    ["stale ruleset_version", { ...good, ruleset_version: 2 }],
    ["cleared state with a clearing time", { ...good, state: "cleared", cleared_at: "2026-10-16T12:00:00.000Z" }],
    ["cleared state without a clearing time", { ...good, state: "cleared" }],
    ["unknown severity", { ...good, severity: "critical" }],
    ["unexpected extra field", { ...good, suggestion: "rewrite" }],
    ["missing explanation", { ...good, explanation: "  " }],
    ["null", null],
    ["a string", "finding"],
  ];

  it.each(mutations)("drops a finding with %s", (_name, candidate) => {
    expect(validateFindings([candidate], input)).toEqual([]);
  });

  it("drops only the invalid candidates from a mixed batch, preserving order", () => {
    const second = valid(input, 1);
    const result = validateFindings([{ ...good, rule_id: "NOPE-01" }, second, null, good], input);
    expect(result).toEqual([second, good]);
  });

  it("keeps the first of duplicate ids", () => {
    const duplicate = { ...good, explanation: "A second explanation with the same id." };
    expect(validateFindings([good, duplicate], input)).toEqual([good]);
    expect(validateFindings([duplicate, good], input)).toEqual([duplicate]);
  });

  it("keeps a finding on a non-selected unit of the Sabad", () => {
    expect(input.draft.id).toBe("synthetic-draft-1");
    const other = valid(input, 1);
    expect(other.draft_id).toBe("synthetic-draft-2");
    expect(validateFindings([other], input)).toEqual([other]);
  });

  it("keeps a finding whose reference exists and drops it once the reference is gone", () => {
    const withReference = CheckInputSchema.parse({
      ...input,
      references: [{ id: "ref-1", line_ids: ["synthetic-line-1"], english: "SYNTHETIC reference", source: "published", exceptions: [] }],
    });
    const cited = { ...good, reference_ids: ["ref-1"] };
    expect(validateFindings([cited], withReference)).toEqual([cited]);
    expect(validateFindings([cited], input)).toEqual([]);
  });

  it("validates against the rule version in the input, not the finding's own claim", () => {
    const upgraded = { ...input, rules: input.rules.map((rule) => (rule.id === "TERM-01" ? { ...rule, version: 2 } : rule)) };
    expect(validateFindings([good], upgraded)).toEqual([]);
    expect(validateFindings([{ ...good, rule_version: 2 }], upgraded)).toEqual([{ ...good, rule_version: 2 }]);
  });

  describe("grouped authored unit", () => {
    const base = syntheticInput(["placeholder one", "placeholder two", "The Lord sustains all."]);
    const [one, two, three] = base.sabadDrafts;
    const grouped = { ...one, line_ids: [...one.line_ids, ...two.line_ids], text: "A grouped unit says the Lord sustains all." };
    const groupedInput = CheckInputSchema.parse({ ...base, draft: grouped, sabadDrafts: [grouped, three], changedLineIds: grouped.line_ids });

    it("keeps a finding on a draft that covers two source lines", () => {
      const finding = valid(groupedInput, 0);
      expect(groupedInput.sabadDrafts[0].line_ids).toHaveLength(2);
      expect(validateFindings([finding], groupedInput)).toEqual([finding]);
    });

    it("keeps a finding on the unselected single-line unit", () => {
      const finding = valid(groupedInput, 1);
      expect(finding.draft_id).toBe(three.id);
      expect(validateFindings([finding], groupedInput)).toEqual([finding]);
    });

    it("drops a finding that cites a draft id absent from the grouped snapshot", () => {
      expect(validateFindings([{ ...valid(groupedInput, 0), draft_id: two.id }], groupedInput)).toEqual([]);
    });
  });

  describe("UTF-16 offsets", () => {
    const emoji = syntheticInput(["\u{1F600} The Lord sustains all."]);
    const text = emoji.sabadDrafts[0].text;

    it("keeps correct code-unit offsets after a non-BMP character", () => {
      const finding = valid(emoji);
      expect(finding.start).toBe(text.indexOf("Lord"));
      expect(finding.start).toBe(7);
      expect(validateFindings([finding], emoji)).toEqual([finding]);
    });

    it("drops code-point offsets, which are one lower per non-BMP character", () => {
      const finding = valid(emoji);
      expect(text.length - Array.from(text).length).toBe(1);
      const shifted = { ...finding, start: finding.start - 1, end: finding.end - 1 };
      expect(validateFindings([shifted], emoji)).toEqual([]);
    });
  });
});
