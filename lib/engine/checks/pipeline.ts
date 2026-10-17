import pLimit from "p-limit";
import { z } from "zod";
import { CheckResultSchema, FindingBatchSchema, FindingSeveritySchema } from "../../contracts/domain";
import type { CheckInput, CheckResult, Draft, Finding, Line, NotEvaluable, Rule } from "../../contracts/domain";
import { divineNameFamilies, findDivineNames } from "../gurmukhi";
import type { DivineNameHit } from "../gurmukhi";
import { checkedRules, compilePrefilter } from "../rules";
import { CODE_MODEL, inSabadOrder } from "./finding";
import { genericCheck, layer07Check, term01Check } from "./generic";
import { term03Check } from "./term03";
import { term07Check } from "./term07";
import type { Candidate, CodeCheck } from "./types";
import { validateFindings } from "./validate";

// TERM-02 is judged only in the model phase from Gurmukhi-side evidence.
const CODE_CHECKS: CodeCheck[] = [
  genericCheck("PRIN-04"), term01Check, term03Check, term07Check, genericCheck("LAYER-06"), layer07Check,
];
const CODE_UNAVAILABLE: Record<string, string> = {
  // CHK-12 is cut until references carry explicit term mappings (OQ-17).
  "CONS-01": "Reference consistency is unavailable: no deterministic term-mapping check is implemented, so no CONS-01 finding is claimed.",
};

/** Units whose source lines changed, plus the selected draft. */
export function changedDrafts(input: CheckInput): Draft[] {
  const changed = new Set(input.changedLineIds);
  return inSabadOrder(input, input.sabadDrafts.filter((draft) => draft.id === input.draft.id || draft.line_ids.some((id) => changed.has(id))));
}

/**
 * What a code-phase result replaces, among code findings only (`isCodeFinding`): every rule's
 * findings on `draftIds`, plus `ruleIds`' findings on every unit of the Sabad (their result
 * depends on other units, e.g. first use). Model findings are replaced only by the model phase.
 * Findings on draft IDs absent from `sabadDrafts` (removed or regrouped units) are stale.
 */
export interface CodePhaseScope { draftIds: string[]; ruleIds: string[] }

export function codePhaseScope(input: CheckInput): CodePhaseScope {
  const active = new Set(checkedRules(input.rules).map((rule) => rule.id));
  return {
    draftIds: changedDrafts(input).map((draft) => draft.id),
    ruleIds: [...new Set(CODE_CHECKS.filter((check) => check.scope === "sabad" && active.has(check.ruleId)).map((check) => check.ruleId))],
  };
}

export function runCodePhase(input: CheckInput): { result: CheckResult; candidates: Candidate[]; scope: CodePhaseScope } {
  const scope = codePhaseScope(input);
  const units = changedDrafts(input);
  const everyUnit = inSabadOrder(input, input.sabadDrafts);
  const findings: Finding[] = [];
  const candidates: Candidate[] = [];
  const notEvaluable: NotEvaluable[] = [];
  for (const rule of checkedRules(input.rules)) {
    const checks = CODE_CHECKS.filter((check) => check.ruleId === rule.id);
    if (checks.length === 0) {
      if (CODE_UNAVAILABLE[rule.id]) notEvaluable.push({ ruleId: rule.id, reason: CODE_UNAVAILABLE[rule.id] });
      continue;
    }
    const patterns = compilePrefilter(rule);
    const drafts = scope.ruleIds.includes(rule.id) ? everyUnit : units;
    for (const check of checks) {
      const output = check.run({ input, rule, patterns, drafts });
      findings.push(...output.findings);
      candidates.push(...output.candidates);
    }
  }
  return { result: CheckResultSchema.parse({ findings: validateFindings(findings, input), notEvaluable }), candidates, scope };
}

/** One model question: a rule, one authored unit, its source lines and the code-supplied evidence. */
export interface LlmPacket { rule: Rule; draft: Draft; lines: Line[]; candidates: Candidate[]; divineNames: DivineNameHit[] }
/** Returns a strict review-only `FindingBatch`; it never returns translation text. */
export type LlmJudge = (packet: LlmPacket) => Promise<unknown>;

// `FindingBatch` envelope with findings left for per-finding validation; unknown keys still reject.
const BatchEnvelopeSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("evaluated"), findings: z.array(z.unknown()) }),
  FindingBatchSchema.options[1],
]);

export function llmPackets(input: CheckInput): LlmPacket[] {
  const units = changedDrafts(input);
  const { candidates } = runCodePhase(input);
  const families = divineNameFamilies(input.rules);
  const lineById = new Map(input.sabad.lines.map((line) => [line.line_id, line]));
  const packets: LlmPacket[] = [];
  for (const rule of checkedRules(input.rules)) {
    for (const draft of units) {
      const lines = draft.line_ids.map((id) => lineById.get(id)).filter((line): line is Line => !!line);
      const own = candidates.filter((candidate) => candidate.ruleId === rule.id && candidate.draftId === draft.id);
      const divineNames = rule.id === "TERM-02" ? lines.flatMap((line) => findDivineNames(line, families)) : [];
      if (own.length > 0 || divineNames.length > 0) packets.push({ rule, draft, lines, candidates: own, divineNames });
    }
  }
  return packets;
}

/**
 * CHK-11: model phase over changed units only. Without a judge (LLM-01 pending), every rule
 * with work to confirm reports `notEvaluable`; nothing is fabricated. Judge errors propagate
 * so the caller can mark the phase failed and retry.
 */
export async function runLlmPhase(input: CheckInput, judge?: LlmJudge, concurrency = 4): Promise<CheckResult> {
  const packets = llmPackets(input);
  const reasons = new Map<string, string[]>();
  const note = (packet: LlmPacket, reason: string) => reasons.set(packet.rule.id, [...(reasons.get(packet.rule.id) ?? []), `${packet.draft.id}: ${reason}`]);
  const findings: Finding[] = [];
  if (!judge) {
    for (const packet of packets) note(packet, "model check not run; no model adapter is configured (LLM-01 pending).");
  } else {
    const limit = pLimit(concurrency);
    const batches = await Promise.all(packets.map((packet) => limit(async () => ({ packet, batch: BatchEnvelopeSchema.safeParse(await judge(packet)) }))));
    for (const { packet, batch } of batches) {
      if (!batch.success) { note(packet, "model response did not match the review schema and was discarded."); continue; }
      if (batch.data.status === "not_evaluable") { note(packet, batch.data.reason); continue; }
      // Each finding is validated on its own (CHK-09), so one bad span cannot discard valid ones.
      const own = validateFindings(batch.data.findings, input)
        .filter((finding) => finding.rule_id === packet.rule.id && finding.draft_id === packet.draft.id && finding.model !== CODE_MODEL)
        .map((finding) => ownModelFinding(finding, packet.rule, input));
      findings.push(...own);
      const dropped = batch.data.findings.length - own.length;
      if (dropped > 0) note(packet, `${dropped} model finding(s) failed evidence validation and were dropped.`);
    }
  }
  return CheckResultSchema.parse({
    findings: validateFindings(findings, input),
    notEvaluable: [...reasons].map(([ruleId, list]) => ({ ruleId, reason: list.join(" ") })),
  });
}

const SEVERITY_RANK = { hint: 0, warning: 1, flag: 2, error: 3 } as const;

// The engine owns identity and severity: a model can lower but never raise the resolved severity.
function ownModelFinding(finding: Finding, rule: Rule, input: CheckInput): Finding {
  const ruleSeverity = FindingSeveritySchema.parse(rule.severity);
  const severity = SEVERITY_RANK[finding.severity] > SEVERITY_RANK[ruleSeverity] ? ruleSeverity : finding.severity;
  return {
    ...finding, severity, layer: finding.layer === "L1" ? "L2" : finding.layer,
    id: `llm:${rule.id}:${finding.draft_id}:v${finding.draft_version}:r${input.rulesetVersion}:${finding.start}-${finding.end}`,
  };
}

/** True for deterministic code-phase findings, the only ones a code-phase result replaces. */
export function isCodeFinding(finding: Pick<Finding, "model">): boolean {
  return finding.model === CODE_MODEL;
}
