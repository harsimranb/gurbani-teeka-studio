import { describe, expect, it } from "vitest";
import seed from "../../_docs/rules/rules.resolved.json";
import {
  AuthoredUnitSnapshotSchema, CheckRunSchema, DecisionSchema, DraftSchema, DriftAssessmentSchema,
  EvalRunSchema, ExactSpanSchema, FindingBatchSchema, FindingSchema,
  PublishGateSchema, ReferenceSchema, RuleSchema, rulesetLabel,
} from "./domain";

const at = "2026-10-16T12:00:00.000Z";
const draft = { id: "synthetic-draft", shabad_id: "synthetic-sabad", line_ids: ["line-1", "line-2"], layer: "transcreation", text: "SYNTHETIC TEST: [sample]", author: "Test author", status: "draft", version: 1, updated_at: at };
const finding = { id: "synthetic-finding", draft_id: draft.id, draft_version: 1, ruleset_version: 1, rule_id: "LAYER-07", rule_version: 1, layer: "L1", severity: "error", quoted_span: "[", start: 16, end: 17, explanation: "Synthetic test bracket evidence.", reference_ids: [], model: "fixture-stub", prompt_version: "fixture-v1", state: "current", cleared_at: null };
const run = { id: "synthetic-run", draft_id: draft.id, draft_version: 1, ruleset_version: 1, phase: "code", status: "pending", started_at: at, completed_at: null, error: null, cached: false, not_evaluable: [] };

describe("shared review contracts", () => {
  it("provides every authored unit for Sabad-wide checks and rejects stale/overlapping groups", () => {
    const sibling = { ...draft, id: "sibling", line_ids: ["line-3"] };
    expect(AuthoredUnitSnapshotSchema.safeParse({ draft, sabadDrafts: [draft, sibling] }).success).toBe(true);
    expect(AuthoredUnitSnapshotSchema.safeParse({ draft, sabadDrafts: [sibling] }).success).toBe(false);
    expect(AuthoredUnitSnapshotSchema.safeParse({ draft, sabadDrafts: [{ ...draft, version: 2 }] }).success).toBe(false);
    expect(AuthoredUnitSnapshotSchema.safeParse({ draft, sabadDrafts: [{ ...draft, text: "stale synthetic draft" }] }).success).toBe(false);
    expect(AuthoredUnitSnapshotSchema.safeParse({ draft, sabadDrafts: [draft, { ...sibling, line_ids: ["line-2"] }] }).success).toBe(false);
    expect(AuthoredUnitSnapshotSchema.safeParse({ draft, sabadDrafts: [draft, { ...sibling, shabad_id: "other" }] }).success).toBe(false);
  });
  it("preserves every grouped source ID and rejects empty/duplicate groups", () => {
    expect(DraftSchema.parse(draft).line_ids).toEqual(["line-1", "line-2"]);
    expect(DraftSchema.safeParse({ ...draft, line_ids: [] }).success).toBe(false);
    expect(DraftSchema.safeParse({ ...draft, line_ids: ["line-1", "line-1"] }).success).toBe(false);
    expect(DraftSchema.safeParse({ ...draft, version: 0 }).success).toBe(false);
  });
  it("uses exact end-exclusive UTF-16 offsets, including astral characters", () => {
    const span = { text: "TEST 😀 [x]", quoted_span: "[", start: 8, end: 9 };
    expect(ExactSpanSchema.safeParse(span).success).toBe(true);
    expect(ExactSpanSchema.safeParse({ ...span, start: 7, end: 8 }).success).toBe(false);
    expect(ExactSpanSchema.safeParse({ ...span, end: 10 }).success).toBe(false);
    expect(ExactSpanSchema.safeParse({ ...span, start: -1 }).success).toBe(false);
  });
  it("admits empty evaluated batches and explicit uncheckable packets", () => {
    expect(FindingBatchSchema.parse({ status: "evaluated", findings: [] }).findings).toEqual([]);
    expect(FindingBatchSchema.safeParse({ status: "not_evaluable", findings: [], reason: "No evidence available." }).success).toBe(true);
    expect(FindingBatchSchema.safeParse({ status: "not_evaluable", findings: [finding], reason: "No evidence." }).success).toBe(false);
    expect(FindingBatchSchema.safeParse({ status: "not_evaluable", findings: [], reason: " " }).success).toBe(false);
  });
  it("rejects rewrite fields at the batch and individual finding boundary", () => {
    expect(FindingBatchSchema.safeParse({ status: "evaluated", findings: [], suggested_translation: "generated" }).success).toBe(false);
    expect(FindingBatchSchema.safeParse({ status: "evaluated", findings: [{ ...finding, replacement: "generated" }] }).success).toBe(false);
  });
  it("requires reference evidence for deterministic CONS-01 as well as style findings", () => {
    expect(FindingSchema.safeParse({ ...finding, rule_id: "CONS-01", severity: "warning" }).success).toBe(false);
    expect(FindingSchema.safeParse({ ...finding, rule_id: "CONS-01", severity: "warning", reference_ids: ["reference-1"] }).success).toBe(true);
  });
  it("requires provenance and distinguishes current findings from cleared history", () => {
    expect(FindingSchema.safeParse(finding).success).toBe(true);
    expect(FindingSchema.safeParse({ ...finding, state: "cleared", cleared_at: at }).success).toBe(true);
    expect(FindingSchema.safeParse({ ...finding, state: "cleared" }).success).toBe(false);
    expect(FindingSchema.safeParse({ ...finding, model: "" }).success).toBe(false);
    expect(FindingSchema.safeParse({ ...finding, end: 18 }).success).toBe(false);
  });
  it("requires a written reason, entered name and versions for every human decision", () => {
    const decision = { id: "decision-1", finding_id: finding.id, draft_id: draft.id, draft_version: 1, ruleset_version: 1, action: "accept", reason: "Review evidence accepted.", reviewer: "Test reviewer", at };
    expect(DecisionSchema.safeParse(decision).success).toBe(true);
    for (const action of ["accept", "override", "waive"]) {
      expect(DecisionSchema.safeParse({ ...decision, action, reason: " \t" }).success).toBe(false);
    }
    expect(DecisionSchema.safeParse({ ...decision, reviewer: " " }).success).toBe(false);
    expect(DecisionSchema.safeParse({ ...decision, draft_version: 0 }).success).toBe(false);
  });
  it("models pending, succeeded and failed phases without ambiguous completion", () => {
    expect(CheckRunSchema.safeParse(run).success).toBe(true);
    expect(CheckRunSchema.safeParse({ ...run, status: "succeeded", completed_at: at }).success).toBe(true);
    expect(CheckRunSchema.safeParse({ ...run, status: "failed", completed_at: at, error: "Provider unavailable." }).success).toBe(true);
    expect(CheckRunSchema.safeParse({ ...run, status: "failed", completed_at: at }).success).toBe(false);
    expect(CheckRunSchema.safeParse({ ...run, status: "succeeded" }).success).toBe(false);
    expect(CheckRunSchema.safeParse({ ...run, completed_at: at }).success).toBe(false);
  });
  it("preserves labelled sources and structured published exceptions", () => {
    const reference = { id: "synthetic-reference", line_ids: ["line-1", "line-2"], english: "SYNTHETIC TEST DATA ONLY", source: "published", exceptions: [{ rule_id: "CONS-01", decision_id: "decision-1", action: "override", reason: "Synthetic context reason.", reviewer: "Test reviewer", at }] };
    expect(ReferenceSchema.parse(reference).exceptions[0].reason).toBe("Synthetic context reason.");
    expect(ReferenceSchema.safeParse({ ...reference, source: "sikhri_sample" }).success).toBe(true);
    expect(ReferenceSchema.safeParse({ ...reference, exceptions: [{ ...reference.exceptions[0], reason: " " }] }).success).toBe(false);
  });
  it("keeps all verbatim seeded catalog rules, including lenses and non-check scopes", () => {
    const rules = seed.rules.map((rule) => RuleSchema.parse({ id: rule.id, text: rule.text, level: rule.level, layers: rule.resolution.layers, plan: rule.check_type, severity: rule.resolution.severity, decision: rule.resolution.decision, version: 1, status: "approved", source: "sikhri_seed", source_tag: rule.source_tag, prefilter: rule.prefilter, resolution: rule.resolution, provenance: null }));
    expect(rules).toHaveLength(66);
    expect(rules.map((rule) => rule.text)).toEqual(seed.rules.map((rule) => rule.text));
    expect(rules.filter((rule) => rule.resolution.active)).toHaveLength(66);
    expect(rules.filter((rule) => rule.resolution.publish_requires_reason).map((rule) => rule.id)).toEqual(["CONS-01"]);
    expect(rulesetLabel(1)).toBe("v1");
  });
  it("requires drift reasons, unavailable evidence and source-labelled replay counts", () => {
    const assessment = { status: "evaluated", check: "reference_replay", outcome: "block", reason: "Synthetic replay flags one reference.", evidence: { rule_ids: [], reference_ids: ["synthetic-reference"], affected_line_ids: ["line-1"], affected_count: 1, source_counts: { sikhri_sample: 0, published: 1 } } };
    expect(DriftAssessmentSchema.safeParse(assessment).success).toBe(true);
    expect(DriftAssessmentSchema.safeParse({ ...assessment, evidence: { ...assessment.evidence, affected_line_ids: ["604"], source_counts: { sikhri_sample: 1, published: 1 } } }).success).toBe(true);
    expect(DriftAssessmentSchema.safeParse({ status: "not_evaluable", check: "glossary_collision", reason: "Glossary authority unavailable." }).success).toBe(true);
    expect(DriftAssessmentSchema.safeParse({ ...assessment, suggested_translation: "generated" }).success).toBe(false);
    expect(DriftAssessmentSchema.safeParse({ ...assessment, evidence: { ...assessment.evidence, affected_count: 2 } }).success).toBe(false);
    expect(DriftAssessmentSchema.safeParse({ status: "not_evaluable", check: "glossary_collision", reason: " " }).success).toBe(false);
  });
  it("exposes concrete publish blockers separately from nonblocking warnings", () => {
    const blocker = { kind: "check_phase", draft_id: draft.id, phase: "llm", status: "missing" };
    expect(PublishGateSchema.safeParse({ draft_id: draft.id, draft_version: 1, ruleset_version: 1, can_publish: false, blockers: [blocker], warning_ids: [] }).success).toBe(true);
    expect(PublishGateSchema.safeParse({ draft_id: draft.id, draft_version: 1, ruleset_version: 1, can_publish: true, blockers: [blocker], warning_ids: [] }).success).toBe(false);
  });
  it("does not invent eval rates before real data or label policy exist", () => {
    expect(EvalRunSchema.safeParse({ status: "unavailable", ruleset_version: 1, reason: "No real pre-edit corrections; OQ-14 pending." }).success).toBe(true);
    expect(EvalRunSchema.safeParse({ status: "unavailable", ruleset_version: 1, reason: "No data.", catch_rate: 1 }).success).toBe(false);
    const metric = { numerator: 1, denominator: 2, rate: 0.5 };
    const available = { status: "available", id: "synthetic-eval", ruleset_version: 1, at, data_label: "synthetic_test", policy: { id: "synthetic-policy", description: "Synthetic test only; OQ-14 remains unresolved." }, n_corrections: 2, n_findings: 2, excluded: { typos: 0, out_of_scope: 0, unmatched: 0 }, catch_rate: metric, false_flag_rate: metric, per_rule: [] };
    expect(EvalRunSchema.safeParse(available).success).toBe(true);
    expect(EvalRunSchema.safeParse({ ...available, catch_rate: { numerator: 3, denominator: 2, rate: 1.5 } }).success).toBe(false);
    expect(EvalRunSchema.safeParse({ ...available, catch_rate: { numerator: 0, denominator: 0, rate: null }, n_corrections: 0 }).success).toBe(true);
  });
});
