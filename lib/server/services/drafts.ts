import type { ApiResponse } from "../../contracts/api";
import type { Draft } from "../../contracts/domain";
import { getSourceStatus, getStore, nowIso, nextId } from "./context";
import { ServiceError, type ParsedRequest } from "./http";
import { clearFindings, currentFindings, currentRuleset, currentRuns, sabadDrafts } from "./state";

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((id, index) => id === b[index]);

/** Every Sabad the store holds, summarised from its first line's metadata. */
export function listSabads(): ApiResponse<"listSabads"> {
  const store = getStore();
  const sabads = store.listSabads().flatMap((summary) => {
    const first = store.getSabad(summary.shabad_id)?.lines[0];
    return first ? [{ shabad_id: summary.shabad_id, ang: first.ang, raag: first.raag, writer: first.writer }] : [];
  });
  return { sabads };
}

/** A missing source or unknown Sabad is a normal 200 "unavailable" answer, not an error. */
export function getSabad(req: ParsedRequest<"getSabad">): ApiResponse<"getSabad"> {
  const source = getSourceStatus();
  if (!source.available) return { status: "unavailable", reason: source.reason };
  const store = getStore();
  const sabad = store.getSabad(req.shabad_id);
  if (!sabad) return { status: "unavailable", reason: "That Sabad is not available from the source." };
  return { status: "available", sabad, drafts: sabadDrafts(store, sabad.shabad_id) };
}

export function saveDraft(req: ParsedRequest<"saveDraft">): ApiResponse<"saveDraft"> {
  const store = getStore();
  const source = getSourceStatus();
  if (!source.available) throw new ServiceError("unavailable", source.reason);
  const sabad = store.getSabad(req.shabad_id);
  if (!sabad) throw new ServiceError("not_found", "That Sabad does not exist.");
  const known = new Set(sabad.lines.map((line) => line.line_id));
  if (req.line_ids.some((id) => !known.has(id))) throw new ServiceError("invalid_request", "Every source line must belong to this Sabad.");
  const at = nowIso();
  const overlapping = (excludeId: string | null) => sabadDrafts(store, req.shabad_id)
    .filter((draft) => draft.id !== excludeId && draft.line_ids.some((id) => req.line_ids.includes(id)));

  if (req.draft_id === null) {
    // Regroup/ungroup REPLACES overlapped drafts. deleteDraft cascades findings, runs and decisions, so their
    // history is lost; acceptable for this stub (a SQLite-backed version may archive instead).
    const gone = new Set(overlapping(null).map((draft) => draft.id));
    clearFindings(store, (finding) => gone.has(finding.draft_id), at);
    for (const id of gone) store.deleteDraft(id);
    const draft: Draft = {
      id: nextId("draft"), shabad_id: req.shabad_id, line_ids: req.line_ids, layer: "transcreation",
      text: req.text, author: req.author, status: "draft", version: 1, updated_at: at,
    };
    store.saveDraft(draft);
    return { draft };
  }

  const existing = store.getDraft(req.draft_id);
  if (!existing) throw new ServiceError("not_found", "That draft does not exist.");
  if (existing.shabad_id !== req.shabad_id) throw new ServiceError("invalid_request", "The draft belongs to a different Sabad.");
  if (req.expected_version !== existing.version) throw new ServiceError("version_conflict", "The draft changed since you loaded it; reload before saving.");
  const linesChanged = !sameList(req.line_ids, existing.line_ids);
  if (req.text === existing.text && !linesChanged) return { draft: existing };
  if (linesChanged && overlapping(existing.id).length > 0) throw new ServiceError("invalid_request", "Those source lines are already covered by another draft.");
  const updated: Draft = {
    ...existing, text: req.text, line_ids: req.line_ids, author: req.author, status: "draft",
    version: existing.version + 1, updated_at: at,
  };
  store.saveDraft(updated);
  // Findings of the old version are history now; old-version runs are ignored by the current-version helpers.
  clearFindings(store, (finding) => finding.draft_id === existing.id, at);
  return { draft: updated };
}

export function getReport(req: ParsedRequest<"getReport">): ApiResponse<"getReport"> {
  const store = getStore();
  const draft = store.getDraft(req.draft_id);
  if (!draft) throw new ServiceError("not_found", "That draft does not exist.");
  const rulesetVersion = currentRuleset(store).version;
  return {
    draft, ruleset_version: rulesetVersion,
    findings: currentFindings(store, draft, rulesetVersion),
    history: store.listFindingsForDraft(draft.id).filter((finding) => finding.state === "cleared"),
    decisions: store.listDecisionsForDraft(draft.id),
    check_runs: currentRuns(store, draft, rulesetVersion),
  };
}
