import { DriftResultSchema, ProposalSchema, type DriftAssessment, type Proposal } from "../../contracts/domain";
import { nextId, nowIso } from "./context";
import type { AppStore } from "./memory-repo";
import { currentRuleset } from "./state";

/**
 * API-10 / FR-16b: when overrides of one rule have been recorded by at least two distinct reviewer names, Eko
 * drafts ONE pending proposal for that rule, with the overrides as evidence. It is never approved or activated
 * here, and it contains no suggested translation text: only the rule's verbatim text and the reviewers' own
 * written reasons and quoted draft spans.
 *
 * Identity: a drafted proposal has `source: "overrides"` and `evidence_ids[0]` is the rule ID; the decision IDs
 * and finding IDs follow. Call it inside the decision transaction (pass the transaction's store).
 */

const nameKey = (name: string): string => name.trim().toLowerCase();
const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id, "en", { numeric: true });

/** Drift is not run at creation (it is asynchronous and the decision transaction is not): each check is labelled unavailable, never passed. */
const DEFERRED_DRIFT: DriftAssessment[] = (["contradiction", "reference_replay", "glossary_collision"] as const).map((check) => ({
  status: "not_evaluable", check,
  reason: "Drift check not run: this proposal was drafted from reviewer overrides. Revise and submit it to run the drift check.",
}));

export function draftProposalFromOverrides(tx: AppStore, ruleId: string): Proposal | null {
  const rule = currentRuleset(tx).rules.find((candidate) => candidate.id === ruleId);
  if (!rule) return null;

  const drafted = tx.listProposals().filter((proposal) => proposal.source === "overrides" && proposal.evidence_ids[0] === ruleId);
  const pending = drafted.find((proposal) => proposal.status === "pending");
  // After an earlier drafted proposal for this rule was decided, only newer overrides count towards a new one.
  const closedAt = drafted.filter((proposal) => proposal.status !== "pending").map((proposal) => proposal.at).sort().at(-1) ?? "";

  const overrides = tx.listDrafts()
    .flatMap((draft) => tx.listDecisionsForDraft(draft.id))
    .filter((decision) => decision.action === "override" && decision.at > closedAt)
    .flatMap((decision) => {
      const finding = tx.getFinding(decision.finding_id);
      return finding && finding.rule_id === ruleId ? [{ decision, finding }] : [];
    })
    .sort((a, b) => a.decision.at.localeCompare(b.decision.at) || byId(a.decision, b.decision));

  const reviewers = new Map<string, string>(); // normalized -> first typed form
  for (const { decision } of overrides) if (!reviewers.has(nameKey(decision.reviewer))) reviewers.set(nameKey(decision.reviewer), decision.reviewer.trim());
  if (reviewers.size < 2) return null;

  const evidence_ids = [...new Set([ruleId, ...overrides.flatMap(({ decision, finding }) => [decision.id, finding.id])])];
  const reasons = overrides.map(({ decision }) => `- ${decision.reviewer.trim()} (${decision.id}): ${decision.reason.trim()}`).join("\n");
  const spans = overrides.map(({ finding }) => `- ${finding.id}: ${finding.quoted_span}`).join("\n");
  const content = {
    rule_text: `Review how rule ${ruleId} is applied. Current rule text, verbatim: ${rule.text}`,
    example: `Draft spans where ${ruleId} was overridden:\n${spans}`,
    reason: `${reviewers.size} reviewers (${[...reviewers.values()].join(", ")}) have overridden rule ${ruleId} ${overrides.length} time${overrides.length === 1 ? "" : "s"}. `
      + `Eko drafted this proposal from those overrides for people to review; it is not approved. Written override reasons:\n${reasons}`,
    evidence_ids,
  };

  if (pending) {
    const same = pending.reason === content.reason && pending.example === content.example && pending.evidence_ids.join("\u0000") === evidence_ids.join("\u0000");
    if (same) return pending;
    const updated = ProposalSchema.parse({ ...pending, ...content });
    tx.saveProposal(updated);
    return updated;
  }
  const proposal = ProposalSchema.parse({
    id: nextId("proposal", tx), source: "overrides", ...content, author: "Eko (drafted from overrides)", at: nowIso(), status: "pending",
  });
  tx.saveProposal(proposal);
  for (const assessment of DEFERRED_DRIFT) tx.saveDriftResult(DriftResultSchema.parse({ id: nextId("drift", tx), proposal_id: proposal.id, assessment, override: null }));
  return proposal;
}
