import type { ApiResponse } from "../../contracts/api";
import {
  DriftResultSchema, ProposalSchema, RuleSchema,
  type DriftAssessment, type DriftResult, type Proposal, type Rule,
} from "../../contracts/domain";
import { getStore, nextId, nowIso } from "./context";
import type { AppStore } from "./memory-repo";
import { ServiceError, type ParsedRequest } from "./http";
import { currentRuleset } from "./state";

const isBlank = (value: string | null | undefined): boolean => value === null || value === undefined || value.trim().length === 0;
// IDs like PR-001 / drift-2 grow monotonically; numeric collation keeps oldest first without relying on store order.
const byId = <T extends { id: string }>(items: T[]): T[] => [...items].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
const isBlock = (result: DriftResult): boolean => result.assessment.status === "evaluated" && result.assessment.outcome === "block";

export function listProposals(): ApiResponse<"listProposals"> {
  return { proposals: byId(getStore().listProposals()) };
}

export function getProposal(req: ParsedRequest<"getProposal">): ApiResponse<"getProposal"> {
  const store = getStore();
  const proposal = store.getProposal(req.proposal_id);
  if (!proposal) throw new ServiceError("not_found", "That proposal does not exist.");
  return { proposal, drift_results: byId(store.listDriftResultsForProposal(proposal.id)) };
}

/**
 * SYNTHETIC drift stub, labelled as such in every reason. Rule text is untrusted data: it is never read here.
 * TODO(LLM-10): replace with engine.runDriftCheck
 */
export function stubDriftCheck(_proposal: Proposal, store: AppStore): DriftAssessment[] {
  const published = store.listReferences().filter((reference) => reference.source === "published");
  const lineIds = [...new Set(published.flatMap((reference) => reference.line_ids))];
  const replay: DriftAssessment = published.length > 0
    ? {
      status: "evaluated", check: "reference_replay", outcome: "block",
      reason: "Synthetic replay stub: this proposal is treated as affecting every published line until the real replay (LLM-10) exists.",
      evidence: { rule_ids: [], reference_ids: published.map((reference) => reference.id), affected_line_ids: lineIds, affected_count: lineIds.length, source_counts: { sikhri_sample: 0, published: lineIds.length } },
    }
    : {
      status: "evaluated", check: "reference_replay", outcome: "pass",
      reason: "Synthetic replay stub: no published references exist to replay against.",
      evidence: { rule_ids: [], reference_ids: [], affected_line_ids: [], affected_count: 0, source_counts: { sikhri_sample: 0, published: 0 } },
    };
  return [
    { status: "not_evaluable", check: "contradiction", reason: "Contradiction check not implemented; LLM-10 pending." },
    replay,
    { status: "not_evaluable", check: "glossary_collision", reason: "No glossary authority supplied (OQ-13); unavailable, not a pass." },
  ];
}

export function submitProposal(req: ParsedRequest<"submitProposal">): ApiResponse<"submitProposal"> {
  const store = getStore();
  // Rule text is stored verbatim (hard rule 8) and never interpreted.
  const proposal = ProposalSchema.parse({
    id: nextId("proposal"), source: "free_text", rule_text: req.rule_text, example: req.example, reason: req.reason,
    evidence_ids: [], author: req.author, at: nowIso(), status: "pending",
  });
  const results = stubDriftCheck(proposal, store).map((assessment) =>
    DriftResultSchema.parse({ id: nextId("drift"), proposal_id: proposal.id, assessment, override: null }));
  store.saveProposal(proposal);
  for (const result of results) store.saveDriftResult(result);
  return { proposal, drift_results: results };
}

export function approveProposal(req: ParsedRequest<"approveProposal">): ApiResponse<"approveProposal"> {
  const store = getStore();
  const proposal = store.getProposal(req.proposal_id);
  if (!proposal) throw new ServiceError("not_found", "That proposal does not exist.");
  if (proposal.status !== "pending") throw new ServiceError("invalid_request", "This proposal has already been decided.");
  if (isBlank(req.reason) || isBlank(req.actor)) throw new ServiceError("invalid_request", "A name and a written reason are required to approve a rule.");
  const current = currentRuleset(store);
  if (req.ruleset_version !== current.version) throw new ServiceError("version_conflict", "The ruleset changed since you opened this proposal; reload before approving.");
  const blocking = store.listDriftResultsForProposal(proposal.id).filter(isBlock);
  if (blocking.length > 0 && isBlank(req.drift_override_reason)) {
    throw new ServiceError("drift_blocked", "The drift check blocks this proposal. Approving it needs a separate written reason to override the block.");
  }

  // Build and validate everything first; nothing is written until every parse has succeeded.
  const at = nowIso();
  const newVersion = current.version + 1;
  const provenance = { actor: req.actor, reason: req.reason, at };
  const driftOverride = blocking.length > 0 && req.drift_override_reason ? { actor: req.actor, reason: req.drift_override_reason, at } : null;
  const rule: Rule = RuleSchema.parse({
    id: nextId("rule"), text: proposal.rule_text, level: "SHOULD", layers: ["transcreation"], plan: "generic_judge",
    severity: "warning", decision: null, version: newVersion, status: "approved", source: "proposal", source_tag: "proposal",
    prefilter: null,
    resolution: { active: true, scope: "p0_check", severity: "warning", blocks_publish: false, layers: ["transcreation"], conditional: null, decision: null },
    provenance,
  });
  if (current.rules.some((existing) => existing.id === rule.id)) throw new ServiceError("internal_error", "The new rule ID collides with an existing rule.");
  const rules = [...current.rules, rule].map((item) => RuleSchema.parse(item));
  const approved = ProposalSchema.parse({ ...proposal, status: "approved" });
  const overridden = driftOverride ? blocking.map((result) => DriftResultSchema.parse({ ...result, override: driftOverride })) : [];

  store.saveRuleset(newVersion, rules);
  store.saveProposal(approved);
  for (const result of overridden) store.saveDriftResult(result);
  // Old findings and runs stay tied to the old ruleset version; gates and reports show checks as missing until re-run.
  return { rule, approval: { proposal_id: proposal.id, ruleset_version: newVersion, provenance, drift_override: driftOverride }, ruleset_version: newVersion };
}
