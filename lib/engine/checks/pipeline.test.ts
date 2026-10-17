import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CheckInputSchema, CheckResultSchema, DriftResultSchema, SabadSchema, findingMatchesInput } from "../../contracts/domain";
import type { Finding, Rule } from "../../contracts/domain";
import { proposalFixture, rulesFixture } from "../../contracts/fixtures";
import { codePhaseScope, createEngine } from "../index";
import type { EngineOptions } from "../index";
import { createReferenceIndex } from "../retrieval";
import type { ReferenceIndex } from "../retrieval/types";
import { allowedQuotes, llmPackets, llmPhaseScope, runLlmPhase } from "./pipeline";
import { passesReviewGuards } from "../llm/guards";
import { tokenize } from "../gurmukhi";
import type { LlmPacket } from "./pipeline";
import { syntheticInput } from "./test-helpers";

// Offline: no model client from the environment and no embedding download.
const offline = (options: EngineOptions = {}) => createEngine({ client: null, index: createReferenceIndex({ embedder: null }), ...options });
const engine = offline();

const PLANTED = ["The Lord sustains all (always).", "IkOankar pervades everything.", "Thou art the Giver."];

describe("CHK-10 code phase", () => {
  it("checks changed units for every rule and Sabad-scoped rules on every unit", async () => {
    const input = syntheticInput(PLANTED, { changed: [0] });
    expect(codePhaseScope(input)).toEqual({ draftIds: ["synthetic-draft-1"], ruleIds: ["TERM-03", "TERM-07"] });
    const result = CheckResultSchema.parse(await engine.runChecks(input, "code"));
    const byRule = (id: string) => result.findings.filter((finding) => finding.rule_id === id);
    expect(byRule("TERM-01").map((finding) => finding.quoted_span)).toEqual(["Lord"]);
    expect(byRule("LAYER-07").map((finding) => [finding.quoted_span, finding.severity])).toEqual([["(", "error"], [")", "error"]]);
    expect(byRule("TERM-03").map((finding) => finding.draft_id)).toEqual(["synthetic-draft-2"]);
    expect(byRule("LAYER-06")).toEqual([]); // unit 3 unchanged: unit-scoped rules don't re-check it
    expect(result.findings.every((finding) => findingMatchesInput(finding, input) && finding.model === "eko-code")).toBe(true);
    expect(result.notEvaluable.map((entry) => entry.ruleId)).toEqual(["CONS-01"]);
  });

  it("an earlier unit's first use clears a later unit's gloss finding", async () => {
    const input = syntheticInput(["IkOankar, One Universal Integrative Force, is everywhere.", "IkOankar pervades everything."], { changed: [0] });
    const result = await engine.runChecks(input, "code");
    expect(result.findings.filter((finding) => finding.rule_id === "TERM-03")).toEqual([]);
  });

  it("uses the input ruleset/rule versions and skips inactive rules", async () => {
    const rules = rulesFixture.map((rule) => rule.id === "TERM-01" ? { ...rule, resolution: { ...rule.resolution, active: false } } : rule.id === "LAYER-07" ? { ...rule, version: 3 } : rule);
    const input = syntheticInput([PLANTED[0]], { rules, rulesetVersion: 2 });
    const result = await engine.runChecks(input, "code");
    expect(result.findings.some((finding) => finding.rule_id === "TERM-01")).toBe(false);
    expect(result.findings.filter((finding) => finding.rule_id === "LAYER-07").every((finding) => finding.rule_version === 3 && finding.ruleset_version === 2)).toBe(true);
  });

  it("finds exact spans inside a grouped draft", async () => {
    const base = syntheticInput(["placeholder", "placeholder"]);
    const grouped = { ...base.sabadDrafts[0], line_ids: base.sabad.lines.map((line) => line.line_id), text: "Remembering God, the mind (at last) is still." };
    const input = CheckInputSchema.parse({ ...base, draft: grouped, sabadDrafts: [grouped], changedLineIds: grouped.line_ids });
    const result = await engine.runChecks(input, "code");
    expect(result.findings.map((finding) => [finding.rule_id, finding.quoted_span, finding.start])).toEqual([["TERM-01", "God", 12], ["LAYER-07", "(", 26], ["LAYER-07", ")", 34]]);
  });
});

describe("CHK-11 model phase", () => {
  const input = syntheticInput(["This is the only correct translation of the line.", "Remembering the gods, the mind becomes still."]);

  it("reports per-rule notEvaluable without a judge and fabricates nothing", async () => {
    const result = await engine.runChecks(input, "llm");
    expect(result.findings).toEqual([]);
    expect(result.notEvaluable.map((entry) => entry.ruleId).sort()).toEqual(["CONS-01", "PRIN-04", "TERM-01"]);
  });

  it("keeps only valid findings for the packet's own rule and unit", async () => {
    const judged = offline({
      judge: async (packet) => {
        const candidate = packet.candidates[0];
        const finding = { id: `llm:${packet.rule.id}:${packet.draft.id}`, draft_id: packet.draft.id, draft_version: packet.draft.version, ruleset_version: 1, rule_id: packet.rule.id, rule_version: packet.rule.version, layer: "L2", severity: "flag", quoted_span: candidate.quoted_span, start: candidate.start, end: candidate.end, explanation: "Synthetic judge evidence.", reference_ids: [], model: "synthetic-judge", prompt_version: "synthetic-v1", state: "current", cleared_at: null };
        if (packet.rule.id === "TERM-01") return { status: "evaluated", findings: [finding, { ...finding, id: "bad-span", start: finding.start + 1 }, { ...finding, id: "other-rule", rule_id: "PRIN-04" }] };
        return { status: "not_evaluable", findings: [], reason: "Synthetic judge declined." };
      },
    });
    const result = await judged.runChecks(input, "llm");
    expect(result.findings.map((finding) => [finding.id, finding.quoted_span])).toEqual([["llm:TERM-01:synthetic-draft-2:v1:r1:16-20", "gods"]]);
    expect(result.notEvaluable).toEqual([
      { ruleId: "CONS-01", reason: "synthetic-draft-1: no applicable reference; style comparison not run. synthetic-draft-2: no applicable reference; style comparison not run." },
      { ruleId: "PRIN-04", reason: "synthetic-draft-1: Synthetic judge declined." },
      { ruleId: "TERM-01", reason: "synthetic-draft-2: 2 model finding(s) failed evidence validation and were dropped." },
    ]);
  });

  it("caps model severity at the resolved rule and rejects findings posing as code output", async () => {
    const judged = offline({
      judge: async (packet) => {
        const candidate = packet.candidates[0];
        const finding = { id: "model-chosen-id", draft_id: packet.draft.id, draft_version: packet.draft.version, ruleset_version: 1, rule_id: packet.rule.id, rule_version: packet.rule.version, layer: "L1", severity: "error", quoted_span: candidate.quoted_span, start: candidate.start, end: candidate.end, explanation: "Synthetic judge evidence.", reference_ids: [], model: packet.rule.id === "PRIN-04" ? "synthetic-judge" : "eko-code", prompt_version: "synthetic-v1", state: "current", cleared_at: null };
        return { status: "evaluated", findings: [finding] };
      },
    });
    const result = await judged.runChecks(input, "llm");
    expect(result.findings.map((finding) => [finding.rule_id, finding.severity, finding.layer, finding.id.startsWith("llm:PRIN-04:")])).toEqual([["PRIN-04", "flag", "L2", true]]);
    expect(result.notEvaluable.map((entry) => entry.ruleId)).toEqual(["CONS-01", "TERM-01"]);
  });

  it("discards a schema-invalid judge response", async () => {
    const result = await offline({ judge: async () => ({ status: "evaluated", findings: [{ rewrite: "SYNTHETIC" }] }) }).runChecks(input, "llm");
    expect(result.findings).toEqual([]);
    expect(result.notEvaluable).toHaveLength(3);
  });
});

const proposalRule: Rule = { ...rulesFixture.find((rule) => rule.id === "LAYER-06")!, id: "PROP-TEST", source: "proposal", provenance: { actor: "Synthetic actor", reason: "Synthetic test rule.", at: "2026-10-16T12:00:00.000Z" } };
const emptyIndex: ReferenceIndex = { lookup: async () => ({ ordinary: [], exceptions: [], mode: "lexical" }), warm: async () => {} };
const modelFindingFor = (packet: LlmPacket, explanation: string): Finding => {
  const candidate = packet.candidates[0];
  return { id: "llm-pending", draft_id: packet.draft.id, draft_version: packet.draft.version, ruleset_version: packet.rulesetVersion, rule_id: packet.rule.id, rule_version: packet.rule.version, layer: "L2", severity: "flag", quoted_span: candidate.quoted_span, start: candidate.start, end: candidate.end, explanation, reference_ids: [], model: "synthetic-judge", prompt_version: "synthetic-v1", state: "current", cleared_at: null };
};

describe("LLM-01 packets and guards", () => {
  const input = syntheticInput(["This is the only correct translation of the line.", "Remembering the gods, the mind becomes still.", "Plain unchanged unit."], { changed: [0, 1] });

  it("drops a model finding whose explanation proposes wording or is non-neutral, and notes it", async () => {
    const explanations: Record<string, string> = { "synthetic-draft-1": "Synthetic: the draft should read differently here.", "synthetic-draft-2": "Synthetic: this differs from the reference rendering." };
    const result = await runLlmPhase(input, async (packet) => packet.rule.id === "PRIN-04"
      ? { status: "evaluated", findings: [modelFindingFor(packet, "This is a wrong translation.")] }
      : { status: "evaluated", findings: [modelFindingFor(packet, explanations[packet.draft.id])] });
    expect(result.findings.map((finding) => [finding.rule_id, finding.draft_id])).toEqual([["TERM-01", "synthetic-draft-2"]]);
    expect(result.notEvaluable.find((entry) => entry.ruleId === "PRIN-04")?.reason).toBe("synthetic-draft-1: 1 model finding(s) failed the neutral-wording and no-rewrite guards and were dropped.");
    expect(result.notEvaluable.find((entry) => entry.ruleId === "TERM-01")?.reason ?? "").not.toContain("guards");
  });

  it("builds style packets only with retrieved references and notes the rest", async () => {
    const none = await runLlmPhase(input, async () => ({ status: "evaluated", findings: [] }), { index: emptyIndex });
    expect(none.notEvaluable.find((entry) => entry.ruleId === "CONS-01")?.reason).toBe("synthetic-draft-1: no applicable reference; style comparison not run. synthetic-draft-2: no applicable reference; style comparison not run.");
    expect((await llmPackets(input, { index: emptyIndex })).some((packet) => packet.kind === "style")).toBe(false);
    const reference = { id: "synthetic-ref-1", line_ids: ["synthetic-line-1"], english: "SYNTHETIC REFERENCE ENGLISH", source: "sikhri_sample" as const, exceptions: [] };
    const exception = { ...reference, id: "synthetic-ref-2" };
    const index: ReferenceIndex = { lookup: async ({ draft }) => draft.id === "synthetic-draft-1"
      ? { ordinary: [{ reference, score: 1, method: "line", exception: false }], exceptions: [{ reference: exception, score: 0.5, method: "line", exception: true }], mode: "lexical" }
      : { ordinary: [], exceptions: [], mode: "lexical" }, warm: async () => {} };
    const packets = (await llmPackets(input, { index })).filter((packet) => packet.kind === "style");
    expect(packets.map((packet) => [packet.draft.id, packet.references?.map((ranked) => ranked.reference.id)])).toEqual([["synthetic-draft-1", ["synthetic-ref-1", "synthetic-ref-2"]]]);
  });

  it("builds free-text packets for approved proposal rules, one per changed unit", async () => {
    const withRule = syntheticInput(input.sabadDrafts.map((draft) => draft.text), { changed: [0, 1], rules: [...rulesFixture, proposalRule] });
    const packets = (await llmPackets(withRule)).filter((packet) => packet.kind === "free_text");
    expect(packets.map((packet) => [packet.rule.id, packet.draft.id])).toEqual([["PROP-TEST", "synthetic-draft-1"], ["PROP-TEST", "synthetic-draft-2"]]);
    expect(packets.every((packet) => packet.candidates.length === 0 && packet.rulesetVersion === 1)).toBe(true);
  });

  it("keeps every valid finding of one packet although placeholder IDs repeat", async () => {
    const withRule = syntheticInput(["The mind rests and the mind sings."], { rules: [...rulesFixture, proposalRule] });
    const result = await runLlmPhase(withRule, async (packet) => {
      if (packet.kind !== "free_text") return { status: "evaluated", findings: [] };
      const at = (start: number, end: number): Finding => ({ ...modelFindingFor({ ...packet, candidates: [{ ruleId: packet.rule.id, draftId: packet.draft.id, start, end, quoted_span: packet.draft.text.slice(start, end), patternIndex: 0 }] }, "Synthetic: differs from the rule."), severity: "hint" });
      return { status: "evaluated", findings: [at(4, 8), at(23, 27)] };
    });
    expect(result.findings.map((finding) => finding.quoted_span)).toEqual(["mind", "mind"]);
  });

  it("does not touch the reference index when no judge is given", async () => {
    let lookups = 0;
    const counting: ReferenceIndex = { lookup: async () => { lookups++; return { ordinary: [], exceptions: [], mode: "lexical" }; }, warm: async () => {} };
    const result = await runLlmPhase(input, undefined, { index: counting });
    expect(lookups).toBe(0);
    expect(result.notEvaluable.find((entry) => entry.ruleId === "CONS-01")?.reason).toBe("synthetic-draft-1: model check not run; no model adapter is configured. synthetic-draft-2: model check not run; no model adapter is configured.");
    await runLlmPhase(input, async () => ({ status: "evaluated", findings: [] }), { index: counting });
    expect(lookups).toBe(2);
  });

  it("withholds a model not_evaluable reason that fails the guards or is too long", async () => {
    const reasonFor = async (reason: string) => {
      const result = await runLlmPhase(input, async (packet) => packet.rule.id === "PRIN-04" ? { status: "not_evaluable", findings: [], reason } : { status: "evaluated", findings: [] });
      return result.notEvaluable.find((entry) => entry.ruleId === "PRIN-04")?.reason;
    };
    const withheld = "synthetic-draft-1: model reported this unit not evaluable; its reason was withheld by the review guards.";
    expect(await reasonFor('Synthetic: use "the Creator" here.')).toBe(withheld);
    expect(await reasonFor("Synthetic: the draft should be rendered as something else.")).toBe(withheld);
    expect(await reasonFor('Synthetic: quotes "text that is not in the evidence".')).toBe(withheld);
    expect(await reasonFor("x".repeat(301))).toBe(withheld);
    expect(await reasonFor("Synthetic: the draft is empty.")).toBe("synthetic-draft-1: Synthetic: the draft is empty.");
    expect(await reasonFor('Synthetic: nothing to judge in "only correct".')).toBe("synthetic-draft-1: Synthetic: nothing to judge in \"only correct\".");
  });

  it("falls back to hint when a proposal rule's severity is not a finding severity", async () => {
    const lens = { ...proposalRule, severity: "lens" as never, resolution: { ...proposalRule.resolution, severity: "lens" as never } };
    const withRule = syntheticInput(["The mind rests."], { rules: [...rulesFixture, lens] });
    const result = await runLlmPhase(withRule, async (packet) => packet.kind === "free_text"
      ? { status: "evaluated", findings: [{ ...modelFindingFor({ ...packet, candidates: [{ ruleId: packet.rule.id, draftId: packet.draft.id, start: 4, end: 8, quoted_span: "mind", patternIndex: 0 }] }, "Synthetic: differs from the rule."), severity: "flag" }] }
      : { status: "evaluated", findings: [] });
    expect(result.findings.map((finding) => [finding.rule_id, finding.severity])).toEqual([["PROP-TEST", "hint"]]);
  });

  it("scopes the model phase to changed units plus Sabad-scoped TERM-02", () => {
    expect(llmPhaseScope(input)).toEqual({ draftIds: ["synthetic-draft-1", "synthetic-draft-2"], ruleIds: ["TERM-02"] });
    const rules = rulesFixture.map((rule) => rule.id === "TERM-02" ? { ...rule, resolution: { ...rule.resolution, active: false } } : rule);
    expect(llmPhaseScope(syntheticInput(["Synthetic."], { rules }))).toEqual({ draftIds: ["synthetic-draft-1"], ruleIds: [] });
  });
});

// Local source is exported from BaniDB by C-03; never synthesize source text.
const sourcePath = new URL("../../contracts/fixtures/sabad.demo.json", import.meta.url);
let sabad: ReturnType<typeof SabadSchema.parse> | undefined;
try { sabad = SabadSchema.parse(JSON.parse(readFileSync(sourcePath, "utf8"))); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
(sabad ? describe : describe.skip)("TERM-02 evidence from the private BaniDB fixture", () => {
  it("builds TERM-02 packets from Divine names in the unit's source lines", async () => {
    const drafts = sabad!.lines.map((line, index) => ({ id: `local-${index}`, shabad_id: sabad!.shabad_id, line_ids: [line.line_id], layer: "transcreation" as const, text: "SYNTHETIC ENGLISH TEST MARKER", author: "Synthetic test author", status: "draft" as const, version: 1, updated_at: "2026-10-16T12:00:00.000Z" }));
    const input = CheckInputSchema.parse({ sabad, draft: drafts[0], sabadDrafts: drafts, changedLineIds: sabad!.lines.map((line) => line.line_id), rules: rulesFixture, rulesetVersion: 1, references: [] });
    const packets = (await llmPackets(input)).filter((packet) => packet.rule.id === "TERM-02");
    expect(packets.length).toBeGreaterThan(0);
    expect(packets.every((packet) => packet.kind === "term02" && packet.sabad?.units.length === drafts.length && packet.divineNames.every((hit) => packet.draft.line_ids.includes(hit.line_id)))).toBe(true);
    const enough = packets[0].sabad!.distinctFamilies >= 3;
    expect(packets.length === drafts.length || !enough).toBe(true); // 3+ families: every unit gets a packet
    expect(packets.every((packet) => enough || packet.divineNames.length > 0)).toBe(true);
  });

  it("lets a collapse explanation name another unit's Divine name, copied from BaniDB, but nothing else", async () => {
    const drafts = sabad!.lines.map((line, index) => ({ id: `local-${index}`, shabad_id: sabad!.shabad_id, line_ids: [line.line_id], layer: "transcreation" as const, text: "SYNTHETIC ENGLISH TEST MARKER", author: "Synthetic test author", status: "draft" as const, version: 1, updated_at: "2026-10-16T12:00:00.000Z" }));
    const input = CheckInputSchema.parse({ sabad, draft: drafts[0], sabadDrafts: drafts, changedLineIds: sabad!.lines.map((line) => line.line_id), rules: rulesFixture, rulesetVersion: 1, references: [] });
    const packet = (await llmPackets(input)).find((entry) => entry.rule.id === "TERM-02")!;
    // A word from a line outside this packet's unit stands in for another unit's Divine-name hit.
    const other = sabad!.lines.find((line) => !packet.draft.line_ids.includes(line.line_id))!;
    const token = tokenize(other.gurmukhi).find((entry) => !packet.lines.some((line) => tokenize(line.gurmukhi).some((own) => own.surface === entry.surface)))!;
    const explanation = `The Sabad's names ${token.surface} and others are rendered by one English word.`;
    const withoutHit = { ...packet, sabad: { ...packet.sabad!, divineNames: [] } };
    const withHit = { ...packet, sabad: { ...packet.sabad!, divineNames: [{ line_id: other.line_id, family: "synthetic", token }] } };
    expect(passesReviewGuards(explanation, allowedQuotes(withoutHit))).toBe(false);
    expect(passesReviewGuards(explanation, allowedQuotes(withHit))).toBe(true);
  });
});

describe("drift boundary without a model", () => {
  it("reports every subcheck unavailable instead of claiming a drift pass", async () => {
    const results = await engine.runDriftCheck(proposalFixture, { rules: rulesFixture, rulesetVersion: 1, references: [], glossary: null });
    expect(results).toHaveLength(5);
    expect(results.every((result) => DriftResultSchema.safeParse(result).success && result.assessment.status === "not_evaluable")).toBe(true);
  });
});
