import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { EvalRunSchema, ReviewCorrectionSchema, SabadSchema } from "../../lib/contracts/domain";
import type { EvalRun, ReviewCorrection, Rule, Sabad } from "../../lib/contracts/domain";
import type { Engine } from "../../lib/contracts/ports";
import { rulesFixture } from "../../lib/contracts/fixtures";
import { checkedRules, createEngine, createLlmClient, runBacktest, scoreBacktest, toEvalRun } from "../../lib/engine";
import type { BacktestScore } from "../../lib/engine";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REAL_CORRECTIONS = "data/sikhri-sample/normalized/corrections.json";
const FIXTURE_CORRECTIONS = "lib/contracts/fixtures/corrections.json";
const DEMO_SABAD = "lib/contracts/fixtures/sabad.demo.json";
const DEFAULT_OUT = "data/eval/latest.json";
// Fixed timestamp for the in-memory drafts so a rerun builds byte-identical engine inputs (and cache keys).
const DRAFT_AT = "2026-10-16T12:00:00.000Z";

type DataLabel = "real_review_history" | "synthetic_test";
const WrappedSchema = z.object({ data_label: z.enum(["real_review_history", "synthetic_test"]).optional(), records: z.array(ReviewCorrectionSchema) });

export interface CorrectionsSource { path: string; relative: string; corrections: ReviewCorrection[]; dataLabel: DataLabel }

/**
 * The real normalized review history when DATA-06 has produced it, else the labelled test fixture.
 * Fixture input is always `synthetic_test`; a real file is `real_review_history` unless it labels itself synthetic.
 * Accepts a bare array or a `{ data_label, records }` wrapper.
 */
export function loadCorrections(base: string): CorrectionsSource {
  const real = resolve(base, REAL_CORRECTIONS);
  const path = existsSync(real) ? real : resolve(base, FIXTURE_CORRECTIONS);
  const isFixture = path !== real;
  const data: unknown = JSON.parse(readFileSync(path, "utf8"));
  const wrapped = z.array(ReviewCorrectionSchema).safeParse(data);
  const parsed = wrapped.success ? { data_label: undefined, records: wrapped.data } : WrappedSchema.parse(data);
  return { path, relative: isFixture ? FIXTURE_CORRECTIONS : REAL_CORRECTIONS, corrections: parsed.records, dataLabel: isFixture ? "synthetic_test" : parsed.data_label ?? "real_review_history" };
}

/** Source lines for the corrections: the demo Sabad, plus the full private SQLite copy only when lines are still missing. */
export async function loadSabads(base: string, corrections: ReviewCorrection[]): Promise<Sabad[]> {
  const demo = resolve(base, DEMO_SABAD);
  const sabads: Sabad[] = existsSync(demo) ? [SabadSchema.parse(JSON.parse(readFileSync(demo, "utf8")))] : [];
  const have = new Set(sabads.flatMap((sabad) => sabad.lines.map((line) => line.line_id)));
  if (corrections.every((correction) => correction.line_ids.every((id) => have.has(id)))) return sabads;
  const source = await import("../app/banidb-source");
  if (!source.useFullSqlite(base)) return sabads;
  return [...sabads, ...source.loadSqliteSabads(base).sabads];
}

export interface RunMeta { input: string; corrections: number; data_label: DataLabel; model_checks: "enabled" | "not_configured" }
export interface EvalDetail extends BacktestScore { run_meta: RunMeta }

const stable = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);

export interface BuildOptions { rules?: Rule[]; sabads: Sabad[]; source: CorrectionsSource; engine: Pick<Engine, "runChecks">; at: string; modelChecks: RunMeta["model_checks"] }

/**
 * Replays the corrections through the engine and returns the contract-valid run plus its per-correction trace.
 * The run id is a hash of the policy, ruleset and results, so it does not change on a cache-warm rerun (only `at` does).
 */
export async function buildEvalRun(options: BuildOptions): Promise<{ run: EvalRun; detail: EvalDetail }> {
  const rules = options.rules ?? rulesFixture;
  const versions = new Set(rules.map((rule) => rule.version));
  if (versions.size !== 1) throw new Error("The rules file mixes ruleset versions; a run covers one version.");
  const rulesetVersion = [...versions][0];
  const meta: RunMeta = { input: options.source.relative, corrections: options.source.corrections.length, data_label: options.source.dataLabel, model_checks: options.modelChecks };
  if (options.source.corrections.length === 0) {
    const run = EvalRunSchema.parse({ status: "unavailable", ruleset_version: rulesetVersion, reason: `${meta.input} holds no corrections, so no backtest rate is claimed.` });
    return { run, detail: { ...scoreBacktest([]), run_meta: meta } };
  }
  const items = await runBacktest({ engine: options.engine, corrections: options.source.corrections, sabads: options.sabads, rules, rulesetVersion, at: DRAFT_AT });
  const score = scoreBacktest(items, { ruleIds: checkedRules(rules).map((rule) => rule.id) });
  const id = `eval-${stable({ rulesetVersion, label: options.source.dataLabel, score })}`;
  const run = EvalRunSchema.parse(toEvalRun(score, { id, at: options.at, rulesetVersion, dataLabel: options.source.dataLabel }));
  return { run, detail: { ...score, run_meta: meta } };
}

export function formatSummary(run: EvalRun, detail: EvalDetail): string {
  if (run.status === "unavailable") return `Backtest unavailable: ${run.reason}`;
  const pct = (metric: { numerator: number; denominator: number; rate: number | null }) =>
    metric.rate === null ? `n/a (${metric.numerator}/${metric.denominator})` : `${(metric.rate * 100).toFixed(1)}% (${metric.numerator}/${metric.denominator})`;
  const lines = [
    `${run.id} · ruleset v${run.ruleset_version} · data: ${run.data_label}${run.data_label === "synthetic_test" ? " (SYNTHETIC TEST DATA, not a measured result)" : ""}`,
    `corrections ${run.n_corrections} · findings ${run.n_findings} · excluded: ${run.excluded.typos} typo, ${run.excluded.out_of_scope} out of scope, ${run.excluded.unmatched} unmatched`,
    `catch rate ${pct(run.catch_rate)} · false-flag rate ${pct(run.false_flag_rate)}`,
  ];
  for (const rule of run.per_rule) lines.push(`  ${rule.rule_id.padEnd(9)} catch ${pct(rule.catch_rate)} · false flags ${pct(rule.false_flag_rate)}`);
  if (detail.rules_not_evaluable.length > 0) lines.push(`not evaluated: ${detail.rules_not_evaluable.map((rule) => rule.rule_id).join(", ")}`);
  if (detail.run_meta.model_checks === "not_configured") lines.push("model checks: ANTHROPIC_API_KEY is not set, so model rules were not evaluated");
  return lines.join("\n");
}

export interface MainIo { log(message: string): void; error(message: string): void }
export interface MainDeps { base?: string; engine?: Pick<Engine, "runChecks">; now?: () => Date }

/** CLI body: `--out path` is the only option. Returns the process exit code. Writes only the output files. */
export async function main(argv: string[], env: Record<string, string | undefined> = process.env, io: MainIo = { log: console.log, error: console.error }, deps: MainDeps = {}): Promise<number> {
  const base = deps.base ?? root;
  const flag = argv.indexOf("--out");
  const out = resolve(base, flag >= 0 && argv[flag + 1] ? argv[flag + 1] : DEFAULT_OUT);
  try {
    const source = loadCorrections(base);
    const sabads = await loadSabads(base, source.corrections);
    const client = createLlmClient({ env });
    const engine = deps.engine ?? createEngine({ client });
    const { run, detail } = await buildEvalRun({ source, sabads, engine, at: (deps.now?.() ?? new Date()).toISOString(), modelChecks: client ? "enabled" : "not_configured" });
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(run, null, 2)}\n`);
    writeFileSync(out.replace(/\.json$/, ".detail.json"), `${JSON.stringify(detail, null, 2)}\n`);
    io.log(formatSummary(run, detail));
    io.log(`\nWrote ${out}`);
    return 0;
  } catch (error) {
    io.error(`Backtest failed; no output was written: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // Same convention as the app: pick up .env.local (ANTHROPIC_API_KEY) without overriding the shell.
  const envFile = resolve(root, ".env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
