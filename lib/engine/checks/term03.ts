import { isDeterministic, scanPatterns } from "../rules";
import { inSabadOrder, makeFinding } from "./finding";
import type { CheckOutput, CodeCheck } from "./types";

const EXACT_PREFIX = "flag_if_not_exact:";
const GLOSS_AFTER_TOKEN = /^\s*[,\-–—]\s*(?:the\s+)?One\s+Universal\s+Integrative\s+Force/i;

// Resolution: exact spelling "IkOankar"; first use in the Sabad takes an apposition gloss (comma or dash).
export const term03Check: CodeCheck = {
  ruleId: "TERM-03",
  scope: "sabad",
  run(context) {
    const output: CheckOutput = { findings: [], candidates: [] };
    const { input, rule } = context;
    let firstUseSeen = false;

    for (const draft of inSabadOrder(input, context.drafts)) {
      for (const hit of scanPatterns(context.patterns, draft.text)) {
        const isTermPattern = hit.action.startsWith(EXACT_PREFIX);
        const exact = isTermPattern ? hit.action.slice(EXACT_PREFIX.length) : null;

        if (hit.action === "flag" || (exact !== null && hit.text !== exact)) {
          output.findings.push(makeFinding({
            input, draft, rule, start: hit.start, end: hit.end, tag: "spelling",
            explanation: `"${hit.text}" differs from the spelling TERM-03 specifies.`,
          }));
        } else if (!isDeterministic(hit.action)) {
          output.candidates.push({ ruleId: rule.id, draftId: draft.id, start: hit.start, end: hit.end, quoted_span: hit.text, patternIndex: hit.patternIndex });
        }

        if (isTermPattern && !firstUseSeen) {
          firstUseSeen = true;
          if (!GLOSS_AFTER_TOKEN.test(draft.text.slice(hit.end))) {
            output.findings.push(makeFinding({
              input, draft, rule, start: hit.start, end: hit.end, tag: "first-use-gloss",
              explanation: `First use of "${hit.text}" in this Sabad has no apposition gloss (comma or dash), which TERM-03 asks for at first use.`,
            }));
          }
        }
      }
    }
    return output;
  },
};
