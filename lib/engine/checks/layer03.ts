import { makeFinding } from "./finding";
import type { CodeCheck } from "./types";

/** Checks only literal-layer parenthesis structure; source alignment is a separate semantic question. */
export const layer03Check: CodeCheck = {
  ruleId: "LAYER-03", scope: "unit",
  run({ input, rule, drafts }) {
    const findings = [];
    for (const draft of drafts) {
      const opens: number[] = [];
      const bad: Array<{ start: number; end: number }> = [];
      for (let i = 0; i < draft.text.length; i += 1) {
        if (draft.text[i] === "(") opens.push(i);
        else if (draft.text[i] === ")") {
          const start = opens.pop();
          if (start === undefined) bad.push({ start: i, end: i + 1 });
          else if (i === start + 1) bad.push({ start, end: i + 1 });
        }
      }
      for (const start of opens) bad.push({ start, end: start + 1 });
      for (const span of bad.sort((a, b) => a.start - b.start)) {
        findings.push(makeFinding({ input, draft, rule, ...span,
          explanation: "The highlighted literal-layer parentheses are unmatched or empty; the rule's addition marking cannot be read reliably." }));
      }
    }
    return { findings, candidates: [] };
  },
};
