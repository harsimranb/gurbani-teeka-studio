import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pLimit from "p-limit";
import type { CheckResult } from "../../lib/contracts/domain";
import { createEngine, createLlmClient } from "../../lib/engine";
import type { LlmClient } from "../../lib/engine";
import { syntheticCases, syntheticInput, term02Cases } from "./bakeoff-cases";
import type { BakeoffCase } from "./bakeoff-cases";

export const DEFAULT_MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"];
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_OUT = resolve(root, "data/cache/bakeoff/latest.json");
export const NO_KEY_MESSAGE = "ANTHROPIC_API_KEY is not set; the bake-off needs it to call the models. Run: node --env-file=.env.local --import tsx scripts/engine/bakeoff.ts";

export interface CaseOutcome { case: string; rule_id: string; passed: boolean; got: string; latency_ms: number; model_called: boolean }
export interface RuleTally { passed: number; total: number }
export interface ModelResult {
  model: string; passed: number; total: number; per_rule: Record<string, RuleTally>;
  latencies_ms: number[]; p50_ms: number; max_ms: number; total_ms: number;
  failures: Array<{ case: string; got: string }>; outcomes: CaseOutcome[];
}
export interface BakeoffResult {
  at: string; models: ModelResult[];
  cases: Array<{ id: string; rule_id: string; text: string; expect: BakeoffCase["expect"]; synthetic: boolean; note?: string }>;
  unavailable: Record<string, string>;
  recommendation: string | null;
}
export interface BakeoffOptions {
  models: string[]; makeClient: (model: string) => LlmClient | null; cases: BakeoffCase[];
  concurrency?: number; unavailable?: Record<string, string>; now?: () => Date;
}

// The pipeline never fetches references here (no CONS-01 case), so retrieval stays out of the timing.
const NO_INDEX = { lookup: async () => ({ ordinary: [], exceptions: [], mode: "lexical" as const }), warm: async () => {} };

/** pass = expectation met: flag cases need a finding of the rule on (or around) the span, pass cases need none and no model note. */
export function score(testCase: BakeoffCase, result: CheckResult): { passed: boolean; got: string } {
  const findings = result.findings.filter((finding) => finding.rule_id === testCase.rule_id);
  const note = result.notEvaluable.find((entry) => entry.ruleId === testCase.rule_id)?.reason;
  const spans = findings.map((finding) => finding.quoted_span);
  const got = spans.length > 0 ? `flagged ${spans.map((span) => JSON.stringify(span)).join(", ")}` : note ? `not evaluated: ${note}` : "no finding";
  if (testCase.expect.kind === "pass") return { passed: spans.length === 0 && !note, got };
  const wanted = testCase.expect.span.toLowerCase();
  return { passed: spans.some((span) => { const lower = span.toLowerCase(); return lower.includes(wanted) || wanted.includes(lower); }), got };
}

function percentile(sorted: number[], p: number): number {
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

async function runCase(client: LlmClient, testCase: BakeoffCase): Promise<CaseOutcome> {
  let calls = 0;
  const counted: LlmClient = { model: client.model, generate: (request) => { calls++; return client.generate(request); } };
  const engine = createEngine({ client: counted, index: NO_INDEX });
  const input = testCase.input ? testCase.input() : syntheticInput(testCase.rule_id, testCase.text);
  const started = performance.now();
  try {
    const result = await engine.runChecks(input, "llm");
    const latency_ms = Math.round(performance.now() - started);
    return { case: testCase.id, rule_id: testCase.rule_id, ...score(testCase, result), latency_ms, model_called: calls > 0 };
  } catch (error) {
    const latency_ms = Math.round(performance.now() - started);
    return { case: testCase.id, rule_id: testCase.rule_id, passed: false, got: `error: ${error instanceof Error ? error.message : String(error)}`, latency_ms, model_called: calls > 0 };
  }
}

/** Runs every case through the real engine model phase once per model (models in turn, cases `concurrency` at a time). */
export async function runBakeoff(options: BakeoffOptions): Promise<BakeoffResult> {
  const { models, makeClient, cases } = options;
  const results: ModelResult[] = [];
  for (const model of models) {
    const client = makeClient(model);
    if (!client) throw new Error(`No client for model ${model}`);
    const limit = pLimit(options.concurrency ?? 4);
    const started = performance.now();
    const outcomes = await Promise.all(cases.map((testCase) => limit(() => runCase(client, testCase))));
    const total_ms = Math.round(performance.now() - started);
    const per_rule: Record<string, RuleTally> = {};
    for (const outcome of outcomes) {
      const tally = (per_rule[outcome.rule_id] ??= { passed: 0, total: 0 });
      tally.total++;
      if (outcome.passed) tally.passed++;
    }
    // Latency stats cover only cases where the model was called; cases settled by code alone would flatten them.
    const latencies_ms = outcomes.filter((outcome) => outcome.model_called).map((outcome) => outcome.latency_ms);
    const sorted = [...latencies_ms].sort((a, b) => a - b);
    results.push({
      model, passed: outcomes.filter((outcome) => outcome.passed).length, total: outcomes.length, per_rule,
      latencies_ms, p50_ms: percentile(sorted, 0.5), max_ms: sorted.at(-1) ?? 0, total_ms,
      failures: outcomes.filter((outcome) => !outcome.passed).map((outcome) => ({ case: outcome.case, got: outcome.got })), outcomes,
    });
  }
  const clean = results.filter((result) => result.total > 0 && result.passed === result.total).sort((a, b) => a.p50_ms - b.p50_ms || a.total_ms - b.total_ms);
  return {
    at: (options.now?.() ?? new Date()).toISOString(), models: results,
    cases: cases.map(({ id, rule_id, text, expect, synthetic, note }) => ({ id, rule_id, text, expect, synthetic, note })),
    unavailable: options.unavailable ?? {}, recommendation: clean[0]?.model ?? null,
  };
}

export function formatReport(result: BakeoffResult): string {
  const lines: string[] = [];
  for (const entry of result.models) {
    lines.push(`\n${entry.model}: ${entry.passed}/${entry.total} cases, p50 ${entry.p50_ms} ms, max ${entry.max_ms} ms, total ${entry.total_ms} ms`);
    for (const [rule, tally] of Object.entries(entry.per_rule)) lines.push(`  ${rule.padEnd(9)} ${tally.passed}/${tally.total}`);
    for (const failure of entry.failures) lines.push(`  FAIL ${failure.case}: ${failure.got}`);
  }
  for (const [rule, reason] of Object.entries(result.unavailable)) lines.push(`\n${rule}: ${reason}`);
  lines.push(`\nRecommendation: ${result.recommendation ?? "none (no model passed every available case)"}`);
  return lines.join("\n");
}

export interface MainIo { log(message: string): void; error(message: string): void }

function redact(message: string, env: Record<string, string | undefined>): string {
  const key = env.ANTHROPIC_API_KEY;
  return (key ? message.split(key).join("[redacted]") : message).replace(/sk-ant-[\w-]+/g, "[redacted]");
}

/** CLI body: `--models a,b` and `--out path` are the only options. Returns the process exit code. */
export async function main(
  argv: string[], env: Record<string, string | undefined> = process.env, io: MainIo = { log: console.log, error: console.error },
  deps: { makeClient?: BakeoffOptions["makeClient"]; cases?: BakeoffCase[]; unavailable?: Record<string, string> } = {},
): Promise<number> {
  if (!env.ANTHROPIC_API_KEY && !deps.makeClient) { io.error(NO_KEY_MESSAGE); return 1; }
  const option = (name: string) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
  const models = option("--models")?.split(",").map((model) => model.trim()).filter(Boolean) ?? DEFAULT_MODELS;
  const out = resolve(option("--out") ?? DEFAULT_OUT);
  let cases = deps.cases;
  let unavailable = deps.unavailable;
  if (!cases) {
    const term02 = term02Cases();
    cases = [...syntheticCases, ...term02.cases];
    unavailable = term02.unavailable ? { "TERM-02": term02.unavailable } : {};
  }
  try {
    const makeClient = deps.makeClient ?? ((model: string) => createLlmClient({ model, cache: null, env }));
    const result = await runBakeoff({ models, makeClient, cases, unavailable });
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
    io.log(redact(formatReport(result), env));
    io.log(`\nWrote ${out}`);
    return 0;
  } catch (error) {
    io.error(redact(`Bake-off failed: ${error instanceof Error ? error.message : String(error)}`, env));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
