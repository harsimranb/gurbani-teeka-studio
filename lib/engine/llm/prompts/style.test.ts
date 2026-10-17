import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { CheckInputSchema } from "../../../contracts/domain";
import { rulesFixture } from "../../../contracts/fixtures";
import type { Reference } from "../../../contracts/domain";
import { llmPackets, runLlmPhase } from "../../checks/pipeline";
import { syntheticInput } from "../../checks/test-helpers";
import { createLlmClient } from "../adapter";
import { createLlmJudge } from "../judge";
import { createReferenceIndex } from "../../retrieval";
import { stylePrompt } from "./style";

// SYNTHETIC English only; reference line IDs match the synthetic draft's line so retrieval finds them.
const LINE = "synthetic-line-1";
const published: Reference = { id: "synthetic-ref-pub", line_ids: [LINE], english: "SYNTHETIC: the seeker keeps remembering the Beloved", source: "published", exceptions: [] };
const sample: Reference = { id: "synthetic-ref-sample", line_ids: [LINE], english: "SYNTHETIC: the seeker keeps recalling the Beloved", source: "sikhri_sample", exceptions: [] };
const departed: Reference = {
  id: "synthetic-ref-exc", line_ids: [LINE], english: "SYNTHETIC: the seeker dwells upon the Beloved", source: "sikhri_sample",
  exceptions: [{ rule_id: "CONS-01", decision_id: "synthetic-decision-1", action: "override", reason: "Synthetic reason: context differs.", reviewer: "Synthetic reviewer", at: "2026-10-16T12:00:00.000Z" }],
};
const DRAFT = "The seeker keeps praising the Beloved.";
const index = createReferenceIndex({ embedder: null });
const focusedRules = rulesFixture.filter((rule) => !["PRIN-01", "PRIN-06", "PRIN-07", "PRIN-08", "LAYER-01", "LAYER-05", "LAYER-09"].includes(rule.id));
const withRefs = (references: Reference[]) => CheckInputSchema.parse({ ...syntheticInput([DRAFT], { rules: focusedRules }), references });
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
const mockModel = (answer: unknown) => new MockLanguageModelV4({
  doGenerate: async () => ({ content: [{ type: "text", text: JSON.stringify(answer) }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }),
});
const answer = (findings: unknown[]) => ({ status: "evaluated", reason: "", findings });
const item = (extra: object = {}) => ({ quoted_span: "praising", occurrence: 1, explanation: "Synthetic: differs from reference rendering synthetic-ref-pub.", reference_ids: ["synthetic-ref-pub"], subcheck: "style", ...extra });

describe("LLM-09 style prompt", () => {
  it("is version style-v1 and lists ids, source labels and exception marks in untrusted delimiters", async () => {
    const input = withRefs([published, sample, departed]);
    const packet = (await llmPackets(input, { index })).find((candidate) => candidate.kind === "style")!;
    const { prompt, evidence } = stylePrompt.build(packet);
    expect(stylePrompt.version).toBe("style-v1");
    expect(prompt).toContain(`<untrusted>${packet.rule.text}</untrusted>`);
    expect(prompt).toContain(`<untrusted>${DRAFT}</untrusted>`);
    for (const reference of [published, sample, departed]) {
      expect(prompt).toContain(reference.id);
      expect(prompt).toContain(`<untrusted>${reference.english}</untrusted>`);
    }
    expect(prompt).toContain("[source: published;");
    expect(prompt).toContain("[source: sikhri_sample;");
    expect(prompt).toMatch(/synthetic-ref-exc \[source: sikhri_sample; found by \w+; EXCEPTION MARK/);
    expect(prompt).toContain("Synthetic reason: context differs.");
    const refs = (evidence as { references: Array<{ id: string; exception: boolean; exceptions: unknown[] }> }).references;
    expect(refs.find((entry) => entry.id === "synthetic-ref-exc")).toMatchObject({ exception: true, exceptions: [{ rule_id: "CONS-01", action: "override" }] });
    expect(refs.find((entry) => entry.id === "synthetic-ref-pub")).toMatchObject({ exception: false, exceptions: [] });
    expect(prompt).not.toMatch(/EXCEPTION MARK[^\n]*synthetic-ref-pub/);
  });

  it("states the neutral, no-rewrite, line-level and exception rules in the system prompt", () => {
    expect(stylePrompt.system).toContain("differs from reference rendering <id>");
    expect(stylePrompt.system).toMatch(/must not propose/);
    expect(stylePrompt.system).toMatch(/must not claim that a source word/);
    expect(stylePrompt.system).toMatch(/exception-marked reference alone/);
    expect(stylePrompt.system).toMatch(/equal weight/);
  });

  it("emits a style finding with cited references end to end", async () => {
    const input = withRefs([published, sample]);
    const client = createLlmClient({ languageModel: mockModel(answer([item()])), model: "synthetic-model", cache: null, env: {} })!;
    const result = await runLlmPhase(input, createLlmJudge(client), { index });
    expect(result.findings.map((entry) => [entry.rule_id, entry.layer, entry.severity, entry.quoted_span, entry.reference_ids, entry.prompt_version])).toEqual([["CONS-01", "style", "warning", "praising", ["synthetic-ref-pub"], "style-v1"]]);
  });

  it("drops a finding that cites only an invented reference id", async () => {
    const input = withRefs([published]);
    const client = createLlmClient({ languageModel: mockModel(answer([item({ reference_ids: ["invented-ref"] })])), cache: null, env: {} })!;
    const result = await runLlmPhase(input, createLlmJudge(client), { index });
    expect(result.findings).toEqual([]);
    expect(result.notEvaluable).toEqual([{ ruleId: "CONS-01", reason: "synthetic-draft-1: 1 model finding(s) failed evidence validation and were dropped." }]);
  });

  it("drops a finding whose explanation proposes wording", async () => {
    const input = withRefs([published]);
    const bad = item({ explanation: "Differs from reference rendering synthetic-ref-pub; consider using the same verb." });
    const client = createLlmClient({ languageModel: mockModel(answer([bad])), cache: null, env: {} })!;
    const result = await runLlmPhase(input, createLlmJudge(client), { index });
    expect(result.findings).toEqual([]);
    expect(result.notEvaluable[0].reason).toContain("failed the neutral-wording and no-rewrite guards");
  });

  it("returns no findings when the model finds the draft consistent", async () => {
    const client = createLlmClient({ languageModel: mockModel(answer([])), cache: null, env: {} })!;
    const result = await runLlmPhase(withRefs([published]), createLlmJudge(client), { index });
    expect(result).toEqual({ findings: [], notEvaluable: [] });
  });

  it("reports CONS-01 not evaluable when no reference applies, without calling the model", async () => {
    const model = mockModel(answer([item()]));
    const client = createLlmClient({ languageModel: model, cache: null, env: {} })!;
    const result = await runLlmPhase(withRefs([]), createLlmJudge(client), { index });
    expect(result.findings).toEqual([]);
    expect(result.notEvaluable).toEqual([{ ruleId: "CONS-01", reason: "synthetic-draft-1: no applicable reference; style comparison not run." }]);
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});
