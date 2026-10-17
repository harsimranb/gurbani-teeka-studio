import { CheckResultSchema, type CheckResult, type Draft, type Finding, type NotEvaluable, type Rule } from "../contracts/domain";

/**
 * MOCK ONLY. A tiny synthetic checker so the UI can exercise findings, spans, gates and decisions.
 * It matches a few fixed patterns; it is not the real engine and every explanation says so.
 * It never produces, rewrites or suggests translation text.
 */
export type MockPhase = "code" | "llm";

interface MockCheckDef { ruleId: string; layer: "L1" | "L2"; pattern: RegExp; describe: (quoted: string) => string }

const CODE_CHECKS: MockCheckDef[] = [
  { ruleId: "TERM-01", layer: "L1", pattern: /\b(Lord|God)s?\b/g, describe: (q) => `the text contains the capitalised term "${q}", which this mock check associates with rule TERM-01.` },
  { ruleId: "LAYER-07", layer: "L1", pattern: /\([^)]*\)|\[[^\]]*\]|[()[\]]/g, describe: (q) => `the text contains the bracket segment "${q}", which this mock check associates with rule LAYER-07.` },
  { ruleId: "LAYER-06", layer: "L1", pattern: /\b(thee|thou|thy|thine|unto|hath|doth|ye)\b/gi, describe: (q) => `the text contains the word "${q}" from a fixed mock list, which this mock check associates with rule LAYER-06.` },
];
const LLM_CHECKS: MockCheckDef[] = [
  { ruleId: "TERM-07", layer: "L2", pattern: /\bthe (Name|Word)\b/g, describe: (q) => `the text contains "${q}", which this mock check associates with rule TERM-07.` },
];
const FINDING_SEVERITIES = new Set(["error", "flag", "warning", "hint"]);

export const MOCK_PHASE_RULE_IDS: Record<MockPhase, string[]> = {
  code: CODE_CHECKS.map((c) => c.ruleId),
  llm: LLM_CHECKS.map((c) => c.ruleId),
};

export function mockFindingId(draft: Draft, rulesetVersion: number, ruleId: string, start: number): string {
  return `mock-f-${draft.id}-v${draft.version}-r${rulesetVersion}-${ruleId}-${start}`;
}

function isActiveP0(rule: Rule): boolean {
  return rule.status === "approved" && rule.resolution.active && rule.resolution.scope === "p0_check";
}

export function runMockChecks(drafts: Draft[], rules: Rule[], rulesetVersion: number, phase: MockPhase): CheckResult {
  const defs = phase === "code" ? CODE_CHECKS : LLM_CHECKS;
  const findings: Finding[] = [];
  for (const draft of drafts) {
    for (const def of defs) {
      const rule = rules.find((r) => r.id === def.ruleId);
      if (!rule || !isActiveP0(rule)) continue;
      const severity = rule.resolution.severity;
      if (!FINDING_SEVERITIES.has(severity)) continue;
      const pattern = new RegExp(def.pattern.source, def.pattern.flags);
      for (const match of draft.text.matchAll(pattern)) {
        const quoted = match[0];
        if (quoted.length === 0 || quoted.trim().length === 0) continue;
        const start = match.index ?? 0;
        findings.push({
          id: mockFindingId(draft, rulesetVersion, def.ruleId, start),
          draft_id: draft.id, draft_version: draft.version, ruleset_version: rulesetVersion,
          rule_id: def.ruleId, rule_version: rule.version, layer: def.layer,
          severity: severity as Finding["severity"],
          quoted_span: quoted, start, end: start + quoted.length,
          explanation: `Mock finding (synthetic, no real check ran): ${def.describe(quoted)}`,
          reference_ids: [], model: "mock-ui-stub", prompt_version: "mock-v0",
          state: "current", cleared_at: null,
        });
      }
    }
  }
  const evaluated = new Set([...MOCK_PHASE_RULE_IDS.code, ...MOCK_PHASE_RULE_IDS.llm]);
  const notEvaluable: NotEvaluable[] = rules
    .filter((rule) => isActiveP0(rule) && !evaluated.has(rule.id) && (rule.source !== "proposal" || phase === "llm"))
    .map((rule) => ({ ruleId: rule.id, reason: `Mock mode: no real ${phase} check ran for this rule.` }));
  return CheckResultSchema.parse({ findings, notEvaluable });
}
