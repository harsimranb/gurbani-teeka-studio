import type { Decision, Draft, Finding, Publication, Reference } from "../../contracts/domain";
import { indexReferences } from "../../engine";
import { getStore, nextId, nowIso } from "./context";
import { ServiceError, type ParsedRequest } from "./http";
import { allDrafts, computeGate, currentFindings, currentRuleset } from "./state";

/** Review and publishing services (API-04/05) plus reference reads. Every function throws ServiceError on failure. */

function requireDraft(draftId: string): Draft {
  const draft = getStore().getDraft(draftId);
  if (!draft) throw new ServiceError("not_found", "That draft does not exist.");
  return draft;
}

export function markReady(req: ParsedRequest<"markReady">): { draft: Draft } {
  const store = getStore();
  const draft = requireDraft(req.draft_id);
  if (draft.version !== req.draft_version) throw new ServiceError("version_conflict", "The draft changed; reload before marking it ready.");
  const updated: Draft = { ...draft, status: "ready_for_review" };
  store.saveDraft(updated);
  return { draft: updated };
}

/** Drafts awaiting review across every Sabad, in source order. */
export function reviewQueue(): { drafts: Draft[] } {
  return { drafts: allDrafts(getStore()).filter((draft) => draft.status === "ready_for_review" || draft.status === "changes_requested") };
}

export function decide(req: ParsedRequest<"decide">): { decision: Decision; finding: Finding } {
  const store = getStore();
  if (req.reason.trim().length === 0) throw new ServiceError("invalid_request", "A written reason is required.");
  const draft = requireDraft(req.draft_id);
  const finding = store.getFinding(req.finding_id);
  if (!finding || finding.draft_id !== draft.id) throw new ServiceError("not_found", "That finding does not exist for this draft.");
  const rulesetVersion = currentRuleset(store).version;
  if (draft.version !== req.draft_version || rulesetVersion !== req.ruleset_version
    || finding.draft_version !== req.draft_version || finding.ruleset_version !== req.ruleset_version || finding.state !== "current") {
    throw new ServiceError("version_conflict", "The finding is no longer current; reload the report.");
  }
  const at = nowIso();
  const decision: Decision = {
    id: nextId("decision"), finding_id: finding.id, draft_id: draft.id, draft_version: draft.version,
    ruleset_version: rulesetVersion, action: req.action, reason: req.reason, reviewer: req.reviewer, at,
  };
  store.saveDecision(decision);
  let result = finding;
  if (req.action === "accept") {
    // Accepting keeps the finding open and asks the writer for changes (a published draft keeps its status).
    if (draft.status !== "published") store.saveDraft({ ...draft, status: "changes_requested" });
  } else {
    result = { ...finding, state: "cleared", cleared_at: at };
    store.saveFinding(result);
  }
  return { decision, finding: result };
}

export function getPublishGate(req: ParsedRequest<"getPublishGate">) {
  return computeGate(getStore(), requireDraft(req.draft_id));
}

export async function publish(req: ParsedRequest<"publish">) {
  const store = getStore();
  const draft = requireDraft(req.draft_id);
  const rulesetVersion = currentRuleset(store).version;
  if (draft.version !== req.draft_version || rulesetVersion !== req.ruleset_version) {
    throw new ServiceError("version_conflict", "The draft or ruleset changed; reload before publishing.");
  }
  if (draft.status === "published") throw new ServiceError("invalid_request", "This draft version is already published.");
  if (draft.text.trim().length === 0) throw new ServiceError("invalid_request", "An empty draft cannot be published.");

  // A departure reason is only meaningful for a current CONS-01 finding of this draft.
  const consFindingIds = new Set(currentFindings(store, draft, rulesetVersion).filter((finding) => finding.rule_id === "CONS-01").map((finding) => finding.id));
  const departureIds = new Set<string>();
  for (const departure of req.departure_reasons) {
    if (departure.reason.trim().length === 0) throw new ServiceError("invalid_request", "Every departure reason needs written text.");
    if (!consFindingIds.has(departure.finding_id)) throw new ServiceError("invalid_request", "A departure reason must name a current CONS-01 finding of this draft.");
    departureIds.add(departure.finding_id);
  }

  const gate = computeGate(store, draft, departureIds);
  if (!gate.can_publish) {
    const rules = [...new Set(gate.blockers.map((blocker) => (blocker.kind === "check_phase" ? `check phase ${blocker.phase}` : blocker.rule_id)))];
    throw new ServiceError("publish_blocked", `Publishing is blocked until every blocker is resolved: ${rules.join(", ")}.`, gate.blockers);
  }

  const at = nowIso();
  const exceptions: Reference["exceptions"] = [];
  for (const decision of store.listDecisionsForDraft(draft.id)) {
    if (decision.draft_version !== draft.version || decision.ruleset_version !== rulesetVersion || decision.action === "accept") continue;
    const finding = store.getFinding(decision.finding_id);
    if (finding) exceptions.push({ rule_id: finding.rule_id, decision_id: decision.id, action: decision.action, reason: decision.reason, reviewer: decision.reviewer, at: decision.at });
  }
  for (const departure of req.departure_reasons) {
    exceptions.push({ rule_id: "CONS-01", decision_id: `departure-${departure.finding_id}`, action: "context_reason", reason: departure.reason, reviewer: req.actor, at });
  }

  const published: Draft = { ...draft, status: "published" };
  const reference: Reference = { id: nextId("reference"), line_ids: draft.line_ids, english: draft.text, source: "published", exceptions };
  const publication: Publication = { reference, draft_id: draft.id, approver: req.actor, at, gate };
  store.saveDraft(published);
  store.saveReference(reference);
  store.savePublication(publication);
  await indexReferences(store.listReferences());
  return { draft: published, reference, gate };
}

export function getReference(req: ParsedRequest<"getReference">): { reference: Reference } {
  const reference = getStore().getReference(req.reference_id);
  if (!reference) throw new ServiceError("not_found", "That reference does not exist.");
  return { reference };
}

/** Publications of one Sabad, oldest first (newest last). An unknown Sabad yields an empty list. */
export function listPublications(req: ParsedRequest<"listPublications">): { publications: Publication[] } {
  const publications = getStore().listPublicationsForSabad(req.shabad_id);
  return { publications: [...publications].sort((a, b) => a.at.localeCompare(b.at)) };
}
