import { makeFinding } from "./finding";
import type { CodeCheck } from "./types";

const grammarLine = (text: string): { value: string; start: number; end: number } => {
  const start = text.indexOf("\n");
  if (start < 0) return { value: "", start: 0, end: text.length };
  const end = text.indexOf("\n", start + 1);
  return { value: text.slice(start + 1, end < 0 ? undefined : end), start: start + 1, end: end < 0 ? text.length : end };
};

export const anno04Check: CodeCheck = {
  ruleId: "ANNO-04", scope: "unit",
  run({ input, rule, drafts }) {
    const findings = [];
    for (const draft of drafts) {
      if (draft.source_word_start === undefined) continue;
      const grammar = grammarLine(draft.text);
      const parts = grammar.value.split(";");
      if (parts.length === 2 && parts.every((part) => part.trim().length > 0)) continue;
      const start = grammar.value ? grammar.start : 0;
      const end = grammar.value ? grammar.end : draft.text.length;
      findings.push(makeFinding({ input, draft, rule, start, end,
        explanation: "The word annotation's grammar line needs one semicolon between the part-of-speech designation and its grammatical features." }));
    }
    return { findings, candidates: [] };
  },
};

export const anno05Check: CodeCheck = {
  ruleId: "ANNO-05", scope: "unit",
  run({ input, rule, drafts }) {
    const allowed = new Set((/word classes:\s*([^.]+)\./i.exec(rule.text)?.[1] ?? "")
      .split(",").flatMap((part) => part.trim().split(/\s+or\s+/i)).map((part) => part.trim().toLowerCase()).filter(Boolean));
    const findings = [];
    for (const draft of drafts) {
      if (draft.source_word_start === undefined) continue;
      const grammar = grammarLine(draft.text);
      const designation = grammar.value.split(";")[0]?.trim() ?? "";
      if (allowed.has(designation.toLowerCase())) continue;
      const relative = designation ? grammar.value.indexOf(designation) : -1;
      const start = relative >= 0 ? grammar.start + relative : (grammar.value ? grammar.start : 0);
      const end = relative >= 0 ? start + designation.length : (grammar.value ? grammar.end : draft.text.length);
      findings.push(makeFinding({ input, draft, rule, start, end,
        explanation: "The word annotation's part-of-speech designation is not one of the classes listed by ANNO-05." }));
    }
    return { findings, candidates: [] };
  },
};

export const anno08Check: CodeCheck = {
  ruleId: "ANNO-08", scope: "unit",
  run({ input, rule, drafts }) {
    const findings = [];
    for (const draft of drafts) {
      if (draft.source_word_start === undefined) continue;
      const first = draft.text.indexOf("\n");
      const second = first < 0 ? -1 : draft.text.indexOf("\n", first + 1);
      if (second < 0) continue;
      const end = draft.text.indexOf("\n", second + 1);
      const line = draft.text.slice(second + 1, end < 0 ? undefined : end);
      if (!line.trim()) continue;
      const entries = line.split(";");
      const valid = entries.every((entry, index) => {
        const trimmed = entry.trim();
        if (!trimmed) return false;
        const colon = entry.indexOf(":");
        // Each annotation starts with a labelled language; later semicolon segments may either
        // introduce another language or describe a change of meaning within the same language.
        if (colon <= 0) return index > 0;
        const forms = entry.slice(colon + 1).trim();
        return forms.length > 0 && !forms.includes(",") && forms.split("/").every((form) => form.trim().length > 0);
      });
      if (valid) continue;
      findings.push(makeFinding({ input, draft, rule, start: second + 1, end: end < 0 ? draft.text.length : end,
        explanation: "The supplied language-form line does not separate language labels, variants and changes of meaning as ANNO-08 specifies." }));
    }
    return { findings, candidates: [] };
  },
};
