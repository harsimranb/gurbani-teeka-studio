import pLimit from "p-limit";
import { DriftResultSchema, FindingBatchSchema, RuleSchema } from "../../contracts/domain";
import type { Draft, DriftContext, DriftResult, Proposal, Reference, Rule } from "../../contracts/domain";
import type { LlmPacket } from "../checks/pipeline";
import { validateFindings } from "../checks/validate";
import { LlmSchemaError } from "../llm/adapter";
import type { LlmClient } from "../llm/adapter";
import { passesReviewGuards } from "../llm/guards";
import { createLlmJudge } from "../llm/judge";
import { driftGlossaryPrompt, driftRelationsPrompt } from "../llm/prompts/drift";

type Check = DriftResult["assessment"]["check"];
type Outcome = "pass" | "warn" | "block";
interface Evidence { rule_ids: string[]; reference_ids: string[]; affected_line_ids: string[]; affected_count: number; source_counts: { sikhri_sample: number; published: number } }
type Verdict = { outcome: Outcome; reason: string; evidence: Evidence } | { notEvaluable: string };

const NO_MODEL = "no model configured; drift check not run";
const NO_GLOSSARY = "no glossary source; glossary collision not checked (OQ-13)";
const NO_REFERENCES = "no approved references to replay against";
const WITHHELD = "model reason withheld: it failed the neutral-wording and no-rewrite guards";
const REPLAY_CONCURRENCY = 4;
const unique = (values: string[]) => [...new Set(values)];
const noEvidence = (ids: Partial<Pick<Evidence, "rule_ids" | "reference_ids">> = {}): Evidence => ({ rule_ids: [], reference_ids: [], affected_line_ids: [], affected_count: 0, source_counts: { sikhri_sample: 0, published: 0 }, ...ids });
const safeReason = (reason: string, allowedQuotes: string[]) => (reason.trim() && passesReviewGuards(reason, allowedQuotes) ? reason.trim() : WITHHELD);

function result(proposal: Proposal, check: Check, verdict: Verdict): DriftResult {
  const assessment = "notEvaluable" in verdict
    ? { status: "not_evaluable" as const, check, reason: verdict.notEvaluable }
    : { status: "evaluated" as const, check, outcome: verdict.outcome, reason: verdict.reason, evidence: verdict.evidence };
  return DriftResultSchema.parse({ id: `drift:${proposal.id}:${check}`, proposal_id: proposal.id, assessment, override: null });
}

/** Contradiction, duplicate and scope-change come from one model call that labels every approved rule against the proposal. */
async function relationsChecks(client: LlmClient, proposal: Proposal, rules: Rule[]): Promise<Record<"contradiction" | "duplicate" | "scope_change", Verdict>> {
  const clear = (what: string): Verdict => ({ outcome: "pass", reason: `No approved rule ${what} (${rules.length} compared).`, evidence: noEvidence() });
  if (rules.length === 0) {
    const none: Verdict = { outcome: "pass", reason: "No approved rules to compare against.", evidence: noEvidence() };
    return { contradiction: none, duplicate: none, scope_change: none };
  }
  const spec = driftRelationsPrompt;
  const { prompt, evidence } = spec.build({ proposal, rules });
  let relations;
  try {
    ({ output: { relations } } = await client.generate({ schemaName: spec.schemaName, schema: spec.schema, system: spec.system, prompt, promptVersion: spec.version, evidence }));
  } catch (error) {
    if (!(error instanceof LlmSchemaError)) throw error;
    const failed: Verdict = { notEvaluable: "model response did not match the review schema" };
    return { contradiction: failed, duplicate: failed, scope_change: failed };
  }
  const known = new Set(rules.map((rule) => rule.id));
  const labelled = relations.filter((relation) => known.has(relation.rule_id));
  const covered = new Set(labelled.map((relation) => relation.rule_id));
  const missing = [...known].filter((id) => !covered.has(id));
  if (missing.length > 0) {
    const shown = missing.slice(0, 10).join(", ");
    const incomplete: Verdict = { notEvaluable: `model labelled ${known.size - missing.length} of ${known.size} compared rule(s); ${missing.length} missing: ${shown}${missing.length > 10 ? ", ..." : ""}` };
    return { contradiction: incomplete, duplicate: incomplete, scope_change: incomplete };
  }
  const quotes = [proposal.rule_text, proposal.example, ...rules.map((rule) => rule.text)];
  const verdict = (labels: string[], outcome: Outcome, what: string): Verdict => {
    const hits = labelled.filter((relation) => labels.includes(relation.label));
    if (hits.length === 0) return clear(`was labelled ${what}`);
    const ids = unique(hits.map((hit) => hit.rule_id));
    const reason = `Proposed rule ${what} approved rule ${ids.join(", ")}: ${hits.map((hit) => `${hit.rule_id}: ${safeReason(hit.reason, quotes)}`).join(" ")}`;
    return { outcome, reason, evidence: noEvidence({ rule_ids: ids }) };
  };
  return {
    contradiction: verdict(["contradicts"], "block", "contradicts"),
    duplicate: verdict(["duplicates"], "warn", "duplicates"),
    scope_change: verdict(["narrows", "broadens"], "warn", "narrows or broadens"),
  };
}

function temporaryRule(proposal: Proposal): Rule {
  return RuleSchema.parse({
    id: `proposal:${proposal.id}`, text: proposal.rule_text, level: "SHOULD", layers: ["transcreation"], plan: "free_text_llm", severity: "warning", decision: null,
    version: 1, status: "approved", source: "proposal", source_tag: "proposal", prefilter: null,
    resolution: { active: true, scope: "p0_check", severity: "warning", blocks_publish: false, layers: ["transcreation"], conditional: null, decision: null },
    provenance: { actor: proposal.author, reason: proposal.reason, at: proposal.at },
  });
}

/** `true` affected, `false` not affected, `null` the model could not evaluate this reference. */
async function replayOne(client: LlmClient, rule: Rule, reference: Reference, proposal: Proposal, context: DriftContext): Promise<boolean | null> {
  const draft: Draft = { id: `ref:${reference.id}`, shabad_id: "drift-replay", line_ids: reference.line_ids, layer: "transcreation", text: reference.english, author: "drift-replay", status: "published", version: 1, updated_at: proposal.at };
  const packet: LlmPacket = { kind: "free_text", rule, draft, lines: [], candidates: [], divineNames: [], rulesetVersion: context.rulesetVersion };
  const batch = FindingBatchSchema.safeParse(await createLlmJudge(client)(packet));
  if (!batch.success || batch.data.status === "not_evaluable") return null;
  const surviving = validateFindings(batch.data.findings, { draft, sabadDrafts: [draft], rules: [rule], rulesetVersion: context.rulesetVersion, references: context.references });
  const quotes = [reference.english, rule.text, proposal.example];
  return surviving.some((finding) => finding.rule_id === rule.id && passesReviewGuards(finding.explanation, quotes));
}

/** D-63 block at one affected reference; D-69 per-source unique lines plus their union. */
async function replayCheck(client: LlmClient, proposal: Proposal, context: DriftContext): Promise<Verdict> {
  const references = [...new Map(context.references.map((reference) => [reference.id, reference])).values()];
  if (references.length === 0) return { notEvaluable: NO_REFERENCES };
  const rule = temporaryRule(proposal);
  const limit = pLimit(REPLAY_CONCURRENCY);
  const outcomes = await Promise.all(references.map((reference) => limit(() => replayOne(client, rule, reference, proposal, context))));
  const unevaluable = outcomes.filter((outcome) => outcome === null).length;
  if (unevaluable === references.length) return { notEvaluable: `model could not evaluate any of the ${references.length} approved reference(s)` };
  const affected = references.filter((_, index) => outcomes[index] === true);
  if (affected.length === 0 && unevaluable > 0) return { notEvaluable: `${unevaluable} of ${references.length} approved reference(s) could not be evaluated and none of the other ${references.length - unevaluable} would be flagged; replay is incomplete` };
  const lines = (source?: Reference["source"]) => unique(affected.filter((reference) => !source || reference.source === source).flatMap((reference) => reference.line_ids));
  const evidence: Evidence = {
    rule_ids: [], reference_ids: affected.map((reference) => reference.id), affected_line_ids: lines(), affected_count: lines().length,
    source_counts: { sikhri_sample: lines("sikhri_sample").length, published: lines("published").length },
  };
  const note = unevaluable > 0 ? ` ${unevaluable} reference(s) could not be evaluated and are not counted.` : "";
  const label = references.some((reference) => reference.source === "sikhri_sample") ? "" : " This evidence is Eko-published approved work only; it is not SikhRI's historical corpus.";
  if (affected.length === 0) return { outcome: "pass", reason: `No approved reference would be flagged (${references.length - unevaluable} of ${references.length} evaluated).${note}${label}`, evidence };
  const reason = `${affected.length} of ${references.length} approved reference(s) would be flagged, covering ${evidence.affected_count} unique source line(s): ${evidence.source_counts.sikhri_sample} from sikhri_sample, ${evidence.source_counts.published} from published (sources may overlap).${note}${label}`;
  return { outcome: "block", reason, evidence };
}

async function glossaryCheck(client: LlmClient, proposal: Proposal, context: DriftContext): Promise<Verdict> {
  const glossary = context.glossary;
  if (glossary === null) return { notEvaluable: NO_GLOSSARY };
  if (glossary.length === 0) return { notEvaluable: "glossary has no entries; glossary collision not checked (OQ-13)" };
  const spec = driftGlossaryPrompt;
  const { prompt, evidence } = spec.build({ proposal, glossary });
  let collisions;
  try {
    ({ output: { collisions } } = await client.generate({ schemaName: spec.schemaName, schema: spec.schema, system: spec.system, prompt, promptVersion: spec.version, evidence }));
  } catch (error) {
    if (error instanceof LlmSchemaError) return { notEvaluable: "model response did not match the review schema" };
    throw error;
  }
  const known = new Set(glossary.map((entry) => entry.source_id));
  const quotes = [proposal.rule_text, proposal.example, ...glossary.flatMap((entry) => [entry.term, entry.preferred_rendering])];
  const hits = collisions.filter((collision) => known.has(collision.source_id));
  if (hits.length === 0) return { outcome: "pass", reason: `No glossary entry collides with the proposed rule (${glossary.length} compared).`, evidence: noEvidence() };
  const ids = unique(hits.map((hit) => hit.source_id));
  // Glossary source IDs ride in `reference_ids`: the contract has no separate glossary-entry field.
  return { outcome: "block", reason: `Proposed rule differs from preferred rendering(s) in glossary source ${ids.join(", ")}: ${hits.map((hit) => `${hit.source_id}: ${safeReason(hit.reason, quotes)}`).join(" ")}`, evidence: noEvidence({ reference_ids: ids }) };
}

/** LLM-10/11. Always five schema-valid results; without a model every model-backed check is `not_evaluable`, never a pass. */
export async function runDrift(proposal: Proposal, context: DriftContext, deps: { client: LlmClient | null }): Promise<DriftResult[]> {
  const { client } = deps;
  const none: Verdict = { notEvaluable: NO_MODEL };
  const approved = context.rules.filter((rule) => rule.status === "approved" && rule.resolution.active);
  const [relations, replay, glossary] = client
    ? await Promise.all([relationsChecks(client, proposal, approved), replayCheck(client, proposal, context), glossaryCheck(client, proposal, context)])
    : [{ contradiction: none, duplicate: none, scope_change: none }, none, context.glossary === null ? { notEvaluable: NO_GLOSSARY } : none];
  return [
    result(proposal, "contradiction", relations.contradiction),
    result(proposal, "reference_replay", replay),
    result(proposal, "glossary_collision", glossary),
    result(proposal, "duplicate", relations.duplicate),
    result(proposal, "scope_change", relations.scope_change),
  ];
}
