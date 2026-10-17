import { makeFinding } from "./finding";
import type { CodeCheck } from "./types";

/** Structural half of ANNO-02: literal and implied meaning sets need one separator. */
export const anno02Check: CodeCheck = {
  ruleId: "ANNO-02", scope: "unit",
  run({ input, rule, drafts }) {
    return {
      findings: drafts.flatMap((draft) => {
        if (draft.source_word_start === undefined || draft.text.trim() === "") return [];
        const literalAndImplied = draft.text.split("\n", 1)[0];
        const parts = literalAndImplied.split(";");
        if (parts.length === 2 && parts.every((part) => part.trim().length > 0)) return [];
        return [makeFinding({ input, draft, rule, start: 0, end: draft.text.length,
          explanation: "This word annotation does not have one nonempty literal set and one nonempty implied set separated by a semicolon." })];
      }),
      candidates: [],
    };
  },
};
