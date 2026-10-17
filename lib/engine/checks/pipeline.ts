import pLimit from "p-limit";
import { z } from "zod";
import { CheckResultSchema, FindingBatchSchema, FindingSeveritySchema } from "../../contracts/domain";
import type { CheckInput, CheckResult, Draft, Finding, Line, NotEvaluable, Rule } from "../../contracts/domain";
import { divineNameFamilies, findDivineNames, tokenize } from "../gurmukhi";
import type { DivineNameHit } from "../gurmukhi";
import { passesReviewGuards } from "../llm/guards";
import { checkedRules, compilePrefilter } from "../rules";
import type { RankedReference, ReferenceIndex } from "../retrieval/types";
import { CODE_MODEL, inSabadOrder } from "./finding";
import { genericCheck, layer07Check, term01Check } from "./generic";
import { anno02Check } from "./anno02";
import { anno04Check, anno05Check, anno08Check } from "./annotation";
import { layer03Check } from "./layer03";
import { layer08Check } from "./layer08";
import { term03Check } from "./term03";
import { term07Check } from "./term07";
import { tran09Check, tran10Check, tran14Check } from "./translation";
import type { Candidate, CodeCheck } from "./types";
import { validateFindings } from "./validate";

// TERM-02 is judged only in the model phase from Gurmukhi-side evidence.
const CODE_CHECKS: CodeCheck[] = [
  genericCheck("PRIN-04"), term01Check, term03Check, genericCheck("TERM-04"), genericCheck("TERM-05"), term07Check, layer03Check, layer08Check, anno02Check, anno04Check, anno05Check, anno08Check, genericCheck("LAYER-06"), layer07Check, tran09Check, tran10Check, tran14Check,
];
const CODE_UNAVAILABLE: Record<string, string> = {
  // CHK-12 is cut until references carry explicit term mappings (OQ-17).
  "CONS-01": "Reference consistency is unavailable: no deterministic term-mapping check is implemented, so no CONS-01 finding is claimed.",
  "LAYER-03": "Only literal-layer parenthesis structure was checked; unmarked additions need source-word alignment and were not evaluated.",
  "ANNO-02": "The literal/implied semicolon was checked; comma boundaries between multiple literal meaning sets were not evaluated.",
  "LAYER-08": "Only similarity to an available human-authored literal was checked; source-line and Panjabi transcreation comparisons were not evaluated.",
  "ANNO-04": "The second-line separator was checked; completeness and correctness of grammatical features were not evaluated.",
  "ANNO-05": "The supplied part-of-speech label was checked against the allowed classes; its linguistic correctness was not evaluated.",
  "ANNO-08": "Separators in a supplied language-form line were checked; required source-language forms and quote references remain unevaluated.",
  "TRAN-14": "Only source numeral-to-Roman-digit correspondence is checked; pronunciation and other transcription conventions remain unevaluated.",
  "TRAN-09": "Only BaniDB tippi/bindī to Roman ṁ correspondence is checked; broader pronunciation rules remain unevaluated.",
  "TRAN-10": "Only BaniDB visarg to aḥ correspondence is checked; broader pronunciation rules remain unevaluated.",
};
const GENERIC_MODEL_RULES = new Set(["PRIN-01", "PRIN-06", "PRIN-07", "PRIN-08", "PRIN-09", "FLOW-07", "CONS-04", "LAYER-01", "LAYER-05", "LAYER-09",
  "ANNO-01", "ANNO-03", "ANNO-06", "ANNO-09", "ANNO-10"]);

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
  const active = new Set(checkedRules(input.rules, input.draft.layer).map((rule) => rule.id));
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
  for (const rule of checkedRules(input.rules, input.draft.layer)) {
    const checks = CODE_CHECKS.filter((check) => check.ruleId === rule.id);
    if (CODE_UNAVAILABLE[rule.id]) notEvaluable.push({ ruleId: rule.id, reason: CODE_UNAVAILABLE[rule.id] });
    if (checks.length === 0) {
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

export type LlmPacketKind = "confirm" | "term02" | "free_text" | "style";
export interface SabadUnitContext { draft_id: string; line_ids: string[]; text: string }

/** One model question: a rule, one authored unit, its source lines and the code-supplied evidence. */
export interface LlmPacket {
  kind: LlmPacketKind; rule: Rule; draft: Draft; lines: Line[]; rulesetVersion: number;
  /** `confirm`: prefilter hits for the model to confirm or reject. */
  candidates: Candidate[];
  /** `term02`: Divine-name hits in this unit's source lines. */
  divineNames: DivineNameHit[];
  /** `term02`: whole-Sabad context for the collapse detector. */
  sabad?: { units: SabadUnitContext[]; divineNames: DivineNameHit[]; distinctFamilies: number };
  /** `style`: retrieved references the model may cite. */
  references?: RankedReference[];
  /** Read-only literal evidence for cross-layer review such as LAYER-09. */
  relatedDrafts?: Draft[];
  /** The exact BaniDB word an annotation is about, with its source-line offsets. */
  sourceWord?: { lineId: string; surface: string; start: number; end: number };
}
/** Returns a strict review-only `FindingBatch`; it never returns translation text. */
export type LlmJudge = (packet: LlmPacket) => Promise<unknown>;
export interface LlmPhaseOptions { index?: ReferenceIndex; concurrency?: number }

// `FindingBatch` envelope with findings left for per-finding validation; unknown keys still reject.
const BatchEnvelopeSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("evaluated"), findings: z.array(z.unknown()) }),
  FindingBatchSchema.options[1],
]);

/** What a model-phase result replaces: changed units, plus Sabad-scoped model rules on every unit. */
export function llmPhaseScope(input: CheckInput): CodePhaseScope {
  const termRule = checkedRules(input.rules, input.draft.layer).some((rule) => rule.id === "TERM-02");
  return { draftIds: changedDrafts(input).map((draft) => draft.id), ruleIds: termRule ? ["TERM-02"] : [] };
}

interface PacketNote { ruleId: string; draftId: string; reason: string }

// `lookup: false` (no judge) builds reference-less style packets so no retrieval, and no embedder download, runs for nothing.
async function planLlmPhase(input: CheckInput, index?: ReferenceIndex, lookup = true): Promise<{ packets: LlmPacket[]; notes: PacketNote[] }> {
  const units = changedDrafts(input);
  const { candidates } = runCodePhase(input);
  const families = divineNameFamilies(input.rules);
  const lineById = new Map(input.sabad.lines.map((line) => [line.line_id, line]));
  const linesOf = (draft: Draft) => draft.line_ids.map((id) => lineById.get(id)).filter((line): line is Line => !!line);
  const base = (kind: LlmPacketKind, rule: Rule, draft: Draft): LlmPacket => {
    const lines = linesOf(draft);
    const sourceWord = draft.layer === "annotation" && draft.source_word_start !== undefined
      ? lines.flatMap((line) => tokenize(line.gurmukhi).map((token) => ({ lineId: line.line_id, ...token })))
        .find((token) => token.start === draft.source_word_start)
      : undefined;
    return {
      kind, rule, draft, lines, rulesetVersion: input.rulesetVersion, candidates: [], divineNames: [],
      relatedDrafts: rule.id === "LAYER-09"
        ? (input.relatedDrafts ?? []).filter((other) => other.layer === "literal" && other.line_ids.some((id) => draft.line_ids.includes(id)))
        : [],
      ...(sourceWord ? { sourceWord: { lineId: sourceWord.lineId, surface: sourceWord.surface, start: sourceWord.start, end: sourceWord.end } } : {}),
    };
  };
  const packets: LlmPacket[] = [];
  const notes: PacketNote[] = [];
  for (const rule of checkedRules(input.rules, input.draft.layer)) {
    if (rule.id === "TERM-02") {
      const everyUnit = inSabadOrder(input, input.sabadDrafts);
      const sabadHits = input.sabad.lines.flatMap((line) => findDivineNames(line, families));
      const distinctFamilies = new Set(sabadHits.map((hit) => hit.family)).size;
      const sabad = { units: everyUnit.map((draft) => ({ draft_id: draft.id, line_ids: draft.line_ids, text: draft.text })), divineNames: sabadHits, distinctFamilies };
      for (const draft of everyUnit) {
        const packet = base("term02", rule, draft);
        packet.divineNames = packet.lines.flatMap((line) => findDivineNames(line, families));
        if (packet.divineNames.length > 0 || distinctFamilies >= 3) packets.push({ ...packet, sabad });
      }
    } else if (rule.id === "CONS-01") {
      for (const draft of units) {
        if (!lookup) { packets.push(base("style", rule, draft)); continue; }
        if (!index) { notes.push({ ruleId: rule.id, draftId: draft.id, reason: "reference index not configured." }); continue; }
        const packet = base("style", rule, draft);
        const found = await index.lookup({ draft, lines: packet.lines, sabad: input.sabad, references: input.references });
        const references = [...found.ordinary, ...found.exceptions];
        if (references.length === 0) notes.push({ ruleId: rule.id, draftId: draft.id, reason: "no applicable reference; style comparison not run." });
        else packets.push({ ...packet, references });
      }
    } else if (rule.source === "proposal" || GENERIC_MODEL_RULES.has(rule.id)) {
      for (const draft of units) {
        const packet = base("free_text", rule, draft);
        if (["ANNO-01", "ANNO-03", "ANNO-06", "ANNO-09", "ANNO-10"].includes(rule.id) && !packet.sourceWord) {
          notes.push({ ruleId: rule.id, draftId: draft.id, reason: "the annotation source-word offset does not resolve to a BaniDB token." });
        } else if (rule.id === "LAYER-09" && !draft.line_ids.every((lineId) => packet.relatedDrafts?.some((literal) =>
          literal.text.trim().length > 0 && literal.line_ids.includes(lineId)))) {
          notes.push({ ruleId: rule.id, draftId: draft.id, reason: "a related literal layer does not cover every line in the transcreation unit." });
        } else packets.push(packet);
      }
    } else {
      for (const draft of units) {
        const own = candidates.filter((candidate) => candidate.ruleId === rule.id && candidate.draftId === draft.id);
        if (own.length > 0) packets.push({ ...base("confirm", rule, draft), candidates: own });
      }
    }
  }
  return { packets, notes };
}

export async function llmPackets(input: CheckInput, options: { index?: ReferenceIndex } = {}): Promise<LlmPacket[]> {
  return (await planLlmPhase(input, options.index)).packets;
}

/**
 * CHK-11: model phase over changed units (TERM-02: every unit). Without a judge (no model adapter),
 * every rule with work to judge reports `notEvaluable`; nothing is fabricated. Judge errors propagate
 * so the caller can mark the phase failed and retry.
 */
export async function runLlmPhase(input: CheckInput, judge?: LlmJudge, options: LlmPhaseOptions = {}): Promise<CheckResult> {
  const { packets, notes } = await planLlmPhase(input, options.index, !!judge);
  const reasons = new Map<string, string[]>();
  const add = (ruleId: string, draftId: string, reason: string) => reasons.set(ruleId, [...(reasons.get(ruleId) ?? []), `${draftId}: ${reason}`]);
  const note = (packet: LlmPacket, reason: string) => add(packet.rule.id, packet.draft.id, reason);
  for (const entry of notes) add(entry.ruleId, entry.draftId, entry.reason);
  const findings: Finding[] = [];
  if (!judge) {
    for (const packet of packets) note(packet, "model check not run; no model adapter is configured.");
  } else {
    const limit = pLimit(options.concurrency ?? 4);
    const batches = await Promise.all(packets.map((packet) => limit(async () => ({ packet, batch: BatchEnvelopeSchema.safeParse(await judge(packet)) }))));
    for (const { packet, batch } of batches) {
      if (!batch.success) { note(packet, "model response did not match the review schema and was discarded."); continue; }
      const quotes = allowedQuotes(packet);
      if (batch.data.status === "not_evaluable") {
        const { reason } = batch.data;
        note(packet, reason.length <= MAX_REASON && passesReviewGuards(reason, quotes) ? reason : REASON_WITHHELD);
        continue;
      }
      // Each finding is validated on its own (CHK-09), so one bad span cannot discard valid ones.
      // Placeholder IDs repeat within a batch, so validate one at a time; real IDs are deduped below.
      const valid = batch.data.findings.flatMap((finding) => validateFindings([finding], input))
        .filter((finding) => finding.rule_id === packet.rule.id && finding.draft_id === packet.draft.id && finding.model !== CODE_MODEL);
      const own = valid.filter((finding) => passesReviewGuards(finding.explanation, quotes))
        // A free-text rule is arbitrary, so the model's explanation could describe the source's meaning; Eko writes it (hard rule 1).
        .map((finding) => ownModelFinding(packet.kind === "free_text" ? { ...finding, explanation: `The draft differs from rule ${packet.rule.id}.` } : finding, packet.rule, input));
      findings.push(...own);
      const invalid = batch.data.findings.length - valid.length;
      if (invalid > 0) note(packet, `${invalid} model finding(s) failed evidence validation and were dropped.`);
      const guarded = valid.length - own.length;
      if (guarded > 0) note(packet, `${guarded} model finding(s) failed the neutral-wording and no-rewrite guards and were dropped.`);
    }
  }
  return CheckResultSchema.parse({
    findings: validateFindings(findings, input),
    notEvaluable: [...reasons].map(([ruleId, list]) => ({ ruleId, reason: list.join(" ") })),
  });
}

const MAX_REASON = 300;
const REASON_WITHHELD = "model reported this unit not evaluable; its reason was withheld by the review guards.";

/** Text a model explanation may quote: this unit's draft, the rule and its application, and the source lines. */
/** Text a model explanation may quote: the packet evidence (exported for tests). */
export function allowedQuotes(packet: LlmPacket): string[] {
  // A Sabad-wide packet (TERM-02 collapse) also shows the model other units' Divine-name surfaces from BaniDB.
  const sabadNames = packet.sabad?.divineNames.map((hit) => hit.token.surface) ?? [];
  return [packet.draft.text, packet.rule.text, packet.rule.resolution.decision ?? "", ...packet.lines.map((line) => line.gurmukhi), ...(packet.relatedDrafts ?? []).map((draft) => draft.text), ...sabadNames];
}

const SEVERITY_RANK = { hint: 0, warning: 1, flag: 2, error: 3 } as const;

// A judge may mark `llm-pending:<subcheck>` so two checks on one span keep distinct IDs.
function tag(id: string): string {
  const match = /^llm-pending:([\w-]+)$/.exec(id);
  return match ? `:${match[1]}` : "";
}

// The engine owns identity and severity: a model can lower but never raise the resolved severity.
function ownModelFinding(finding: Finding, rule: Rule, input: CheckInput): Finding {
  const parsed = FindingSeveritySchema.safeParse(rule.severity);
  const ruleSeverity = parsed.success ? parsed.data : "hint";
  const severity = SEVERITY_RANK[finding.severity] > SEVERITY_RANK[ruleSeverity] ? ruleSeverity : finding.severity;
  return {
    ...finding, severity, layer: finding.layer === "L1" ? "L2" : finding.layer,
    id: `llm:${rule.id}:${finding.draft_id}:v${finding.draft_version}:r${input.rulesetVersion}:${finding.start}-${finding.end}${tag(finding.id)}`,
  };
}

/** True for deterministic code-phase findings, the only ones a code-phase result replaces. */
export function isCodeFinding(finding: Pick<Finding, "model">): boolean {
  return finding.model === CODE_MODEL;
}
