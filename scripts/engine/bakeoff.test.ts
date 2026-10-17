import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it } from "vitest";
import { createLlmClient } from "../../lib/engine";
import type { LlmClient } from "../../lib/engine";
import type { BakeoffCase } from "./bakeoff-cases";
import { main, NO_KEY_MESSAGE, runBakeoff } from "./bakeoff";
import { DEFAULT_SABAD_PATH, syntheticCases, TERM02_UNAVAILABLE, term02Cases } from "./bakeoff-cases";

const pick = (...ids: string[]) => ids.map((id) => syntheticCases.find((testCase) => testCase.id === id)!);
// Confirm-tier cases: a flag case with a candidate and pass cases whose candidates are false-positive controls.
const cases = pick("layer06-flag-1", "layer06-pass-1", "layer06-pass-2", "term07-pass-1", "term07-flag-1", "prin04-flag-1");

/** Every `{candidate_index, quoted_span}` object anywhere in the request evidence. */
function candidatesOf(value: unknown): Array<{ candidate_index: number; quoted_span: string }> {
  if (Array.isArray(value)) return value.flatMap(candidatesOf);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.candidate_index === "number" && typeof record.quoted_span === "string") return [{ candidate_index: record.candidate_index, quoted_span: record.quoted_span }];
    return Object.values(record).flatMap(candidatesOf);
  }
  return [];
}

const oracle = (span: string, testCase: BakeoffCase) => (testCase.expect.kind === "flag" && span.toLowerCase().includes(testCase.expect.span.toLowerCase()) ? "confirm" : "reject");

/** Fake model: `decide` picks the verdict per candidate span; `delay` simulates latency. */
function fakeClient(model: string, decide: (span: string, testCase: BakeoffCase) => "confirm" | "reject", delay = 0): LlmClient {
  return {
    model,
    async generate(request) {
      if (delay) await new Promise((done) => setTimeout(done, delay));
      const testCase = cases.find((entry) => JSON.stringify(request.evidence).includes(JSON.stringify(entry.text).slice(1, -1)))!;
      const decisions = candidatesOf(request.evidence).map((candidate) => ({ candidate_index: candidate.candidate_index, verdict: decide(candidate.quoted_span, testCase), explanation: "Synthetic: differs from the rule." }));
      return { output: request.schema.parse({ decisions, status: "evaluated", reason: "", findings: [] }), cached: false };
    },
  };
}


describe("LLM-02 bake-off core", () => {
  it("a model that confirms everything fails the pass cases", async () => {
    const result = await runBakeoff({ models: ["confirm-all"], makeClient: (model) => fakeClient(model, () => "confirm"), cases });
    const [entry] = result.models;
    expect(entry.passed).toBeLessThan(entry.total);
    expect(entry.failures.map((failure) => failure.case)).toEqual(expect.arrayContaining(["layer06-pass-1", "term07-pass-1"]));
    expect(entry.failures.map((failure) => failure.case)).not.toContain("layer06-flag-1");
    expect(result.recommendation).toBeNull();
  });

  it("a correct model passes every case and the report is labelled synthetic", async () => {
    const result = await runBakeoff({ models: ["oracle"], makeClient: (model) => fakeClient(model, oracle), cases, unavailable: { "TERM-02": TERM02_UNAVAILABLE } });
    const [entry] = result.models;
    expect(entry).toMatchObject({ model: "oracle", passed: cases.length, total: cases.length, failures: [] });
    expect(entry.per_rule["LAYER-06"]).toEqual({ passed: 3, total: 3 });
    expect(entry.latencies_ms).toHaveLength(cases.length);
    expect(entry.max_ms).toBeGreaterThanOrEqual(entry.p50_ms);
    expect(result.cases.every((testCase) => testCase.synthetic)).toBe(true);
    expect(result.unavailable).toEqual({ "TERM-02": TERM02_UNAVAILABLE });
    expect(result.recommendation).toBe("oracle");
  });

  it("recommends the faster of two models that pass every case", async () => {
    const delays: Record<string, number> = { slow: 40, fast: 0, wrong: 0 };
    const result = await runBakeoff({
      models: ["slow", "wrong", "fast"], cases, concurrency: 2,
      makeClient: (model) => fakeClient(model, model === "wrong" ? () => "confirm" : oracle, delays[model]),
    });
    expect(result.models.map((entry) => [entry.model, entry.passed === entry.total])).toEqual([["slow", true], ["wrong", false], ["fast", true]]);
    expect(result.models[0].p50_ms).toBeGreaterThan(result.models[2].p50_ms);
    expect(result.recommendation).toBe("fast");
  });

  it("computes latency stats only over cases where the model was called", async () => {
    const uncalled: BakeoffCase = { id: "synthetic-no-candidate", rule_id: "PRIN-04", text: "SYNTHETIC plain calm text.", expect: { kind: "pass" }, synthetic: true };
    const result = await runBakeoff({ models: ["oracle"], makeClient: (model) => fakeClient(model, oracle, 20), cases: [...pick("layer06-flag-1"), uncalled] });
    const [entry] = result.models;
    expect(entry.outcomes.map((outcome) => [outcome.case, outcome.model_called])).toEqual([["layer06-flag-1", true], ["synthetic-no-candidate", false]]);
    expect(entry.latencies_ms).toHaveLength(1);
    expect(entry.p50_ms).toBe(entry.latencies_ms[0]);
    expect(entry.max_ms).toBe(entry.latencies_ms[0]);
    expect(entry.p50_ms).toBeGreaterThanOrEqual(15);
  });

  it("scores a thrown model error as a failed case", async () => {
    const broken: LlmClient = { model: "broken", async generate() { throw new Error("SYNTHETIC network failure"); } };
    const result = await runBakeoff({ models: ["broken"], makeClient: () => broken, cases: pick("layer06-flag-1") });
    expect(result.models[0].failures).toEqual([{ case: "layer06-flag-1", got: "error: SYNTHETIC network failure" }]);
  });

  it("runs through the real client and judge with a mocked language model", async () => {
    const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
    const languageModel = new MockLanguageModelV4({
      doGenerate: async () => ({ content: [{ type: "text", text: '{"decisions":[]}' }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }),
    });
    const result = await runBakeoff({ models: ["mocked"], makeClient: (model) => createLlmClient({ model, languageModel, cache: null, env: {} }), cases: pick("layer06-flag-1", "layer06-pass-1") });
    expect(result.models[0].failures.map((failure) => failure.case)).toEqual(["layer06-flag-1"]);
    expect(result.models[0].outcomes.find((outcome) => outcome.case === "layer06-pass-1")?.model_called).toBe(true);
  });
});

describe("LLM-02 cases", () => {
  it("covers the four p0 rules, each with pass and flag cases", () => {
    for (const rule of ["TERM-01", "PRIN-04", "LAYER-06", "TERM-07"]) {
      const own = syntheticCases.filter((testCase) => testCase.rule_id === rule);
      expect(own.some((testCase) => testCase.expect.kind === "pass")).toBe(true);
      expect(own.some((testCase) => testCase.expect.kind === "flag")).toBe(true);
    }
    expect(syntheticCases.every((testCase) => testCase.synthetic && testCase.id === testCase.id.toLowerCase())).toBe(true);
  });

  it.skipIf(!existsSync(DEFAULT_SABAD_PATH))("builds a TERM-02 control from the BaniDB fixture and runs it", async () => {
    const term02 = term02Cases();
    expect(term02.unavailable).toBeNull();
    expect(term02.cases).toHaveLength(1);
    const result = await runBakeoff({ models: ["quiet"], makeClient: (model) => fakeClient(model, () => "reject"), cases: term02.cases });
    expect(result.models[0]).toMatchObject({ passed: 1, total: 1 });
    expect(result.models[0].outcomes[0].model_called).toBe(true);
  });

  it("reports TERM-02 unavailable without a BaniDB fixture", () => {
    expect(term02Cases(join(tmpdir(), "eko-missing-sabad.demo.json"))).toEqual({ cases: [], unavailable: TERM02_UNAVAILABLE });
  });
});

describe("LLM-02 CLI", () => {
  const dirs: string[] = [];
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
  const io = () => { const out: string[] = []; const err: string[] = []; return { out, err, io: { log: (message: string) => out.push(message), error: (message: string) => err.push(message) } }; };

  it("exits 1 with a clear message and calls nothing when there is no API key", async () => {
    const sink = io();
    const code = await main([], {}, sink.io);
    expect(code).toBe(1);
    expect(sink.err).toEqual([NO_KEY_MESSAGE]);
    expect(sink.out).toEqual([]);
  });

  it("writes the JSON report and never prints the key", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eko-bakeoff-"));
    dirs.push(dir);
    const out = join(dir, "nested", "latest.json");
    const sink = io();
    const key = "sk-ant-synthetic-key-123";
    const code = await main(["--models", "m1,m2", "--out", out], { ANTHROPIC_API_KEY: key }, sink.io, { cases, makeClient: (model) => fakeClient(model, oracle) });
    expect(code).toBe(0);
    expect(existsSync(out)).toBe(true);
    const written = JSON.parse(readFileSync(out, "utf8"));
    expect(written.models.map((entry: { model: string }) => entry.model)).toEqual(["m1", "m2"]);
    expect(["m1", "m2"]).toContain(written.recommendation);
    expect(Object.keys(written)).toEqual(expect.arrayContaining(["at", "models", "cases", "recommendation"]));
    expect(sink.out.join("\n")).toContain("Recommendation:");
    expect(JSON.stringify(written) + sink.out.join("\n") + sink.err.join("\n")).not.toContain(key);
  });
});
