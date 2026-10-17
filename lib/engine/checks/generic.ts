import { isDeterministic, scanPatterns } from "../rules";
import type { PatternHit } from "../rules";
import { makeFinding } from "./finding";
import type { CheckOutput, CodeCheck, CodeCheckContext } from "./types";

/**
 * Seed prefilters applied as written: `flag` hits become findings, `llm_confirm` hits become
 * model candidates. Covers LAYER-06 and PRIN-04's deterministic tier.
 */
export function runPrefilter(context: CodeCheckContext, promote: (hit: PatternHit) => string = (hit) => hit.action): CheckOutput {
  const output: CheckOutput = { findings: [], candidates: [] };
  for (const draft of context.drafts) {
    for (const hit of scanPatterns(context.patterns, draft.text)) {
      const action = promote(hit);
      if (action === "flag") {
        output.findings.push(makeFinding({
          input: context.input, draft, rule: context.rule, start: hit.start, end: hit.end,
          // The highlighted span carries the evidence; echoing it could put draft words like "wrong" in Eko's voice.
          explanation: `The highlighted span matches a ${context.rule.id} pattern for the ${draft.layer}. See the rule text for the guidance it differs from.`,
        }));
      } else if (!isDeterministic(action)) {
        output.candidates.push({ ruleId: context.rule.id, draftId: draft.id, start: hit.start, end: hit.end, quoted_span: hit.text, patternIndex: hit.patternIndex });
      }
    }
  }
  return output;
}

export const genericCheck = (ruleId: string): CodeCheck => ({ ruleId, scope: "unit", run: (context) => runPrefilter(context) });

// Resolution: capitalized singular/compound -> error; "Lowercase or plural ... -> LLM confirms the referent".
export const term01Check: CodeCheck = {
  ruleId: "TERM-01", scope: "unit",
  run: (context) => runPrefilter(context, (hit) => (hit.action === "flag" && /^(?:God|Lord)(?:s|s')$/.test(hit.text) ? "llm_confirm" : hit.action)),
};

// Resolution: "Any parenthesis or square bracket in a transcreation -> error, deterministic."
export const layer07Check: CodeCheck = { ruleId: "LAYER-07", scope: "unit", run: (context) => runPrefilter(context, () => "flag") };
