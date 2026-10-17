import type { CheckInput, CheckResult, Draft, NotEvaluable, ReviewCorrection, Rule, Sabad } from "../../contracts/domain";
import type { Engine } from "../../contracts/ports";
import type { BacktestItem } from "./metrics";

export interface BacktestRun {
  engine: Pick<Engine, "runChecks">;
  corrections: ReviewCorrection[];
  /** Source text for the corrections' lines, from BaniDB. A correction whose lines are absent is reported, never guessed. */
  sabads: Sabad[];
  rules: Rule[];
  rulesetVersion: number;
  /** Fixed timestamp for the synthetic drafts, so reruns build identical inputs. */
  at: string;
}

function mergeNotEvaluable(...results: CheckResult[]): NotEvaluable[] {
  const merged = new Map<string, string[]>();
  for (const entry of results.flatMap((result) => result.notEvaluable)) merged.set(entry.ruleId, [...(merged.get(entry.ruleId) ?? []), entry.reason]);
  return [...merged].map(([ruleId, reasons]) => ({ ruleId, reason: [...new Set(reasons)].join(" ") }));
}

/**
 * EVAL-02 core: replay each pre-edit draft through the same engine phases the app runs (code, then model).
 * Pure with respect to the app: it builds in-memory inputs and never writes drafts, rules or decisions.
 * Engine errors propagate, so a failed model call cannot turn into a silently lower catch rate.
 */
export async function runBacktest(run: BacktestRun): Promise<BacktestItem[]> {
  const sabadOfLine = new Map<string, Sabad>();
  for (const sabad of run.sabads) for (const line of sabad.lines) sabadOfLine.set(line.line_id, sabad);
  const items: BacktestItem[] = [];
  for (const correction of run.corrections) {
    const missing = correction.line_ids.filter((id) => !sabadOfLine.has(id));
    if (missing.length > 0) {
      items.push({ correction, run: { status: "not_evaluated", reason: `Source lines not available for this correction: ${missing.join(", ")}.` } });
      continue;
    }
    const sabads = new Set(correction.line_ids.map((id) => sabadOfLine.get(id)!));
    if (sabads.size !== 1) {
      items.push({ correction, run: { status: "not_evaluated", reason: "The correction's source lines belong to more than one Sabad." } });
      continue;
    }
    const sabad = [...sabads][0];
    const draft: Draft = {
      id: `backtest-${correction.id}`, shabad_id: sabad.shabad_id, line_ids: correction.line_ids, layer: "transcreation",
      text: correction.pre_edit, author: "Eko backtest", status: "draft", version: 1, updated_at: run.at,
    };
    const input: CheckInput = { sabad, draft, sabadDrafts: [draft], changedLineIds: correction.line_ids, rules: run.rules, rulesetVersion: run.rulesetVersion, references: [] };
    const code = await run.engine.runChecks(input, "code");
    const llm = await run.engine.runChecks(input, "llm");
    const findings = [...code.findings, ...llm.findings.filter((found) => !code.findings.some((entry) => entry.id === found.id))];
    items.push({ correction, run: { status: "evaluated", findings, notEvaluable: mergeNotEvaluable(code, llm) } });
  }
  return items;
}
