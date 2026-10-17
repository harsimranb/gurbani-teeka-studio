import { makeFinding } from "./finding";
import type { CheckInput, Draft, Rule } from "../../contracts/domain";
import type { CodeCheck } from "./types";

const GURMUKHI_DIGIT_START = 0x0a66;
const GURMUKHI_BINDI = 0x0a02;
const GURMUKHI_TIPPI = 0x0a70;
const GURMUKHI_VISARG = 0x0a03;

function romanDigitRuns(source: string): string[] {
  const runs: string[] = [];
  let current = "";
  for (const character of source) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint >= GURMUKHI_DIGIT_START && codePoint <= GURMUKHI_DIGIT_START + 9) current += String(codePoint - GURMUKHI_DIGIT_START);
    else if (current) { runs.push(current); current = ""; }
  }
  if (current) runs.push(current);
  return runs;
}

function sourceEvidence(draft: Draft, input: CheckInput): string {
  return draft.line_ids.flatMap((lineId) => {
    const line = input.sabad.lines.find((item) => item.line_id === lineId);
    if (!line) return [];
    if (draft.source_word_start === undefined) return [line.gurmukhi];
    const token = [...line.gurmukhi.matchAll(/\S+/gu)].find((match) => match.index === draft.source_word_start);
    return token ? [token[0]] : [];
  }).join(" ");
}

function countSourceCodePoint(text: string, target: number): number {
  return Array.from(text).filter((character) => character.codePointAt(0) === target).length;
}

function countRomanMark(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function exactFinding(input: CheckInput, rule: Rule, draft: Draft, explanation: string) {
  return makeFinding({ input, draft, rule, start: 0, end: draft.text.length, explanation });
}

/** TRAN-09: each BaniDB tippi or bindī needs one Roman ṁ marker. */
export const tran09Check: CodeCheck = {
  ruleId: "TRAN-09", scope: "unit",
  run({ input, rule, drafts }) {
    const findings = drafts.flatMap((draft) => {
      if (!draft.text.trim()) return [];
      const required = countSourceCodePoint(sourceEvidence(draft, input), GURMUKHI_BINDI)
        + countSourceCodePoint(sourceEvidence(draft, input), GURMUKHI_TIPPI);
      if (countRomanMark(draft.text, /ṁ/gu) >= required) return [];
      return [exactFinding(input, rule, draft, "The transcription omits a Roman ṁ marker for a BaniDB tippi or bindī.")];
    });
    return { findings, candidates: [] };
  },
};

/** TRAN-10: each BaniDB visarg needs an implicit a followed by Roman ḥ. */
export const tran10Check: CodeCheck = {
  ruleId: "TRAN-10", scope: "unit",
  run({ input, rule, drafts }) {
    const findings = drafts.flatMap((draft) => {
      if (!draft.text.trim()) return [];
      const required = countSourceCodePoint(sourceEvidence(draft, input), GURMUKHI_VISARG);
      if (countRomanMark(draft.text, /aḥ/giu) >= required) return [];
      return [exactFinding(input, rule, draft, "The transcription omits aḥ for a BaniDB visarg.")];
    });
    return { findings, candidates: [] };
  },
};

/** TRAN-14: Gurmukhi numerals in the covered BaniDB lines must appear as Roman digit runs. */
export const tran14Check: CodeCheck = {
  ruleId: "TRAN-14", scope: "unit",
  run({ input, rule, drafts }) {
    const findings = [];
    for (const draft of drafts) {
      if (draft.text.trim() === "") continue;
      const sourceNumbers: string[] = draft.source_word_start === undefined
        ? draft.line_ids.flatMap((lineId) => {
          const line = input.sabad.lines.find((item) => item.line_id === lineId);
          return line ? romanDigitRuns(line.gurmukhi) : [];
        })
        : draft.line_ids.flatMap((lineId) => {
          const line = input.sabad.lines.find((item) => item.line_id === lineId);
          const word = line && [...line.gurmukhi.matchAll(/\S+/gu)].find((token) => token.index === draft.source_word_start);
          return word ? romanDigitRuns(word[0]) : [];
        });
      if (sourceNumbers.length === 0) continue;
      const remaining = new Map<string, number>();
      for (const digits of (draft.text.match(/\d+/gu) ?? [])) remaining.set(digits, (remaining.get(digits) ?? 0) + 1);
      const satisfied = sourceNumbers.every((digits) => {
        const count = remaining.get(digits) ?? 0;
        if (count === 0) return false;
        remaining.set(digits, count - 1);
        return true;
      });
      if (satisfied) continue;
      findings.push(makeFinding({ input, draft, rule, start: 0, end: draft.text.length,
        explanation: "The transcription does not include the Roman digit sequence corresponding to the BaniDB numeral." }));
    }
    return { findings, candidates: [] };
  },
};
