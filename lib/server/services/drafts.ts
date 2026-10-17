import type { ApiResponse } from "../../contracts/api";
import { containsGurmukhi, isGurmukhiNumericToken, type Draft } from "../../contracts/domain";
import { tokenize } from "../../engine/index";
import { getSourceStatus, getStore, nowIso, nextId } from "./context";
import { demoSabadSummaries } from "./context";
import { ServiceError, type ParsedRequest } from "./http";
import { clearFindings, currentFindings, currentRuleset, currentRuns, invalidateLiteralMirrorDependents, invalidateSabadScopedSiblings, sabadDrafts } from "./state";

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((id, index) => id === b[index]);

/** The offered Sabads: the demo list that exists in the store, else every ingested Sabad (see `demoSabadSummaries`). */
export function listSabads(): ApiResponse<"listSabads"> {
  return { sabads: demoSabadSummaries(getStore()) };
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
  // The route fills this default; retain it for older direct service callers too.
  const layer = req.layer ?? "transcreation";
  const wordStart = req.source_word_start ?? null;
  if (containsGurmukhi(req.text)) throw new ServiceError("invalid_request", "Gurmukhi is read-only and comes from BaniDB.");
  const store = getStore();
  const source = getSourceStatus();
  if (!source.available) throw new ServiceError("unavailable", source.reason);
  const sabad = store.getSabad(req.shabad_id);
  if (!sabad) throw new ServiceError("not_found", "That Sabad does not exist.");
  const known = new Set(sabad.lines.map((line) => line.line_id));
  if (req.line_ids.some((id) => !known.has(id))) throw new ServiceError("invalid_request", "Every source line must belong to this Sabad.");
  if (wordStart !== null) {
    if (!(["annotation", "transcription"] as string[]).includes(layer) || req.line_ids.length !== 1) throw new ServiceError("invalid_request", "A word position needs one annotation or transcription source line.");
    const line = sabad.lines.find((item) => item.line_id === req.line_ids[0])!;
    const numericTranscriptionToken = layer === "transcription" && [...line.gurmukhi.matchAll(/\S+/gu)]
      .some((match) => match.index === wordStart && isGurmukhiNumericToken(match[0]));
    if (!tokenize(line.gurmukhi).some((token) => token.start === wordStart) && !numericTranscriptionToken) {
      throw new ServiceError("invalid_request", "That word position does not exist in the BaniDB source line.");
    }
  }
  const at = nowIso();
  const overlapping = (excludeId: string | null) => sabadDrafts(store, req.shabad_id)
    .filter((draft) => draft.id !== excludeId && draft.layer === layer && (draft.source_word_start ?? null) === wordStart && draft.line_ids.some((id) => req.line_ids.includes(id)));

  if (req.draft_id === null) {
    // Regroup/ungroup REPLACES overlapped drafts. deleteDraft cascades findings, runs and decisions, so their
    // history is lost; acceptable for this stub (a SQLite-backed version may archive instead).
    const replaced = overlapping(null);
    // A published unit has a reference and a publication pointing at it; deleting it would orphan that audit trail.
    const published = replaced.find((draft) => draft.status === "published");
    if (published) {
      const covered = published.line_ids.find((id) => req.line_ids.includes(id)) ?? published.line_ids[0];
      const lineNumber = sabad.lines.findIndex((line) => line.line_id === covered) + 1;
      throw new ServiceError("invalid_request", `Line ${lineNumber} is part of a published transcreation; edit that unit instead of regrouping it.`);
    }
    const gone = new Set(replaced.map((draft) => draft.id));
    const draft: Draft = {
      id: nextId("draft"), shabad_id: req.shabad_id, line_ids: req.line_ids, layer,
      ...(wordStart === null ? {} : { source_word_start: wordStart }),
      text: req.text, author: req.author, status: "draft", version: 1, updated_at: at,
    };
    // Clear + delete + save are one unit: a failure part-way leaves the replaced drafts and their findings intact.
    store.transaction((tx) => {
      clearFindings(tx, (finding) => gone.has(finding.draft_id), at, gone);
      for (const id of gone) tx.deleteDraft(id);
      tx.saveDraft(draft);
      invalidateSabadScopedSiblings(tx, draft, at);
      invalidateLiteralMirrorDependents(tx, draft, at, [...draft.line_ids, ...replaced.flatMap((previous) => previous.line_ids)]);
    });
    return { draft };
  }

  const existing = store.getDraft(req.draft_id);
  if (!existing) throw new ServiceError("not_found", "That draft does not exist.");
  if (existing.shabad_id !== req.shabad_id) throw new ServiceError("invalid_request", "The draft belongs to a different Sabad.");
  if (existing.layer !== layer) throw new ServiceError("invalid_request", "A draft's layer cannot change; create a separate authored item.");
  if ((existing.source_word_start ?? null) !== wordStart) throw new ServiceError("invalid_request", "A draft's source word cannot change; create a separate authored item.");
  if (req.expected_version !== existing.version) throw new ServiceError("version_conflict", "The draft changed since you loaded it; reload before saving.");
  const linesChanged = !sameList(req.line_ids, existing.line_ids);
  if (req.text === existing.text && !linesChanged) return { draft: existing };
  if (linesChanged && overlapping(existing.id).length > 0) throw new ServiceError("invalid_request", "Those source lines are already covered by another draft.");
  const updated: Draft = {
    ...existing, text: req.text, line_ids: req.line_ids, author: req.author, status: "draft",
    version: existing.version + 1, updated_at: at,
  };
  // Findings of the old version are history now; old-version runs are ignored by the current-version helpers.
  // Save + clear are one unit, so a new version never exists next to still-current findings of the old one.
  store.transaction((tx) => {
    tx.saveDraft(updated);
    clearFindings(tx, (finding) => finding.draft_id === existing.id, at, [existing.id]);
    // Siblings' Sabad-scoped findings (first use, TERM-02) depend on this unit, so they go stale in the same unit.
    invalidateSabadScopedSiblings(tx, updated, at);
    invalidateLiteralMirrorDependents(tx, updated, at, [...existing.line_ids, ...updated.line_ids]);
  });
  return { draft: updated };
}

export function getReport(req: ParsedRequest<"getReport">): ApiResponse<"getReport"> {
  const store = getStore();
  const draft = store.getDraft(req.draft_id);
  if (!draft) throw new ServiceError("not_found", "That draft does not exist.");
  const publication = draft.status === "published"
    ? store.listPublicationsForSabad(draft.shabad_id)
      .filter((item) => item.draft_id === draft.id && item.gate.draft_version === draft.version)
      .at(-1)
    : undefined;
  const rulesetVersion = publication?.gate.ruleset_version ?? currentRuleset(store).version;
  return {
    draft, ruleset_version: rulesetVersion,
    findings: currentFindings(store, draft, rulesetVersion),
    history: store.listFindingsForDraft(draft.id).filter((finding) => finding.state === "cleared"),
    decisions: store.listDecisionsForDraft(draft.id),
    check_runs: currentRuns(store, draft, rulesetVersion),
  };
}
