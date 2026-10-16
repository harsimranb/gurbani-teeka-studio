import seed from "../../../_docs/rules/rules.resolved.json";
import draftData from "./draft.json";
import checkData from "./check-result.json";
import evalData from "./eval-run.json";
import { CheckResultSchema, DraftSchema, DriftResultSchema, EvalRunSchema, ProposalSchema, RuleSchema } from "../domain";
import type { RouteName } from "../api";

// Synthetic English test markers only. Source text lives solely in ignored sabad.demo.json.
export const draftFixture = DraftSchema.parse(draftData);
export const checkResultFixture = CheckResultSchema.parse(checkData);
export const evalFixture = EvalRunSchema.parse(evalData);
// Read the authoritative resolved seed in place; never copy or reword SikhRI rule text.
export const rulesFixture = seed.rules.map((rule) => RuleSchema.parse({
  id: rule.id, text: rule.text, level: rule.level, layers: rule.resolution.layers, plan: rule.check_type,
  severity: rule.resolution.severity, decision: rule.resolution.decision, version: 1, status: "approved",
  source: "sikhri_seed", source_tag: rule.source_tag, prefilter: rule.prefilter, resolution: rule.resolution, provenance: null,
}));
export const proposalFixture = ProposalSchema.parse({
  id: "synthetic-proposal-1", source: "free_text", rule_text: "SYNTHETIC TEST RULE: detect the marker TEST.",
  example: "SYNTHETIC TEST DATA ONLY", reason: "Exercise proposal contracts with labelled test data.",
  evidence_ids: [], author: "Synthetic test author", at: draftFixture.updated_at, status: "pending",
});
export const driftFixtures = (["contradiction", "reference_replay", "glossary_collision"] as const).map((check) => DriftResultSchema.parse({
  id: `synthetic-drift-${check}`, proposal_id: proposalFixture.id,
  assessment: { status: "not_evaluable", check, reason: "Synthetic fixture stub only; no real drift check was performed." }, override: null,
}));
const finding = checkResultFixture.findings[0];
const gate = { draft_id: draftFixture.id, draft_version: 1, ruleset_version: 1, can_publish: false,
  blockers: [{ kind: "finding", finding_id: finding.id, rule_id: finding.rule_id, severity: "error" }, { kind: "check_phase", draft_id: draftFixture.id, phase: "llm", status: "missing" }], warning_ids: [] };
const run = { id: "synthetic-run-code", draft_id: draftFixture.id, draft_version: 1, ruleset_version: 1, phase: "code", status: "succeeded", started_at: draftFixture.updated_at, completed_at: draftFixture.updated_at, error: null, cached: false, not_evaluable: checkResultFixture.notEvaluable };
const proposalResponse = { proposal: proposalFixture, drift_results: driftFixtures };
/** Stateless fixture payloads. They demonstrate shapes, not persistence or real reviews. */
export const mockResponses: Record<RouteName, unknown> = {
  listSabads: { sabads: [] },
  getSabad: { status: "unavailable", reason: "Load the private BaniDB-exported fixture to view source text; no source text is synthesized." },
  saveDraft: { draft: draftFixture },
  getReport: { draft: draftFixture, ruleset_version: 1, findings: checkResultFixture.findings, history: [], decisions: [], check_runs: [run] },
  runCodeChecks: { affected_drafts: [draftFixture], check_runs: [run], result: checkResultFixture },
  runLlmChecks: { affected_drafts: [draftFixture], check_runs: [{ ...run, id: "synthetic-run-llm", phase: "llm", not_evaluable: checkResultFixture.notEvaluable }], result: { findings: [], notEvaluable: checkResultFixture.notEvaluable } },
  markReady: { draft: { ...draftFixture, status: "ready_for_review" } },
  reviewQueue: { drafts: [{ ...draftFixture, status: "ready_for_review" }] },
  decide: { decision: { id: "synthetic-decision-1", finding_id: finding.id, draft_id: draftFixture.id, draft_version: 1, ruleset_version: 1, action: "accept", reason: "Synthetic test evidence accepted; this finding stays open for editing.", reviewer: "Synthetic test reviewer", at: draftFixture.updated_at }, finding },
  getPublishGate: gate,
  publish: { error: { code: "publish_blocked", reason: "Synthetic fixture gate is blocked; no publication was performed.", blockers: gate.blockers } },
  getReference: { error: { code: "unavailable", reason: "Synthetic mock has no real reference evidence; no reference rendering is synthesized." } },
  listRules: { ruleset_version: 1, rules: rulesFixture },
  listProposals: { proposals: [proposalFixture] },
  getProposal: proposalResponse,
  submitProposal: proposalResponse,
  approveProposal: { error: { code: "unavailable", reason: "Stateless synthetic mock; no rule approval or version increment was performed." } },
  getEval: evalFixture,
};
