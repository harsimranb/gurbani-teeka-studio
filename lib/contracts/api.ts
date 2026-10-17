import { z } from "zod";
import {
  CheckResultSchema, CheckRunSchema, DecisionSchema, DraftSchema, DriftResultSchema,
  EvalRunSchema, ExactSpanSchema, FindingSchema, GroupedLineIdsSchema, IdSchema,
  NonblankSchema, ProposalSchema, PublicationSchema, PublishBlockerSchema, PublishGateSchema,
  ReferenceSchema, RuleApprovalSchema, RuleSchema, SabadSchema, VersionSchema,
} from "./domain";

const EmptySchema = z.strictObject({});
const DraftIdSchema = z.strictObject({ draft_id: IdSchema });
const CurrentVersionFields = { draft_id: IdSchema, draft_version: VersionSchema, ruleset_version: VersionSchema };
export const ApiErrorSchema = z.strictObject({ error: z.strictObject({
  code: z.enum(["invalid_request", "not_found", "version_conflict", "publish_blocked", "drift_blocked", "unavailable", "internal_error"]),
  reason: NonblankSchema, blockers: z.array(PublishBlockerSchema).optional(),
}) });
export const ReportSchema = z.strictObject({
  draft: DraftSchema, ruleset_version: VersionSchema, findings: z.array(FindingSchema),
  history: z.array(FindingSchema), decisions: z.array(DecisionSchema), check_runs: z.array(CheckRunSchema),
}).superRefine((report, ctx) => {
  if (report.findings.some((finding) => finding.state !== "current" || finding.draft_id !== report.draft.id || finding.draft_version !== report.draft.version || finding.ruleset_version !== report.ruleset_version || !ExactSpanSchema.safeParse({ text: report.draft.text, quoted_span: finding.quoted_span, start: finding.start, end: finding.end }).success)) ctx.addIssue({ code: "custom", message: "Current findings must match the current draft text and versions", path: ["findings"] });
  if (report.history.some((finding) => finding.state !== "cleared" || finding.draft_id !== report.draft.id)) ctx.addIssue({ code: "custom", message: "History contains only cleared findings for this draft", path: ["history"] });
  if (report.check_runs.some((run) => run.draft_id !== report.draft.id || run.draft_version !== report.draft.version || run.ruleset_version !== report.ruleset_version)) ctx.addIssue({ code: "custom", message: "Current check runs must match current draft/ruleset versions", path: ["check_runs"] });
});
// One phase may refresh sibling authored units affected by a Sabad-scoped rule.
// The service rejects late results if ANY captured authored-unit version changed.
export const CheckResponseSchema = z.strictObject({
  affected_drafts: z.array(DraftSchema).min(1), check_runs: z.array(CheckRunSchema).min(1), result: CheckResultSchema,
}).superRefine((response, ctx) => {
  const ids = response.affected_drafts.map((draft) => draft.id);
  if (new Set(ids).size !== ids.length || response.check_runs.length !== ids.length || new Set(response.check_runs.map((run) => run.draft_id)).size !== ids.length) ctx.addIssue({ code: "custom", message: "Every affected authored unit needs exactly one phase run" });
  const first = response.check_runs[0];
  if (response.check_runs.some((run) => !response.affected_drafts.some((draft) => draft.id === run.draft_id && draft.version === run.draft_version) || run.phase !== first.phase || run.ruleset_version !== first.ruleset_version)) ctx.addIssue({ code: "custom", message: "Affected phase runs must match their current authored units and one ruleset version" });
  for (const finding of response.result.findings) {
    const draft = response.affected_drafts.find((unit) => unit.id === finding.draft_id);
    if (!draft || finding.state !== "current" || finding.draft_version !== draft.version || finding.ruleset_version !== first.ruleset_version || !ExactSpanSchema.safeParse({ text: draft.text, quoted_span: finding.quoted_span, start: finding.start, end: finding.end }).success) ctx.addIssue({ code: "custom", message: "Check findings must match an affected authored unit and current versions", path: ["result", "findings"] });
  }
});
export const SaveDraftRequestSchema = z.strictObject({
  draft_id: IdSchema.nullable(), expected_version: VersionSchema.nullable(), shabad_id: IdSchema,
  line_ids: GroupedLineIdsSchema, text: z.string(), author: NonblankSchema,
}).refine((request) => (request.draft_id === null) === (request.expected_version === null), "Updates require a draft ID and its expected version; new drafts use null for both");
export const CheckRequestSchema = z.strictObject({ ...CurrentVersionFields, changed_line_ids: GroupedLineIdsSchema });
export const SabadResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("available"), sabad: SabadSchema, drafts: z.array(DraftSchema) }),
  z.strictObject({ status: z.literal("unavailable"), reason: NonblankSchema }),
]);
export const RulesResponseSchema = z.strictObject({ ruleset_version: VersionSchema, rules: z.array(RuleSchema) });
export const ProposalResponseSchema = z.strictObject({ proposal: ProposalSchema, drift_results: z.array(DriftResultSchema) });
export const DecisionResponseSchema = z.strictObject({ decision: DecisionSchema, finding: FindingSchema }).superRefine((response, ctx) => {
  const { decision, finding } = response;
  if (decision.finding_id !== finding.id || decision.draft_id !== finding.draft_id || decision.draft_version !== finding.draft_version || decision.ruleset_version !== finding.ruleset_version || (decision.action === "accept" ? finding.state !== "current" : finding.state !== "cleared")) ctx.addIssue({ code: "custom", message: "Decision must bind to its finding version; acceptance stays open, override/waiver clears" });
});
export const PublishResponseSchema = z.strictObject({ draft: DraftSchema, reference: ReferenceSchema, gate: PublishGateSchema }).refine((response) => response.draft.status === "published" && response.reference.source === "published" && response.gate.can_publish && response.gate.draft_id === response.draft.id && response.gate.draft_version === response.draft.version, "Published response needs a published reference and a clear current gate");

// P0 inventory only. No generation, P1 browsing/lookup or backtest execution route.
// listPublications is a read route for published records (reference, approver, time and the gate that allowed it).
export const routes = {
  listSabads: { method: "GET", path: "/api/sabads", request: EmptySchema, response: z.strictObject({ sabads: z.array(z.strictObject({ shabad_id: IdSchema, ang: z.number().int().min(1).max(1430), raag: NonblankSchema, writer: NonblankSchema })) }) },
  getSabad: { method: "GET", path: "/api/sabads/:shabad_id", request: z.strictObject({ shabad_id: IdSchema }), response: SabadResponseSchema },
  saveDraft: { method: "POST", path: "/api/drafts", request: SaveDraftRequestSchema, response: z.strictObject({ draft: DraftSchema }) },
  getReport: { method: "GET", path: "/api/drafts/:draft_id/report", request: DraftIdSchema, response: ReportSchema },
  runCodeChecks: { method: "POST", path: "/api/check", request: CheckRequestSchema, response: CheckResponseSchema },
  runLlmChecks: { method: "POST", path: "/api/check/llm", request: CheckRequestSchema, response: CheckResponseSchema },
  markReady: { method: "POST", path: "/api/drafts/:draft_id/ready", request: z.strictObject({ draft_id: IdSchema, draft_version: VersionSchema, actor: NonblankSchema }), response: z.strictObject({ draft: DraftSchema }) },
  reviewQueue: { method: "GET", path: "/api/review", request: EmptySchema, response: z.strictObject({ drafts: z.array(DraftSchema) }) },
  decide: { method: "POST", path: "/api/findings/:finding_id/decisions", request: z.strictObject({ ...CurrentVersionFields, finding_id: IdSchema, action: z.enum(["accept", "override", "waive"]), reason: NonblankSchema, reviewer: NonblankSchema }), response: DecisionResponseSchema },
  getPublishGate: { method: "GET", path: "/api/drafts/:draft_id/publish-gate", request: DraftIdSchema, response: PublishGateSchema },
  publish: { method: "POST", path: "/api/drafts/:draft_id/publish", request: z.strictObject({ ...CurrentVersionFields, actor: NonblankSchema, departure_reasons: z.array(z.strictObject({ finding_id: IdSchema, reason: NonblankSchema })) }), response: PublishResponseSchema },
  listPublications: { method: "GET", path: "/api/sabads/:shabad_id/publications", request: z.strictObject({ shabad_id: IdSchema }), response: z.strictObject({ publications: z.array(PublicationSchema) }) },
  getReference: { method: "GET", path: "/api/references/:reference_id", request: z.strictObject({ reference_id: IdSchema }), response: z.strictObject({ reference: ReferenceSchema }) },
  listRules: { method: "GET", path: "/api/rules", request: EmptySchema, response: RulesResponseSchema },
  listProposals: { method: "GET", path: "/api/proposals", request: EmptySchema, response: z.strictObject({ proposals: z.array(ProposalSchema) }) },
  getProposal: { method: "GET", path: "/api/proposals/:proposal_id", request: z.strictObject({ proposal_id: IdSchema }), response: ProposalResponseSchema },
  submitProposal: { method: "POST", path: "/api/proposals", request: z.strictObject({ rule_text: NonblankSchema, example: NonblankSchema, reason: NonblankSchema, author: NonblankSchema }), response: ProposalResponseSchema },
  approveProposal: { method: "POST", path: "/api/proposals/:proposal_id/approve", request: z.strictObject({ proposal_id: IdSchema, ruleset_version: VersionSchema, actor: NonblankSchema, reason: NonblankSchema, drift_override_reason: NonblankSchema.nullable() }), response: z.strictObject({ rule: RuleSchema, approval: RuleApprovalSchema, ruleset_version: VersionSchema }) },
  getEval: { method: "GET", path: "/api/eval", request: EmptySchema, response: EvalRunSchema },
} as const;
export type RouteName = keyof typeof routes;
export type ApiRequest<Name extends RouteName> = z.input<(typeof routes)[Name]["request"]>;
export type ApiResponse<Name extends RouteName> = z.output<(typeof routes)[Name]["response"]>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
