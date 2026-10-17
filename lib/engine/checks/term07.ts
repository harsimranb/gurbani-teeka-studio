import type { Draft } from "../../contracts/domain";
import { isDeterministic, scanPatterns } from "../rules";
import { inSabadOrder, makeFinding } from "./finding";
import type { CheckOutput, CodeCheck, CodeCheckContext } from "./types";

/** Bani titles that legitimately contain a listed non-preferred spelling (proper nouns, TRAN-02). */
export const BANI_TITLE_EXEMPTIONS: RegExp[] = [/Shabad Hazar(?:e|ay)\b/g];

function exemptRanges(text: string): Array<[number, number]> {
  return BANI_TITLE_EXEMPTIONS.flatMap((title) =>
    [...text.matchAll(new RegExp(title.source, title.flags.includes("g") ? title.flags : `${title.flags}g`))]
      .map((match): [number, number] => [match.index, match.index + match[0].length]));
}

const insideExempt = (ranges: Array<[number, number]>, start: number, end: number) =>
  ranges.some(([from, to]) => from <= start && end <= to);

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phrasePattern = (value: string) => value.trim().split(/\s+/).map(escapeRegex).join("\\s+");

/** `Term (Gloss)` pairs read from the verbatim rule text; terms listed without a gloss are skipped. */
export function parseGlossedTerms(ruleText: string): Array<{ term: string; gloss: string }> {
  return [...ruleText.matchAll(/(?<![A-Za-z])([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)?) \(([^()]+)\)/g)]
    .map((match) => ({ term: match[1], gloss: match[2].trim() }));
}

function firstUseHints(context: CodeCheckContext, drafts: Draft[], output: CheckOutput): void {
  for (const { term, gloss } of parseGlossedTerms(context.rule.text)) {
    const termPattern = new RegExp(`\\b${phrasePattern(term)}\\b`, "g");
    const apposition = new RegExp(`^\\s*[,\\-\\u2013\\u2014]\\s*(?:the\\s+)?${phrasePattern(gloss)}\\b`, "i");
    const found = firstOccurrence(drafts, termPattern);
    if (!found) continue;
    const { draft, start, end } = found;
    if (apposition.test(draft.text.slice(end))) continue;
    output.findings.push(makeFinding({
      input: context.input, draft, rule: context.rule, start, end, severity: "hint", tag: "first-use-gloss",
      explanation: `First use of "${draft.text.slice(start, end)}" in this Sabad has no apposition gloss (comma or dash); ${context.rule.id} asks for a gloss at first use.`,
    }));
  }
}

function firstOccurrence(drafts: Draft[], pattern: RegExp): { draft: Draft; start: number; end: number } | undefined {
  for (const draft of drafts) {
    const ranges = exemptRanges(draft.text);
    for (const match of draft.text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (!insideExempt(ranges, start, end)) return { draft, start, end };
    }
  }
  return undefined;
}

export const term07Check: CodeCheck = {
  ruleId: "TERM-07",
  scope: "sabad",
  run(context): CheckOutput {
    const output: CheckOutput = { findings: [], candidates: [] };
    const drafts = inSabadOrder(context.input, context.drafts);
    for (const draft of drafts) {
      const ranges = exemptRanges(draft.text);
      for (const hit of scanPatterns(context.patterns, draft.text)) {
        if (isDeterministic(hit.action)) {
          if (hit.action === "flag_if_not_proper_noun" && insideExempt(ranges, hit.start, hit.end)) continue;
          output.findings.push(makeFinding({
            input: context.input, draft, rule: context.rule, start: hit.start, end: hit.end, tag: "spelling",
            explanation: `"${hit.text}" differs from the spelling ${context.rule.id} lists for this term.`,
          }));
        } else {
          output.candidates.push({ ruleId: context.rule.id, draftId: draft.id, start: hit.start, end: hit.end, quoted_span: hit.text, patternIndex: hit.patternIndex });
        }
      }
    }
    firstUseHints(context, drafts, output);
    return output;
  },
};
