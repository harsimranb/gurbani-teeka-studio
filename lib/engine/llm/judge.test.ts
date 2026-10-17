import { describe, expect, it } from "vitest";
import { CheckInputSchema, FindingBatchSchema } from "../../contracts/domain";
import type { Rule } from "../../contracts/domain";
import { rulesFixture } from "../../contracts/fixtures";
import { llmPackets, runLlmPhase } from "../checks/pipeline";
import type { LlmPacket } from "../checks/pipeline";
import { syntheticInput } from "../checks/test-helpers";
import type { LlmClient } from "./adapter";
import { LlmSchemaError } from "./adapter";
import { createLlmJudge, locateOccurrence } from "./judge";

const seeded = (id: string) => rulesFixture.find((rule) => rule.id === id)!;
const focusedRules = rulesFixture.filter((rule) => !["PRIN-01", "PRIN-06", "PRIN-07", "PRIN-08", "LAYER-01", "LAYER-05", "LAYER-09"].includes(rule.id));
const proposalRule: Rule = { ...seeded("LAYER-06"), id: "PROP-TEST", source: "proposal", provenance: { actor: "Synthetic actor", reason: "Synthetic test rule.", at: "2026-10-16T12:00:00.000Z" } };

/** Fake client that returns `answer` for every request and records what it was asked. */
function fakeClient(answer: unknown | (() => never)) {
  const requests: Array<{ schemaName: string; promptVersion: string; prompt: string; system: string }> = [];
  const client: LlmClient = {
    model: "synthetic-model",
    async generate(request) {
      requests.push(request);
      if (typeof answer === "function") answer();
      return { output: request.schema.parse(answer), cached: false };
    },
  };
  return { client, requests };
}
const syntheticHit = { line_id: "synthetic-line-1", family: "synthetic-family", token: { surface: "synthetic" } } as never;
const open = (findings: unknown[], extra: object = {}) => ({ status: "evaluated", reason: "", findings, ...extra });
const item = (quoted_span: string, occurrence = 1, extra: object = {}) => ({ quoted_span, occurrence, explanation: "Synthetic explanation: differs from the rule.", reference_ids: [], subcheck: "", ...extra });

describe("locateOccurrence", () => {
  it("finds the nth exact occurrence or null", () => {
    expect(locateOccurrence("the cat and the dog", "the", 1)).toEqual({ start: 0, end: 3 });
    expect(locateOccurrence("the cat and the dog", "the", 2)).toEqual({ start: 12, end: 15 });
    expect(locateOccurrence("the cat and the dog", "the", 3)).toBeNull();
    expect(locateOccurrence("the cat", "missing", 1)).toBeNull();
    expect(locateOccurrence("the cat", "", 1)).toBeNull();
    expect(locateOccurrence("aaa", "aa", 2)).toEqual({ start: 1, end: 3 });
    for (const bad of [0, -1, 1.5, Number.NaN]) expect(locateOccurrence("the cat", "the", bad)).toBeNull();
  });
});

describe("LLM-01 judge", () => {
  const confirmInput = syntheticInput(["This is the only correct translation of the line."], { rules: focusedRules });

  it("turns a confirm verdict into a finding at the code candidate's span", async () => {
    const packet = (await llmPackets(confirmInput)).find((entry) => entry.rule.id === "PRIN-04")!;
    expect(packet.kind).toBe("confirm");
    const { client, requests } = fakeClient({ decisions: [
      { candidate_index: 0, verdict: "confirm", explanation: "Synthetic: presents one reading as the only one." },
      { candidate_index: 0, verdict: "confirm", explanation: "Synthetic duplicate verdict." },
      { candidate_index: 9, verdict: "confirm", explanation: "Synthetic unknown index." },
    ] });
    const batch = FindingBatchSchema.parse(await createLlmJudge(client)(packet));
    expect(batch.findings).toHaveLength(1);
    expect(batch.findings[0]).toMatchObject({ rule_id: "PRIN-04", layer: "L2", severity: "flag", model: "synthetic-model", prompt_version: "confirm-v3", quoted_span: packet.candidates[0].quoted_span, start: packet.candidates[0].start, end: packet.candidates[0].end });
    expect(requests[0].prompt).toContain("<untrusted>");
  });

  it("emits nothing for a reject verdict", async () => {
    const packet = (await llmPackets(confirmInput)).find((entry) => entry.rule.id === "PRIN-04")!;
    const { client } = fakeClient({ decisions: [{ candidate_index: 0, verdict: "reject", explanation: "Synthetic: context is fine." }] });
    expect(await createLlmJudge(client)(packet)).toEqual({ status: "evaluated", findings: [] });
  });

  it("locates open findings by occurrence and drops spans that are not in the draft", async () => {
    const input = syntheticInput(["The mind sings and the mind rests."], { rules: [...focusedRules, proposalRule] });
    const packets = (await llmPackets(input)).filter((packet) => packet.kind === "free_text" && packet.rule.id === "PROP-TEST");
    expect(packets.map((packet) => packet.rule.id)).toEqual(["PROP-TEST"]);
    const { client } = fakeClient(open([item("mind", 2), item("absent phrase"), item("mind", 7)]));
    const batch = FindingBatchSchema.parse(await createLlmJudge(client)(packets[0]));
    const second = input.draft.text.indexOf("mind", 5);
    expect(batch.findings.map((finding) => [finding.quoted_span, finding.start, finding.end, finding.reference_ids])).toEqual([["mind", second, second + 4, []]]);
    expect(batch.findings[0]).toMatchObject({ rule_id: "PROP-TEST", layer: "L2", severity: seeded("LAYER-06").severity });
  });

  it("returns a not_evaluable batch when the model says so", async () => {
    const input = syntheticInput(["One word for every name."]);
    const packet: LlmPacket = { kind: "term02", rule: seeded("TERM-02"), draft: input.draft, lines: input.sabad.lines, rulesetVersion: 1, candidates: [], divineNames: [syntheticHit] };
    const { client } = fakeClient(open([], { status: "not_evaluable", reason: "Synthetic: the unit is empty." }));
    expect(await createLlmJudge(client)(packet)).toEqual({ status: "not_evaluable", findings: [], reason: "Synthetic: the unit is empty." });
  });

  it("writes free-text explanations and not_evaluable reasons itself, never storing the model's text", async () => {
    const input = syntheticInput(["The mind sings."], { rules: [...focusedRules, proposalRule] });
    const packet = (await llmPackets(input)).find((candidate) => candidate.kind === "free_text" && candidate.rule.id === "PROP-TEST")!;
    const paraphrase = "Synthetic: the source line speaks of a fearless sovereign who carries beings across.";
    const found = await runLlmPhase(input, createLlmJudge(fakeClient(open([item("mind", 1, { explanation: paraphrase })])).client));
    expect(found.findings.filter((finding) => finding.rule_id === "PROP-TEST").map((finding) => [finding.quoted_span, finding.explanation])).toEqual([["mind", "The draft differs from rule PROP-TEST."]]);
    const skipped = await createLlmJudge(fakeClient(open([], { status: "not_evaluable", reason: paraphrase })).client)(packet);
    expect(skipped).toEqual({ status: "not_evaluable", findings: [], reason: "Rule PROP-TEST could not be evaluated for this unit." });
  });

  it("keeps only reference IDs present in the packet for style findings", async () => {
    const reference = { id: "synthetic-ref-1", line_ids: ["synthetic-line-1"], english: "SYNTHETIC REFERENCE ENGLISH", source: "sikhri_sample" as const, exceptions: [] };
    const input = CheckInputSchema.parse({ ...syntheticInput(["The mind sings and the mind rests."], { rules: focusedRules }), references: [reference] });
    const index = { lookup: async () => ({ ordinary: [{ reference, score: 1, method: "line" as const, exception: false }], exceptions: [], mode: "lexical" as const }), warm: async () => {} };
    const packet = (await llmPackets(input, { index })).find((candidate) => candidate.kind === "style")!;
    expect(packet.references?.map((ranked) => ranked.reference.id)).toEqual(["synthetic-ref-1"]);
    const { client } = fakeClient(open([item("sings", 1, { reference_ids: ["synthetic-ref-1", "invented-ref"] }), item("rests", 1, { reference_ids: ["invented-ref"] })]));
    const batch = await createLlmJudge(client)(packet) as { findings: Array<{ reference_ids: string[]; layer: string; severity: string; rule_id: string }> };
    expect(batch.findings.map((finding) => finding.reference_ids)).toEqual([["synthetic-ref-1"], []]);
    expect(batch.findings.every((finding) => finding.layer === "style" && finding.severity === "warning" && finding.rule_id === "CONS-01")).toBe(true);
    // The pipeline drops the finding left without a real reference (style findings need evidence).
    const result = await runLlmPhase(input, createLlmJudge(client), { index });
    expect(result.findings.map((finding) => [finding.quoted_span, finding.layer, finding.reference_ids, finding.explanation])).toEqual([["sings", "style", ["synthetic-ref-1"], "Synthetic explanation: differs from the rule."]]);
    expect(result.notEvaluable).toEqual([{ ruleId: "CONS-01", reason: "synthetic-draft-1: 1 model finding(s) failed evidence validation and were dropped." }]);
  });

  it("style findings must cite a non-exception reference; exception-marked ids may be cited alongside", async () => {
    const reference = { id: "synthetic-ref-1", line_ids: ["synthetic-line-1"], english: "SYNTHETIC REFERENCE ENGLISH", source: "sikhri_sample" as const, exceptions: [] };
    const exceptional = { ...reference, id: "synthetic-ref-2", exceptions: [{ rule_id: "TERM-01", decision_id: "synthetic-decision-1", action: "override" as const, reason: "Synthetic recorded departure.", reviewer: "Synthetic reviewer", at: "2026-10-16T12:00:00.000Z" }] };
    const input = CheckInputSchema.parse({ ...syntheticInput(["The mind sings and the mind rests."], { rules: focusedRules }), references: [reference, exceptional] });
    const index = { lookup: async () => ({ ordinary: [{ reference, score: 1, method: "line" as const, exception: false }], exceptions: [{ reference: exceptional, score: 0.5, method: "line" as const, exception: true }], mode: "lexical" as const }), warm: async () => {} };
    const packet = (await llmPackets(input, { index })).find((candidate) => candidate.kind === "style")!;
    const { client } = fakeClient(open([
      item("sings", 1, { reference_ids: ["synthetic-ref-2"] }),
      item("rests", 1, { reference_ids: ["synthetic-ref-2", "synthetic-ref-1"] }),
    ]));
    const batch = await createLlmJudge(client)(packet) as { findings: Array<{ quoted_span: string; reference_ids: string[] }> };
    expect(batch.findings.map((finding) => [finding.quoted_span, finding.reference_ids])).toEqual([["sings", []], ["rests", ["synthetic-ref-2", "synthetic-ref-1"]]]);
    const result = await runLlmPhase(input, createLlmJudge(client), { index });
    expect(result.findings.map((finding) => finding.quoted_span)).toEqual(["rests"]);
  });

  it("maps TERM-02 subchecks to severities and distinct IDs", async () => {
    const input = syntheticInput(["One word for every name."]);
    const [lines, draft] = [input.sabad.lines, input.draft];
    const packet: LlmPacket = { kind: "term02", rule: seeded("TERM-02"), draft, lines, rulesetVersion: 1, candidates: [], divineNames: [syntheticHit], sabad: { units: [], divineNames: [], distinctFamilies: 3 } };
    const { client } = fakeClient(open([item("word", 1, { subcheck: "collapse" }), item("word", 1, { subcheck: "attribute" })]));
    const batch = FindingBatchSchema.parse(await createLlmJudge(client)(packet));
    expect(batch.findings.map((finding) => [finding.id, finding.severity])).toEqual([["llm-pending:collapse", "warning"], ["llm-pending:attribute", "flag"]]);
  });

  it("drops TERM-02 findings with an unknown subcheck, and attribute findings without a code-found Divine name", async () => {
    const input = syntheticInput(["One word for every name."]);
    const base: LlmPacket = { kind: "term02", rule: seeded("TERM-02"), draft: input.draft, lines: input.sabad.lines, rulesetVersion: 1, candidates: [], divineNames: [syntheticHit], sabad: { units: [], divineNames: [], distinctFamilies: 3 } };
    const { client } = fakeClient(open([item("word", 1, { subcheck: "other" }), item("word", 1, { subcheck: "" }), item("word", 1, { subcheck: "attribute" })]));
    const judge = createLlmJudge(client);
    expect((await judge(base) as { findings: unknown[] }).findings).toHaveLength(1);
    expect((await judge({ ...base, divineNames: [] }) as { findings: unknown[] }).findings).toHaveLength(0);
  });

  it("reports a schema mismatch as not_evaluable", async () => {
    const [packet] = await llmPackets(confirmInput);
    const { client } = fakeClient(() => { throw new LlmSchemaError("bad"); });
    expect(await createLlmJudge(client)(packet)).toEqual({ status: "not_evaluable", findings: [], reason: "model response did not match the review schema" });
  });

  it("lets non-schema errors propagate", async () => {
    const [packet] = await llmPackets(confirmInput);
    const { client } = fakeClient(() => { throw new Error("SYNTHETIC auth failure"); });
    await expect(createLlmJudge(client)(packet)).rejects.toThrow("SYNTHETIC auth failure");
  });
});
