import type { EvalRun, Finding, NotEvaluable, ReviewCorrection } from "../../contracts/domain";
import { editHunks, overlaps } from "./align";
import type { Range } from "./align";

/**
 * OQ-14 provisional default, pending SikhRI confirmation (see _docs/08-open-questions.md).
 * Changing any rule below changes the numbers, so the policy id travels with every run.
 */
export const POLICY_ID = "oq14-provisional-v1";
export const POLICY_DESCRIPTION = "Provisional (OQ-14). A correction is a span the reviewer changed between the pre-edit draft and the approved text. "
  + "It is caught when a finding on the pre-edit draft overlaps that span, otherwise missed. A finding overlapping no changed span is a false flag. "
  + "Corrections tagged typo or out-of-scope, and corrections that cannot be aligned to the draft, are counted separately and left out of the catch-rate denominator; "
  + "findings overlapping a typo or out-of-scope correction are not false flags.";

/** What happened when one pre-edit draft went through the engine. */
export type ItemRun =
  | { status: "evaluated"; findings: Finding[]; notEvaluable: NotEvaluable[] }
  | { status: "not_evaluated"; reason: string };
export interface BacktestItem { correction: ReviewCorrection; run: ItemRun }

export type UnitKind = "in_scope" | "typo" | "out_of_scope" | "unmatched";
/** One reviewer change inside a correction record. Catch rate counts these units. */
export interface CorrectionUnit {
  id: string; correction_id: string; kind: UnitKind;
  /** Range in the pre-edit text; null when nothing in it can be aligned (pure insertion, bad span, not run). */
  span: Range | null; before: string; after: string;
  /** Why the unit is `unmatched`. */
  reason?: string;
  /** Findings overlapping the span; empty for a missed correction. Filled for in-scope units only. */
  caught_by: Array<{ finding_id: string; rule_id: string }>;
}
export type FindingClass = "matched" | "excluded" | "false_flag";
export interface ScoredFinding { id: string; rule_id: string; quoted_span: string; start: number; end: number; class: FindingClass; unit_ids: string[] }
export interface ScoredItem {
  correction_id: string; line_ids: string[]; evaluated: boolean; reason?: string;
  units: CorrectionUnit[]; findings: ScoredFinding[];
}
export interface Tally { numerator: number; denominator: number }
export interface BacktestScore {
  items: ScoredItem[];
  /** Correction units, in every category. */
  n_corrections: number;
  /** Findings raised on all evaluated pre-edit drafts, in every class. */
  n_findings: number;
  excluded: { typos: number; out_of_scope: number; unmatched: number };
  /** Caught in-scope units over all in-scope, aligned units. */
  catch: Tally;
  /** False-flag findings over findings that are not excluded (matched plus false flags). */
  false_flag: Tally;
  per_rule: Array<{ rule_id: string; catch: Tally; false_flag: Tally }>;
  /** Rules that reported `notEvaluable` for at least one pre-edit draft. They are left out of `per_rule`. */
  rules_not_evaluable: Array<{ rule_id: string; drafts: number; reason: string }>;
  /** Records that could not be run through the engine at all. */
  not_evaluated: number;
}

function unitsFor(correction: ReviewCorrection, run: ItemRun): CorrectionUnit[] {
  const base = (n: number, span: Range | null, before: string, after: string): CorrectionUnit => ({
    id: `${correction.id}#${n}`, correction_id: correction.id, kind: "unmatched", span, before, after, caught_by: [],
  });
  const classify = (unit: CorrectionUnit, reason: string | undefined): CorrectionUnit => {
    if (correction.label === "typo" || correction.label === "out_of_scope") return { ...unit, kind: correction.label };
    if (correction.label === "unmatched") return { ...unit, kind: "unmatched", reason: "The record is labelled unmatched." };
    if (run.status === "not_evaluated") return { ...unit, kind: "unmatched", reason: run.reason };
    if (!unit.span || reason) return { ...unit, kind: "unmatched", reason: reason ?? "A pure insertion has no pre-edit span to align findings to." };
    return { ...unit, kind: "in_scope" };
  };
  const length = correction.pre_edit.length;
  let drafted: Array<{ span: Range | null; before: string; after: string }>;
  let problem: string | undefined;
  if (correction.changed_spans.length > 0) {
    // Provided positions are evidence; they must lie inside the pre-edit text to be usable.
    if (correction.changed_spans.some((span) => span.end > length)) {
      drafted = [{ span: null, before: "", after: "" }];
      problem = "A provided changed span lies outside the pre-edit text.";
    } else {
      drafted = correction.changed_spans.map((span) => span.end > span.start
        ? { span: { start: span.start, end: span.end }, before: correction.pre_edit.slice(span.start, span.end), after: "" }
        : { span: null, before: "", after: "" });
    }
  } else {
    drafted = editHunks(correction.pre_edit, correction.post_edit);
    if (drafted.length === 0) {
      drafted = [{ span: null, before: "", after: "" }];
      problem = "The pre-edit and approved text do not differ in any word or punctuation mark.";
    }
  }
  return drafted.map((entry, index) => classify(base(index + 1, entry.span, entry.before, entry.after), problem));
}

const ratio = (tally: Tally) => ({ ...tally, rate: tally.denominator === 0 ? null : tally.numerator / tally.denominator });

/** EVAL-01: classify corrections as caught or missed and findings as matched, excluded or false flags. Pure. */
export function scoreBacktest(items: BacktestItem[], options: { ruleIds?: string[] } = {}): BacktestScore {
  const scored: ScoredItem[] = [];
  const notEvaluable = new Map<string, { drafts: number; reason: string }>();
  for (const item of items) {
    const { correction, run } = item;
    const units = unitsFor(correction, run);
    const findings: ScoredFinding[] = [];
    if (run.status === "evaluated") {
      const ordered = [...run.findings].sort((a, b) => a.start - b.start || a.end - b.end || a.rule_id.localeCompare(b.rule_id) || a.id.localeCompare(b.id));
      for (const finding of ordered) {
        const hit = units.filter((unit) => unit.span && overlaps(finding, unit.span));
        for (const unit of hit.filter((entry) => entry.kind === "in_scope")) unit.caught_by.push({ finding_id: finding.id, rule_id: finding.rule_id });
        const matched = hit.some((unit) => unit.kind === "in_scope");
        // OQ-14 (D-92): typo, out-of-scope and unmatched corrections are reported apart, so a finding on one is not a false flag.
        const excluded = hit.some((unit) => unit.kind === "typo" || unit.kind === "out_of_scope" || unit.kind === "unmatched");
        findings.push({
          id: finding.id, rule_id: finding.rule_id, quoted_span: finding.quoted_span, start: finding.start, end: finding.end,
          class: matched ? "matched" : excluded ? "excluded" : "false_flag", unit_ids: hit.map((unit) => unit.id),
        });
      }
      for (const entry of run.notEvaluable) {
        const seen = notEvaluable.get(entry.ruleId);
        notEvaluable.set(entry.ruleId, { drafts: (seen?.drafts ?? 0) + 1, reason: seen?.reason ?? entry.reason });
      }
    }
    scored.push({
      correction_id: correction.id, line_ids: correction.line_ids, evaluated: run.status === "evaluated",
      reason: run.status === "not_evaluated" ? run.reason : undefined, units, findings,
    });
  }

  const units = scored.flatMap((item) => item.units);
  const findings = scored.flatMap((item) => item.findings);
  const inScope = units.filter((unit) => unit.kind === "in_scope");
  const assessed = findings.filter((finding) => finding.class !== "excluded");
  const evaluated = scored.some((item) => item.evaluated);
  const catchOf = (ruleId?: string): Tally => ({
    numerator: inScope.filter((unit) => unit.caught_by.some((entry) => ruleId === undefined || entry.rule_id === ruleId)).length,
    denominator: inScope.length,
  });
  const falseOf = (ruleId?: string): Tally => {
    const own = assessed.filter((finding) => ruleId === undefined || finding.rule_id === ruleId);
    return { numerator: own.filter((finding) => finding.class === "false_flag").length, denominator: own.length };
  };
  const partial = new Set(notEvaluable.keys());
  const ruleIds = evaluated
    ? [...new Set([...(options.ruleIds ?? []), ...findings.map((finding) => finding.rule_id)])].filter((id) => !partial.has(id)).sort()
    : [];
  return {
    items: scored,
    n_corrections: units.length,
    n_findings: findings.length,
    excluded: {
      typos: units.filter((unit) => unit.kind === "typo").length,
      out_of_scope: units.filter((unit) => unit.kind === "out_of_scope").length,
      unmatched: units.filter((unit) => unit.kind === "unmatched").length,
    },
    catch: catchOf(), false_flag: falseOf(),
    per_rule: ruleIds.map((rule_id) => ({ rule_id, catch: catchOf(rule_id), false_flag: falseOf(rule_id) })),
    rules_not_evaluable: [...notEvaluable].map(([rule_id, entry]) => ({ rule_id, ...entry })).sort((a, b) => a.rule_id.localeCompare(b.rule_id)),
    not_evaluated: scored.filter((item) => !item.evaluated).length,
  };
}

export interface EvalRunMeta {
  id: string; at: string; rulesetVersion: number;
  /** `synthetic_test` unless the corrections are real SikhRI review history. */
  dataLabel: "real_review_history" | "synthetic_test";
}

/** Contract-shaped result. Zero denominators give null rates, never 0%. Rules that could not be evaluated are named in the policy text. */
export function toEvalRun(score: BacktestScore, meta: EvalRunMeta): Extract<EvalRun, { status: "available" }> {
  const notes = [
    meta.dataLabel === "synthetic_test" ? "SYNTHETIC TEST DATA: not measured on real reviewer corrections." : null,
    score.not_evaluated > 0 ? `${score.not_evaluated} correction record(s) could not be run through the engine and are counted as unmatched.` : null,
    score.rules_not_evaluable.length > 0 ? `Not evaluated in this run: ${score.rules_not_evaluable.map((rule) => rule.rule_id).join(", ")}. Their catch and false-flag results are absent, so the overall rates cover only what the engine could evaluate.` : null,
  ].filter((note): note is string => !!note);
  return {
    status: "available", id: meta.id, ruleset_version: meta.rulesetVersion, at: meta.at, data_label: meta.dataLabel,
    policy: { id: POLICY_ID, description: [POLICY_DESCRIPTION, ...notes].join(" ") },
    n_corrections: score.n_corrections, n_findings: score.n_findings, excluded: score.excluded,
    catch_rate: ratio(score.catch), false_flag_rate: ratio(score.false_flag),
    per_rule: score.per_rule.map((rule) => ({ rule_id: rule.rule_id, catch_rate: ratio(rule.catch), false_flag_rate: ratio(rule.false_flag) })),
  };
}
