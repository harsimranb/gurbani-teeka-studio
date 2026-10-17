import { makeFinding } from "./finding";
import type { CodeCheck } from "./types";

const words = (text: string): Set<string> => new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []));
const similarity = (left: string, right: string): number => {
  const a = words(left);
  const b = words(right);
  if (a.size === 0 || b.size === 0) return 0;
  const common = [...a].filter((word) => b.has(word)).length;
  return common / new Set([...a, ...b]).size;
};

/** Conservative literal-vs-transcreation overlap hint; other comparisons remain unevaluable. */
export const layer08Check: CodeCheck = {
  ruleId: "LAYER-08", scope: "unit",
  run({ input, rule, drafts }) {
    const literal = (input.relatedDrafts ?? []).filter((draft) => draft.layer === "literal");
    const findings = drafts.flatMap((draft) => {
      if (!draft.text.trim()) return [];
      const covered = literal.filter((other) => other.line_ids.some((id) => draft.line_ids.includes(id)));
      const literalLines = new Set(covered.flatMap((other) => other.line_ids));
      if (draft.line_ids.some((id) => !literalLines.has(id))) return [];
      const literalText = covered.map((other) => other.text).join(" ");
      if (similarity(draft.text, literalText) < 0.85) return [];
      return [makeFinding({ input, draft, rule, start: 0, end: draft.text.length, severity: "warning", tag: "literal-mirror",
        explanation: "This transcreation has high token overlap with the separately authored literal for the same source lines." })];
    });
    return { findings, candidates: [] };
  },
};
