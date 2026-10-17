import { z } from "zod";

export const NonblankSchema = z.string().refine((value) => value.trim().length > 0, "Must not be blank");
export const containsGurmukhi = (text: string): boolean => [...text].some((character) => {
  const point = character.codePointAt(0) ?? 0;
  return point >= 0x0a00 && point <= 0x0a7f;
});
/** True for BaniDB numeral tokens with optional surrounding punctuation or symbols. */
export function isGurmukhiNumericToken(text: string): boolean {
  const characters = Array.from(text);
  const isDigit = (character: string) => {
    const point = character.codePointAt(0)!;
    return point >= 0x0a66 && point <= 0x0a6f;
  };
  return characters.some(isDigit) && characters.every((character) => isDigit(character) || /[\p{P}\p{S}]/u.test(character));
}
export const EditableEnglishSchema = z.string().refine((text) => !containsGurmukhi(text), "Gurmukhi is read-only and comes from BaniDB");
export const IdSchema = NonblankSchema;
export const VersionSchema = z.number().int().positive();
export const TimestampSchema = z.iso.datetime({ offset: true });
const IdsSchema = z.array(IdSchema).refine((ids) => new Set(ids).size === ids.length, "IDs must be unique");
export const GroupedLineIdsSchema = IdsSchema.refine((ids) => ids.length > 0, "At least one source line is required");
export const CheckPhaseSchema = z.enum(["code", "llm"]);
export const FindingSeveritySchema = z.enum(["error", "flag", "warning", "hint"]);
export const RuleSeveritySchema = z.enum(["error", "flag", "warning", "hint", "lens", "none"]);
export const SourceLayerSchema = z.enum(["literal", "transcreation", "annotation", "transcription", "publication", "process"]);
export const AuthoredLayerSchema = z.enum(["literal", "transcreation", "annotation", "transcription", "publication"]);
export const ReferenceSourceSchema = z.enum(["sikhri_sample", "published"]);

export const LineSchema = z.strictObject({
  line_id: IdSchema, shabad_id: IdSchema, ang: z.number().int().min(1).max(1430),
  raag: NonblankSchema, writer: NonblankSchema, is_rahao: z.boolean(),
  // Source only: callers export BaniDB text; validation never normalizes or rewrites it.
  gurmukhi: NonblankSchema.refine((text) => text.normalize("NFC") === text, "BaniDB text must already be NFC"),
});
export const SabadSchema = z.strictObject({ shabad_id: IdSchema, lines: z.array(LineSchema).min(1) }).superRefine((sabad, ctx) => {
  if (sabad.lines.some((line) => line.shabad_id !== sabad.shabad_id)) ctx.addIssue({ code: "custom", message: "Line belongs to a different Sabad", path: ["lines"] });
  if (new Set(sabad.lines.map((line) => line.line_id)).size !== sabad.lines.length) ctx.addIssue({ code: "custom", message: "Duplicate source line IDs", path: ["lines"] });
});
export const WordSchema = z.strictObject({ line_id: IdSchema, index: z.number().int().nonnegative(), surface: NonblankSchema, stem_key: NonblankSchema, ending_matra: z.string() });
export const DraftSchema = z.strictObject({
  id: IdSchema, shabad_id: IdSchema, line_ids: GroupedLineIdsSchema, layer: AuthoredLayerSchema,
  source_word_start: z.number().int().nonnegative().nullable().optional(),
  text: EditableEnglishSchema, author: NonblankSchema, status: z.enum(["draft", "ready_for_review", "changes_requested", "published"]),
  version: VersionSchema, updated_at: TimestampSchema,
});
// The complete current authored-unit snapshot permits first-use/collapse checks without app I/O.
export const AuthoredUnitSnapshotSchema = z.strictObject({ draft: DraftSchema, sabadDrafts: z.array(DraftSchema).min(1) }).superRefine((input, ctx) => {
  const selected = input.sabadDrafts.find((unit) => unit.id === input.draft.id);
  if (!selected || JSON.stringify(selected) !== JSON.stringify(input.draft)) ctx.addIssue({ code: "custom", message: "Selected draft must match its current snapshot entry", path: ["draft"] });
  if (input.sabadDrafts.some((unit) => unit.shabad_id !== input.draft.shabad_id)) ctx.addIssue({ code: "custom", message: "Every authored unit must belong to the same Sabad", path: ["sabadDrafts"] });
  if (input.sabadDrafts.some((unit) => unit.layer !== input.draft.layer)) ctx.addIssue({ code: "custom", message: "A check snapshot must contain one authored layer", path: ["sabadDrafts"] });
  const ids = input.sabadDrafts.map((unit) => unit.id);
  const coordinates = input.sabadDrafts.flatMap((unit) => unit.line_ids.map((lineId) => `${lineId}:${unit.source_word_start ?? "line"}`));
  if (new Set(ids).size !== ids.length || new Set(coordinates).size !== coordinates.length) ctx.addIssue({ code: "custom", message: "Authored units must have unique IDs and disjoint source groups or word positions", path: ["sabadDrafts"] });
});
export const ProvenanceSchema = z.strictObject({ actor: NonblankSchema, reason: NonblankSchema, at: TimestampSchema });
export const RuleResolutionSchema = z.strictObject({
  active: z.boolean(), scope: z.enum(["p0_check", "p0_by_design", "p0_suppressor", "p0_process", "p1_check", "review_lens", "out_of_scope", "merged", "removed"]),
  severity: RuleSeveritySchema, blocks_publish: z.boolean(), publish_requires_reason: z.boolean().optional(),
  layers: z.array(SourceLayerSchema), conditional: NonblankSchema.nullable(), decision: NonblankSchema.nullable(),
  mode: z.enum(["code", "model", "hybrid", "workflow", "suppressor", "existing"]).nullable().optional(),
  implemented_layers: z.array(SourceLayerSchema).optional(),
});
export const RuleSchema = z.strictObject({
  id: IdSchema, text: NonblankSchema, level: z.enum(["MUST", "SHOULD", "GUIDE"]),
  layers: z.array(SourceLayerSchema), plan: NonblankSchema, severity: RuleSeveritySchema, decision: NonblankSchema.nullable(),
  version: VersionSchema, status: z.enum(["approved", "retired"]), source: z.enum(["sikhri_seed", "proposal"]),
  source_tag: NonblankSchema,
  prefilter: z.strictObject({ proposal: z.boolean(), patterns: z.array(z.strictObject({ pattern: z.string(), flags: z.string(), action: NonblankSchema })), keywords: z.array(z.string()), notes: z.string() }).nullable().optional(),
  resolution: RuleResolutionSchema, provenance: ProvenanceSchema.nullable(),
}).superRefine((rule, ctx) => {
  if (rule.source === "proposal" && !rule.provenance) ctx.addIssue({ code: "custom", message: "Approved additions require human provenance", path: ["provenance"] });
  if (rule.severity !== rule.resolution.severity || rule.decision !== rule.resolution.decision || JSON.stringify(rule.layers) !== JSON.stringify(rule.resolution.layers)) ctx.addIssue({ code: "custom", message: "Catalog fields must agree with the verbatim resolution", path: ["resolution"] });
});
export function rulesetLabel(version: number): string { return `v${VersionSchema.parse(version)}`; }

const SpanFields = { quoted_span: NonblankSchema, start: z.number().int().nonnegative(), end: z.number().int().positive() };
// JavaScript string positions are UTF-16 code units. The end is exclusive.
export const ExactSpanSchema = z.strictObject({ text: z.string(), ...SpanFields }).refine((span) => span.start < span.end && span.text.slice(span.start, span.end) === span.quoted_span, "Quoted span must equal text.slice(start, end)");
export const FindingSchema = z.strictObject({
  id: IdSchema, draft_id: IdSchema, draft_version: VersionSchema, ruleset_version: VersionSchema,
  rule_id: IdSchema, rule_version: VersionSchema, layer: z.enum(["L1", "L2", "style"]), severity: FindingSeveritySchema,
  ...SpanFields, explanation: NonblankSchema, reference_ids: IdsSchema,
  model: NonblankSchema, prompt_version: NonblankSchema, state: z.enum(["current", "cleared"]), cleared_at: TimestampSchema.nullable(),
}).superRefine((finding, ctx) => {
  if (finding.end - finding.start !== finding.quoted_span.length) ctx.addIssue({ code: "custom", message: "Span length must use UTF-16 code units", path: ["end"] });
  if ((finding.state === "cleared") !== (finding.cleared_at !== null)) ctx.addIssue({ code: "custom", message: "Cleared history requires its clearing time", path: ["cleared_at"] });
  if ((finding.layer === "style" || finding.rule_id === "CONS-01") && finding.reference_ids.length === 0) ctx.addIssue({ code: "custom", message: "Style and consistency findings require reference evidence", path: ["reference_ids"] });
});
export const FindingBatchSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("evaluated"), findings: z.array(FindingSchema) }),
  z.strictObject({ status: z.literal("not_evaluable"), findings: z.array(FindingSchema).max(0), reason: NonblankSchema }),
]);
export const NotEvaluableSchema = z.strictObject({ ruleId: IdSchema, reason: NonblankSchema });
export const CheckResultSchema = z.strictObject({ findings: z.array(FindingSchema), notEvaluable: z.array(NotEvaluableSchema) });
export const CheckRunSchema = z.strictObject({
  id: IdSchema, draft_id: IdSchema, draft_version: VersionSchema, ruleset_version: VersionSchema,
  phase: CheckPhaseSchema, status: z.enum(["pending", "succeeded", "failed"]), started_at: TimestampSchema,
  completed_at: TimestampSchema.nullable(), error: NonblankSchema.nullable(), cached: z.boolean(), not_evaluable: z.array(NotEvaluableSchema),
}).superRefine((run, ctx) => {
  if ((run.status === "pending") !== (run.completed_at === null)) ctx.addIssue({ code: "custom", message: "Only pending runs lack a completion time", path: ["completed_at"] });
  if ((run.status === "failed") !== (run.error !== null)) ctx.addIssue({ code: "custom", message: "Only failed runs carry an error", path: ["error"] });
});
export const DecisionSchema = z.strictObject({
  id: IdSchema, finding_id: IdSchema, draft_id: IdSchema, draft_version: VersionSchema, ruleset_version: VersionSchema,
  action: z.enum(["accept", "override", "waive"]), reason: NonblankSchema, reviewer: NonblankSchema, at: TimestampSchema,
});
export const ReferenceExceptionSchema = z.strictObject({
  rule_id: IdSchema, decision_id: IdSchema, action: z.enum(["override", "waive", "context_reason"]),
  reason: NonblankSchema, reviewer: NonblankSchema, at: TimestampSchema,
});
export const ReferenceSchema = z.strictObject({
  id: IdSchema, line_ids: GroupedLineIdsSchema, english: NonblankSchema, source: ReferenceSourceSchema,
  exceptions: z.array(ReferenceExceptionSchema),
  // Absence means no explicit term alignment: line-level English alone cannot support CHK-12.
  term_mappings: z.array(z.strictObject({ line_id: IdSchema, stem_key: NonblankSchema, rendering: NonblankSchema })).optional(),
});
export const CheckInputSchema = z.strictObject({
  sabad: SabadSchema, draft: DraftSchema, sabadDrafts: z.array(DraftSchema).min(1), changedLineIds: IdsSchema, rules: z.array(RuleSchema), rulesetVersion: VersionSchema, references: z.array(ReferenceSchema),
  relatedDrafts: z.array(DraftSchema).optional(),
}).superRefine((input, ctx) => {
  const snapshot = AuthoredUnitSnapshotSchema.safeParse({ draft: input.draft, sabadDrafts: input.sabadDrafts });
  if (!snapshot.success) for (const issue of snapshot.error.issues) ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
  const ids = new Set(input.sabad.lines.map((line) => line.line_id));
  if (input.draft.shabad_id !== input.sabad.shabad_id || [...input.sabadDrafts.flatMap((unit) => unit.line_ids), ...input.changedLineIds].some((id) => !ids.has(id))) ctx.addIssue({ code: "custom", message: "Draft and changed source IDs must belong to the input Sabad" });
  if (input.relatedDrafts?.some((unit) => unit.shabad_id !== input.sabad.shabad_id || unit.line_ids.some((id) => !ids.has(id)))) ctx.addIssue({ code: "custom", message: "Related authored evidence must belong to the input Sabad", path: ["relatedDrafts"] });
  const partialGroup = input.sabadDrafts.some((unit) => { const changed = unit.line_ids.filter((id) => input.changedLineIds.includes(id)); return changed.length > 0 && changed.length !== unit.line_ids.length; });
  if (partialGroup) ctx.addIssue({ code: "custom", message: "Changed authored groups must include every covered source line ID", path: ["changedLineIds"] });
  if (new Set(input.rules.map((rule) => rule.id)).size !== input.rules.length || new Set(input.references.map((reference) => reference.id)).size !== input.references.length) ctx.addIssue({ code: "custom", message: "Snapshot IDs must be unique" });
});
export type FindingEvidenceContext = Pick<CheckInput, "draft" | "sabadDrafts" | "rules" | "rulesetVersion" | "references">;
export function findingMatchesInput(finding: Finding, input: FindingEvidenceContext): boolean {
  const draft = input.sabadDrafts.find((unit) => unit.id === finding.draft_id);
  return !!draft && finding.state === "current" && finding.draft_version === draft.version
    && finding.ruleset_version === input.rulesetVersion && input.rules.some((rule) => rule.id === finding.rule_id && rule.version === finding.rule_version)
    && finding.reference_ids.every((id) => input.references.some((reference) => reference.id === id))
    && ExactSpanSchema.safeParse({ text: draft.text, quoted_span: finding.quoted_span, start: finding.start, end: finding.end }).success;
}

export const ProposalSchema = z.strictObject({
  id: IdSchema, source: z.enum(["free_text", "overrides"]), rule_text: NonblankSchema, example: NonblankSchema,
  reason: NonblankSchema, evidence_ids: IdsSchema, author: NonblankSchema, at: TimestampSchema,
  status: z.enum(["pending", "approved", "rejected"]),
});
export const DriftCheckSchema = z.enum(["contradiction", "reference_replay", "glossary_collision", "duplicate", "scope_change"]);
// Per-source counts count unique affected BaniDB lines within each source; sources may overlap.
// affected_count counts the union, so one line cited from both sources still counts once.
export const DriftEvidenceSchema = z.strictObject({
  rule_ids: IdsSchema, reference_ids: IdsSchema, affected_line_ids: IdsSchema,
  affected_count: z.number().int().nonnegative(),
  source_counts: z.strictObject({ sikhri_sample: z.number().int().nonnegative(), published: z.number().int().nonnegative() }),
}).refine((evidence) => evidence.affected_count === evidence.affected_line_ids.length && Math.max(evidence.source_counts.sikhri_sample, evidence.source_counts.published) <= evidence.affected_count && evidence.affected_count <= evidence.source_counts.sikhri_sample + evidence.source_counts.published, "Replay union count must agree with unique line IDs and possibly overlapping per-source counts");
export const DriftAssessmentSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("evaluated"), check: DriftCheckSchema, outcome: z.enum(["pass", "warn", "block"]), reason: NonblankSchema, evidence: DriftEvidenceSchema }),
  z.strictObject({ status: z.literal("not_evaluable"), check: DriftCheckSchema, reason: NonblankSchema }),
]);
export const DriftResultSchema = z.strictObject({ id: IdSchema, proposal_id: IdSchema, assessment: DriftAssessmentSchema, override: ProvenanceSchema.nullable() });
export const DriftContextSchema = z.strictObject({ rules: z.array(RuleSchema), rulesetVersion: VersionSchema, references: z.array(ReferenceSchema), glossary: z.array(z.strictObject({ term: NonblankSchema, preferred_rendering: NonblankSchema, source_id: IdSchema })).nullable() });
export const RuleApprovalSchema = z.strictObject({ proposal_id: IdSchema, ruleset_version: VersionSchema, provenance: ProvenanceSchema, drift_override: ProvenanceSchema.nullable() });

export const PublishBlockerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("finding"), finding_id: IdSchema, rule_id: IdSchema, severity: z.enum(["error", "flag"]) }),
  z.strictObject({ kind: z.literal("check_phase"), draft_id: IdSchema, phase: CheckPhaseSchema, status: z.enum(["missing", "pending", "failed"]) }),
  z.strictObject({ kind: z.literal("departure_reason"), finding_id: IdSchema, rule_id: z.literal("CONS-01") }),
  z.strictObject({ kind: z.literal("layer_unavailable"), draft_id: IdSchema, layer: AuthoredLayerSchema }),
  z.strictObject({ kind: z.literal("workflow"), draft_id: IdSchema, rule_id: z.literal("FLOW-01") }),
]);
export const PublishGateSchema = z.strictObject({ draft_id: IdSchema, draft_version: VersionSchema, ruleset_version: VersionSchema, can_publish: z.boolean(), blockers: z.array(PublishBlockerSchema), warning_ids: IdsSchema }).refine((gate) => gate.can_publish === (gate.blockers.length === 0), "Publish permission must agree with its blockers");

// A published record: who approved which draft, when, and the gate that allowed it.
export const PublicationSchema = z.strictObject({ reference: ReferenceSchema, draft_id: IdSchema, approver: NonblankSchema, at: TimestampSchema, gate: PublishGateSchema });

export const ReviewCorrectionSchema = z.strictObject({
  id: IdSchema, line_ids: GroupedLineIdsSchema, pre_edit: z.string(), post_edit: z.string(), reviewer: NonblankSchema,
  source_id: IdSchema, label: z.enum(["unclassified", "in_scope", "typo", "out_of_scope", "unmatched"]),
  // These are evidence positions; EVAL-01 decides their alignment policy after OQ-14.
  changed_spans: z.array(z.strictObject({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }).refine((span) => span.end >= span.start)),
});
export const EvalMetricSchema = z.strictObject({ numerator: z.number().int().nonnegative(), denominator: z.number().int().nonnegative(), rate: z.number().min(0).max(1).nullable() }).refine((metric) => metric.numerator <= metric.denominator && (metric.denominator === 0 ? metric.rate === null : metric.rate !== null && Math.abs(metric.rate - metric.numerator / metric.denominator) < 1e-12), "Rate must report its actual numerator/denominator, or null for zero denominator");
export const EvalRunSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("unavailable"), ruleset_version: VersionSchema, reason: NonblankSchema }),
  z.strictObject({
    status: z.literal("available"), id: IdSchema, ruleset_version: VersionSchema, at: TimestampSchema,
    data_label: z.enum(["real_review_history", "synthetic_test"]),
    policy: z.strictObject({ id: IdSchema, description: NonblankSchema }),
    n_corrections: z.number().int().nonnegative(), n_findings: z.number().int().nonnegative(),
    excluded: z.strictObject({ typos: z.number().int().nonnegative(), out_of_scope: z.number().int().nonnegative(), unmatched: z.number().int().nonnegative() }),
    catch_rate: EvalMetricSchema, false_flag_rate: EvalMetricSchema,
    per_rule: z.array(z.strictObject({ rule_id: IdSchema, catch_rate: EvalMetricSchema, false_flag_rate: EvalMetricSchema })),
  }),
]);

export type Line = z.infer<typeof LineSchema>;
export type Sabad = z.infer<typeof SabadSchema>;
export type Word = z.infer<typeof WordSchema>;
export type Draft = z.infer<typeof DraftSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type FindingBatch = z.infer<typeof FindingBatchSchema>;
export type NotEvaluable = z.infer<typeof NotEvaluableSchema>;
export type CheckInput = z.infer<typeof CheckInputSchema>;
export type CheckResult = z.infer<typeof CheckResultSchema>;
export type CheckRun = z.infer<typeof CheckRunSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type Reference = z.infer<typeof ReferenceSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
export type DriftAssessment = z.infer<typeof DriftAssessmentSchema>;
export type DriftResult = z.infer<typeof DriftResultSchema>;
export type DriftContext = z.infer<typeof DriftContextSchema>;
export type RuleApproval = z.infer<typeof RuleApprovalSchema>;
export type PublishGate = z.infer<typeof PublishGateSchema>;
export type Publication = z.infer<typeof PublicationSchema>;
export type ReviewCorrection = z.infer<typeof ReviewCorrectionSchema>;
export type EvalRun = z.infer<typeof EvalRunSchema>;
