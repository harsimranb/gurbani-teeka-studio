import { describe, expect, it } from "vitest";
import { EvalRunSchema, FindingSchema } from "../../contracts/domain";
import type { Finding, ReviewCorrection } from "../../contracts/domain";
import { editHunks, overlaps } from "./align";
import { POLICY_ID, scoreBacktest, toEvalRun } from "./metrics";
import type { BacktestItem } from "./metrics";

// All texts below are SYNTHETIC English test markers, not transcreations or SikhRI review history.
const AT = "2026-10-16T12:00:00.000Z";

function correction(id: string, pre: string, post: string, label: ReviewCorrection["label"] = "unclassified", changed_spans: ReviewCorrection["changed_spans"] = []): ReviewCorrection {
  return { id, line_ids: [`line-${id}`], pre_edit: pre, post_edit: post, reviewer: "Synthetic test reviewer", source_id: "synthetic-source", label, changed_spans };
}

/** A contract-valid finding on `quoted` inside `text` (first occurrence at or after `from`). */
function finding(id: string, rule: string, text: string, quoted: string, from = 0): Finding {
  const start = text.indexOf(quoted, from);
  return FindingSchema.parse({
    id, draft_id: "d", draft_version: 1, ruleset_version: 1, rule_id: rule, rule_version: 1, layer: "L1", severity: "flag",
    quoted_span: quoted, start, end: start + quoted.length, explanation: "Synthetic test evidence.", reference_ids: [],
    model: "synthetic-test", prompt_version: "synthetic-v1", state: "current", cleared_at: null,
  });
}
const evaluated = (c: ReviewCorrection, findings: Finding[], notEvaluable: Array<{ ruleId: string; reason: string }> = []): BacktestItem => ({ correction: c, run: { status: "evaluated", findings, notEvaluable } });

describe("overlaps", () => {
  it("uses end-exclusive ranges: touching ranges do not overlap, one shared code unit does", () => {
    expect(overlaps({ start: 0, end: 5 }, { start: 5, end: 9 })).toBe(false);
    expect(overlaps({ start: 0, end: 6 }, { start: 5, end: 9 })).toBe(true);
    expect(overlaps({ start: 2, end: 3 }, { start: 0, end: 9 })).toBe(true);
    expect(overlaps({ start: 4, end: 4 }, { start: 0, end: 9 })).toBe(false);
  });
});

describe("editHunks", () => {
  it("returns the replaced range in the pre-edit text, aligned to whole words", () => {
    const pre = "The SYNTHETIC colour is fixed here";
    const hunks = editHunks(pre, "The SYNTHETIC color is fixed here");
    expect(hunks).toHaveLength(1);
    expect(pre.slice(hunks[0].span!.start, hunks[0].span!.end)).toBe("colour");
    expect(hunks[0].after).toBe("color");
  });

  it("keeps separate edits separate instead of one big span", () => {
    const pre = "alpha beta gamma delta epsilon";
    const hunks = editHunks(pre, "ALPHA beta gamma delta EPSILON");
    expect(hunks.map((hunk) => pre.slice(hunk.span!.start, hunk.span!.end))).toEqual(["alpha", "epsilon"]);
  });

  it("treats a deletion as a span and a pure insertion as a hunk without a pre-edit span", () => {
    const pre = "one (two) three";
    const deleted = editHunks(pre, "one three");
    expect(pre.slice(deleted[0].span!.start, deleted[0].span!.end)).toBe("(two)");
    expect(editHunks("one three", "one two three")).toEqual([{ span: null, before: "", after: "two" }]);
  });

  it("ignores whitespace-only differences", () => {
    expect(editHunks("one  two", "one two")).toEqual([]);
  });

  it("counts a changed punctuation mark as an edit", () => {
    const pre = "one two, three";
    const hunks = editHunks(pre, "one two; three");
    expect(pre.slice(hunks[0].span!.start, hunks[0].span!.end)).toBe(",");
  });
});

describe("scoreBacktest (provisional OQ-14 policy)", () => {
  const caughtText = "The kind lord (all-giving) holds the mind steady";
  const caught = correction("caught", caughtText, "The kind lord holds the mind steady");
  const missed = correction("missed", "The old rope frays at dawn", "The old rope frays at dusk");
  const typo = correction("typo", "The hymn is recieved gladly", "The hymn is received gladly", "typo");
  const scope = correction("scope", "A note on the printing press", "A note on the press", "out_of_scope");
  const insertion = correction("insertion", "one three", "one two three");
  const same = correction("same", "identical text", "identical  text");

  const items: BacktestItem[] = [
    // Caught by LAYER-07 on "(", plus a false flag on "kind" and a hit on a different rule inside the same edit.
    evaluated(caught, [finding("f1", "LAYER-07", caughtText, "("), finding("f2", "PRIN-04", caughtText, "kind"), finding("f3", "TERM-01", caughtText, "all-giving")]),
    evaluated(missed, []),
    // The typo is flagged: not a false flag, not part of any denominator.
    evaluated(typo, [finding("f4", "PRIN-04", typo.pre_edit, "recieved")]),
    evaluated(scope, [finding("f5", "TERM-01", scope.pre_edit, "printing")]),
    evaluated(insertion, []),
    evaluated(same, []),
    { correction: correction("gone", "not run", "not run either"), run: { status: "not_evaluated", reason: "Source lines not available." } },
  ];
  const score = scoreBacktest(items, { ruleIds: ["LAYER-07", "PRIN-04", "TERM-01", "TERM-07"] });

  it("separates typo, out-of-scope and unmatched corrections from the catch-rate denominator", () => {
    expect(score.n_corrections).toBe(7);
    expect(score.excluded).toEqual({ typos: 1, out_of_scope: 1, unmatched: 3 });
    expect(score.catch).toEqual({ numerator: 1, denominator: 2 });
    expect(score.n_corrections - score.excluded.typos - score.excluded.out_of_scope - score.excluded.unmatched).toBe(score.catch.denominator);
    expect(score.not_evaluated).toBe(1);
  });

  it("explains each unmatched correction instead of dropping it", () => {
    const unmatched = score.items.flatMap((item) => item.units).filter((unit) => unit.kind === "unmatched");
    expect(unmatched.map((unit) => unit.correction_id)).toEqual(["insertion", "same", "gone"]);
    expect(unmatched.every((unit) => !!unit.reason)).toBe(true);
  });

  it("traces a caught correction to its findings and a missed one to none", () => {
    const [caughtUnit] = score.items[0].units;
    expect(caughtUnit.kind).toBe("in_scope");
    expect(caughtUnit.caught_by.map((entry) => entry.finding_id)).toEqual(["f1", "f3"]);
    expect(score.items[1].units[0].caught_by).toEqual([]);
  });

  it("counts findings overlapping no changed span as false flags and leaves out findings on typo or out-of-scope edits", () => {
    expect(score.n_findings).toBe(5);
    expect(score.items[0].findings.map((entry) => [entry.id, entry.class])).toEqual([["f2", "false_flag"], ["f1", "matched"], ["f3", "matched"]]);
    expect(score.items[2].findings[0].class).toBe("excluded");
    expect(score.items[3].findings[0].class).toBe("excluded");
    expect(score.false_flag).toEqual({ numerator: 1, denominator: 3 });
  });

  it("reports per-rule numerators over the same in-scope sample", () => {
    const rule = (id: string) => score.per_rule.find((entry) => entry.rule_id === id)!;
    expect(rule("LAYER-07").catch).toEqual({ numerator: 1, denominator: 2 });
    expect(rule("LAYER-07").false_flag).toEqual({ numerator: 0, denominator: 1 });
    expect(rule("PRIN-04").catch).toEqual({ numerator: 0, denominator: 2 });
    expect(rule("PRIN-04").false_flag).toEqual({ numerator: 1, denominator: 1 });
    expect(rule("TERM-07").false_flag).toEqual({ numerator: 0, denominator: 0 });
  });

  it("produces a contract-valid EvalRun with explicit numerators, denominators and a null rate for an empty denominator", () => {
    const run = EvalRunSchema.parse(toEvalRun(score, { id: "eval-test", at: AT, rulesetVersion: 1, dataLabel: "synthetic_test" }));
    if (run.status !== "available") throw new Error("expected an available run");
    expect(run.policy.id).toBe(POLICY_ID);
    expect(run.policy.description).toContain("SYNTHETIC TEST DATA");
    expect(run.policy.description).toContain("1 correction record(s) could not be run");
    expect(run.catch_rate).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(run.per_rule.find((entry) => entry.rule_id === "TERM-07")!.false_flag_rate).toEqual({ numerator: 0, denominator: 0, rate: null });
  });
});

describe("scoreBacktest edge cases", () => {
  it("does not count a finding on a correction labelled unmatched as a false flag", () => {
    const pre = "plain synthetic sentence here";
    const start = pre.indexOf("sentence");
    const c = correction("u", pre, "plain synthetic phrase here", "unmatched", [{ start, end: start + "sentence".length }]);
    const score = scoreBacktest([evaluated(c, [finding("f1", "PRIN-04", pre, "sentence")])], { ruleIds: ["PRIN-04"] });
    expect(score.items[0].findings[0].class).toBe("excluded");
    expect(score.false_flag).toMatchObject({ numerator: 0, denominator: 0 });
  });

  it("never reports 0% for rules that could not be evaluated: they are named and left out of per_rule", () => {
    const text = "plain synthetic sentence here";
    const c = correction("a", text, "plain synthetic phrase here");
    const score = scoreBacktest([evaluated(c, [], [{ ruleId: "TERM-02", reason: "model check not run." }])], { ruleIds: ["TERM-02", "PRIN-04"] });
    expect(score.per_rule.map((rule) => rule.rule_id)).toEqual(["PRIN-04"]);
    expect(score.rules_not_evaluable).toEqual([{ rule_id: "TERM-02", drafts: 1, reason: "model check not run." }]);
    const run = toEvalRun(score, { id: "x", at: AT, rulesetVersion: 1, dataLabel: "real_review_history" });
    expect(run.policy.description).toContain("Not evaluated in this run: TERM-02");
    expect(run.policy.description).not.toContain("SYNTHETIC");
  });

  it("gives null rates and no per-rule rows when nothing could be evaluated", () => {
    const score = scoreBacktest([{ correction: correction("a", "x y", "x z"), run: { status: "not_evaluated", reason: "No source lines." } }], { ruleIds: ["PRIN-04"] });
    expect(score.catch).toEqual({ numerator: 0, denominator: 0 });
    expect(score.per_rule).toEqual([]);
    const run = EvalRunSchema.parse(toEvalRun(score, { id: "x", at: AT, rulesetVersion: 1, dataLabel: "synthetic_test" }));
    expect(run.status === "available" && run.catch_rate.rate).toBeNull();
  });

  it("uses provided changed spans when present and rejects ones outside the pre-edit text", () => {
    const pre = "alpha beta gamma";
    const ok = scoreBacktest([evaluated(correction("a", pre, "alpha BETA gamma", "in_scope", [{ start: 6, end: 10 }]), [finding("f", "R", pre, "beta")])]);
    expect(ok.catch).toEqual({ numerator: 1, denominator: 1 });
    const bad = scoreBacktest([evaluated(correction("b", pre, "alpha BETA gamma", "in_scope", [{ start: 6, end: 99 }]), [])]);
    expect(bad.excluded.unmatched).toBe(1);
    expect(bad.catch.denominator).toBe(0);
  });

  it("counts each separate edit of one record as its own correction", () => {
    const pre = "alpha beta gamma delta";
    const c = correction("a", pre, "ALPHA beta gamma DELTA");
    const score = scoreBacktest([evaluated(c, [finding("f", "R", pre, "alpha")])]);
    expect(score.catch).toEqual({ numerator: 1, denominator: 2 });
  });

  it("does not treat a finding that only touches a changed span as overlapping", () => {
    const pre = "alpha beta gamma";
    const c = correction("a", pre, "alpha BETA gamma");
    const score = scoreBacktest([evaluated(c, [finding("f", "R", pre, "alpha ")])]);
    expect(score.catch.numerator).toBe(0);
    expect(score.false_flag).toEqual({ numerator: 1, denominator: 1 });
  });

  it("is deterministic regardless of finding order", () => {
    const pre = "alpha beta gamma";
    const c = correction("a", pre, "alpha BETA gamma");
    const one = finding("f1", "A", pre, "alpha");
    const two = finding("f2", "B", pre, "beta");
    expect(scoreBacktest([evaluated(c, [one, two])])).toEqual(scoreBacktest([evaluated(c, [two, one])]));
  });
});
