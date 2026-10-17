import type { ApiResponse } from "../../contracts/api";
import type { Reference } from "../../contracts/domain";
import { tokenize } from "../../engine/index";
import { getSourceStatus, getStore } from "./context";
import { ServiceError, type ParsedRequest } from "./http";

/** Rows shown per section; the response always carries the full count beside them. */
export const OCCURRENCE_CAP = 20;
export const RENDERING_CAP = 10;

const SOURCE_LABEL: Record<Reference["source"], string> = {
  published: "Published in Eko",
  sikhri_sample: "SikhRI reference sample",
};

/**
 * FE-11: read-only evidence for one word of a source line, chosen by its offset (`start`, UTF-16 units) in that line.
 *
 * - Occurrences: every line in the loaded corpus with a word sharing the selected word's stem key (engine `tokenize`),
 *   one entry per line. SQLite prefilters with a substring match on the stem (any word with that stem key contains it);
 *   the engine then confirms the exact stem key. Cost: one scan of the lines table per lookup, no persistent index.
 * - Prior renderings: stored references (published in Eko or SikhRI samples) that cover one of those lines. Their English
 *   is line-level text: it is shown as stored, never aligned to this word, and nothing here proposes a new rendering.
 * Similar lines are not offered: no sourced method for comparing Gurmukhi lines exists yet.
 */
export function lookupWord(req: ParsedRequest<"lookupWord">): ApiResponse<"lookupWord"> {
  const source = getSourceStatus();
  if (!source.available) return { status: "unavailable", reason: source.reason };
  const store = getStore();
  const line = store.getLine(req.line_id);
  if (!line) throw new ServiceError("not_found", "That source line does not exist.");
  const word = tokenize(line.gurmukhi).find((token) => token.start === req.start);
  if (!word) throw new ServiceError("invalid_request", "That position is not the start of a word in this line.");

  const matchedLineIds = new Set<string>();
  const items: Extract<ApiResponse<"lookupWord">, { status: "available" }>["occurrences"]["items"] = [];
  for (const candidate of store.findLinesContaining(word.stem_key)) {
    const hit = tokenize(candidate.gurmukhi).find((token) => token.stem_key === word.stem_key);
    if (!hit) continue;
    matchedLineIds.add(candidate.line_id);
    if (items.length < OCCURRENCE_CAP) {
      items.push({ shabad_id: candidate.shabad_id, line_id: candidate.line_id, ang: candidate.ang, surface: hit.surface, gurmukhi: candidate.gurmukhi });
    }
  }

  const references = store.listReferences().flatMap((reference) => {
    const matched = reference.line_ids.filter((id) => matchedLineIds.has(id));
    return matched.length > 0 ? [{ reference, matched }] : [];
  });
  return {
    status: "available",
    word: { line_id: line.line_id, shabad_id: line.shabad_id, surface: word.surface, stem_key: word.stem_key, ending_matra: word.ending_matra },
    occurrences: { total: matchedLineIds.size, items },
    prior_renderings: {
      total: references.length,
      items: references.slice(0, RENDERING_CAP).map(({ reference, matched }) => ({
        reference_id: reference.id, source: reference.source, source_label: SOURCE_LABEL[reference.source],
        line_ids: reference.line_ids, matched_line_ids: matched, english: reference.english,
      })),
    },
  };
}
