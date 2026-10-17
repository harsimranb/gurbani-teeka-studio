import { FindingSchema, FindingSeveritySchema } from "../../contracts/domain";
import type { CheckInput, Draft, Finding, Rule } from "../../contracts/domain";

export const CODE_MODEL = "eko-code";
export const CODE_PROMPT_VERSION = "code-v1";

export interface FindingArgs {
  input: Pick<CheckInput, "rulesetVersion">;
  draft: Draft;
  rule: Rule;
  start: number;
  end: number;
  explanation: string;
  /** Defaults to the resolved rule severity. */
  severity?: Finding["severity"];
  /** Distinguishes two findings of one rule on the same span (e.g. spelling vs first-use gloss). */
  tag?: string;
}

/** Deterministic code finding with exact UTF-16 span and stable ID. Neutral wording is the caller's job. */
export function makeFinding({ input, draft, rule, start, end, explanation, severity, tag }: FindingArgs): Finding {
  return FindingSchema.parse({
    id: `${rule.id}:${draft.id}:v${draft.version}:r${input.rulesetVersion}:${start}-${end}${tag ? `:${tag}` : ""}`,
    draft_id: draft.id, draft_version: draft.version, ruleset_version: input.rulesetVersion,
    rule_id: rule.id, rule_version: rule.version, layer: "L1",
    severity: severity ?? FindingSeveritySchema.parse(rule.severity),
    quoted_span: draft.text.slice(start, end), start, end, explanation, reference_ids: [],
    model: CODE_MODEL, prompt_version: CODE_PROMPT_VERSION, state: "current", cleared_at: null,
  });
}

/** Authored units ordered by their first source line's position in the Sabad. */
export function inSabadOrder(input: Pick<CheckInput, "sabad">, drafts: Draft[]): Draft[] {
  const position = new Map(input.sabad.lines.map((line, index) => [line.line_id, index]));
  const first = (draft: Draft) => Math.min(...draft.line_ids.map((id) => position.get(id) ?? Number.MAX_SAFE_INTEGER));
  return [...drafts].sort((a, b) => first(a) - first(b));
}
