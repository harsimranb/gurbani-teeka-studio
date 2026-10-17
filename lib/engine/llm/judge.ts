import { FindingSeveritySchema } from "../../contracts/domain";
import type { Draft, Finding, FindingBatch, Rule } from "../../contracts/domain";
import type { LlmJudge, LlmPacket } from "../checks/pipeline";
import { LlmSchemaError } from "./adapter";
import type { LlmClient } from "./adapter";
import { promptFor } from "./prompts";

const PENDING_ID = "llm-pending";
const SCHEMA_REASON = "model response did not match the review schema";
// A free-text rule is arbitrary, so the model's reason could describe the source's meaning; Eko writes it (hard rule 1).
const freeTextNotEvaluable = (rule: Rule) => `Rule ${rule.id} could not be evaluated for this unit.`;

/** Start/end of the nth (1-based) exact occurrence of `span` in `text`, or null. UTF-16, end-exclusive. */
export function locateOccurrence(text: string, span: string, occurrence: number): { start: number; end: number } | null {
  if (span.length === 0 || !Number.isInteger(occurrence) || occurrence < 1) return null;
  let from = 0;
  let start = -1;
  for (let seen = 0; seen < occurrence; seen++) {
    start = text.indexOf(span, from);
    if (start < 0) return null;
    from = start + 1;
  }
  return { start, end: start + span.length };
}

export interface ModelFindingArgs {
  draft: Draft; rule: Rule; rulesetVersion: number; layer: "L2" | "style"; severity: Finding["severity"];
  start: number; end: number; explanation: string; referenceIds: string[]; model: string; promptVersion: string;
  /** Becomes the `llm-pending:<tag>` placeholder ID so the engine keeps two checks on one span distinct. */
  tag?: string;
}

/** Unvalidated finding candidate; the engine replaces its ID and caps its severity, the validator checks its evidence. */
export function modelFinding(args: ModelFindingArgs): Finding {
  const tag = args.tag?.replace(/[^\w-]/g, "");
  return {
    id: tag ? `${PENDING_ID}:${tag}` : PENDING_ID, draft_id: args.draft.id, draft_version: args.draft.version, ruleset_version: args.rulesetVersion,
    rule_id: args.rule.id, rule_version: args.rule.version, layer: args.layer, severity: args.severity,
    quoted_span: args.draft.text.slice(args.start, args.end), start: args.start, end: args.end, explanation: args.explanation,
    reference_ids: args.referenceIds, model: args.model, prompt_version: args.promptVersion, state: "current", cleared_at: null,
  };
}

export const toFindingBatch = (findings: Finding[]): FindingBatch => ({ status: "evaluated", findings });
export const notEvaluableBatch = (reason: string): FindingBatch => ({ status: "not_evaluable", findings: [], reason });

function ruleSeverity(rule: Rule): Finding["severity"] {
  const parsed = FindingSeveritySchema.safeParse(rule.severity);
  return parsed.success ? parsed.data : "hint";
}

async function judgePacket(client: LlmClient, packet: LlmPacket): Promise<FindingBatch> {
  const { kind, rule, draft } = packet;
  const common = { draft, rule, rulesetVersion: packet.rulesetVersion, model: client.model };
  if (kind === "confirm") {
    const spec = promptFor("confirm");
    const { prompt, evidence } = spec.build(packet);
    const { output } = await client.generate({ schemaName: spec.schemaName, schema: spec.schema, system: spec.system, prompt, promptVersion: spec.version, evidence });
    const seen = new Set<number>();
    const findings: Finding[] = [];
    for (const decision of output.decisions) {
      const candidate = packet.candidates[decision.candidate_index];
      if (!candidate || decision.verdict !== "confirm" || seen.has(decision.candidate_index)) continue;
      seen.add(decision.candidate_index);
      findings.push(modelFinding({ ...common, layer: "L2", severity: ruleSeverity(rule), start: candidate.start, end: candidate.end, explanation: decision.explanation, referenceIds: [], promptVersion: spec.version }));
    }
    return toFindingBatch(findings);
  }
  const spec = promptFor(kind);
  const { prompt, evidence } = spec.build(packet);
  const { output } = await client.generate({ schemaName: spec.schemaName, schema: spec.schema, system: spec.system, prompt, promptVersion: spec.version, evidence });
  if (output.status === "not_evaluable") return notEvaluableBatch(kind === "free_text" ? freeTextNotEvaluable(rule) : output.reason.trim() || "model could not evaluate this unit");
  const allowed = new Set((packet.references ?? []).map((ranked) => ranked.reference.id));
  const exceptions = new Set((packet.references ?? []).filter((ranked) => ranked.exception || ranked.reference.exceptions.length > 0).map((ranked) => ranked.reference.id));
  const findings: Finding[] = [];
  for (const item of output.findings) {
    const at = locateOccurrence(draft.text, item.quoted_span, item.occurrence);
    if (!at) continue;
    if (kind === "term02") {
      // Only the two documented subchecks exist; attribute needs a code-found Divine name, collapse needs 3+ families (resolution).
      if (item.subcheck !== "attribute" && item.subcheck !== "collapse") continue;
      if (item.subcheck === "attribute" && packet.divineNames.length === 0) continue;
      if (item.subcheck === "collapse" && (packet.sabad?.distinctFamilies ?? 0) < 3) continue;
    }
    const style = kind === "style";
    // A style finding needs a non-exception reference; exception-marked ones may only be cited alongside it.
    const cited = [...new Set(item.reference_ids.filter((id) => allowed.has(id)))];
    const referenceIds = cited.some((id) => !exceptions.has(id)) ? cited : [];
    const severity = style ? "warning" : kind === "term02" && item.subcheck === "collapse" ? "warning" : ruleSeverity(rule);
    findings.push(modelFinding({
      ...common, layer: style ? "style" : "L2", severity, ...at, explanation: item.explanation, promptVersion: spec.version,
      referenceIds: style ? referenceIds : [], tag: kind === "term02" ? item.subcheck : undefined,
    }));
  }
  return toFindingBatch(findings);
}

/** Adapts the model client to the pipeline's judge: review verdicts in, strict `FindingBatch` out. */
export function createLlmJudge(client: LlmClient): LlmJudge {
  return async (packet) => {
    try {
      return await judgePacket(client, packet);
    } catch (error) {
      if (error instanceof LlmSchemaError) return notEvaluableBatch(SCHEMA_REASON);
      throw error;
    }
  };
}
