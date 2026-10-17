import { describe, expect, it, vi } from "vitest";
import { CheckInputSchema, FindingSchema } from "../../contracts/domain";
import type { CheckInput, CheckResult, ReviewCorrection, Sabad } from "../../contracts/domain";
import { rulesFixture } from "../../contracts/fixtures";
import { createEngine } from "../index";
import { runBacktest } from "./backtest";
import { scoreBacktest } from "./metrics";

// SYNTHETIC: the source side is a Latin placeholder, never Gurbani (hard rule 2); English is test text only.
const AT = "2026-10-16T12:00:00.000Z";
const line = (id: string, shabad: string) => ({ line_id: id, shabad_id: shabad, ang: 1, raag: "Synthetic raag", writer: "Synthetic writer", is_rahao: false, gurmukhi: "SYNTHETIC SOURCE PLACEHOLDER, NOT GURBANI" });
const sabads: Sabad[] = [
  { shabad_id: "s1", lines: [line("l1", "s1"), line("l2", "s1")] },
  { shabad_id: "s2", lines: [line("l3", "s2")] },
];
const correction = (id: string, line_ids: string[], pre: string, post: string): ReviewCorrection => ({
  id, line_ids, pre_edit: pre, post_edit: post, reviewer: "Synthetic test reviewer", source_id: "synthetic-source", label: "unclassified", changed_spans: [],
});

describe("runBacktest", () => {
  it("builds one in-memory pre-edit draft per correction and runs both engine phases without touching anything else", async () => {
    const seen: Array<{ input: CheckInput; phase: string }> = [];
    const engine = {
      runChecks: vi.fn(async (input: CheckInput, phase: "code" | "llm"): Promise<CheckResult> => {
        seen.push({ input, phase });
        const start = input.draft.text.indexOf("(");
        const findings = phase === "code" && start >= 0 ? [FindingSchema.parse({
          id: "f1", draft_id: input.draft.id, draft_version: 1, ruleset_version: 1, rule_id: "LAYER-07", rule_version: 1, layer: "L1", severity: "error",
          quoted_span: "(", start, end: start + 1, explanation: "Synthetic test evidence.", reference_ids: [], model: "synthetic-test",
          prompt_version: "synthetic-v1", state: "current", cleared_at: null,
        })] : [];
        return { findings, notEvaluable: phase === "llm" ? [{ ruleId: "TERM-02", reason: "model check not run." }] : [] };
      }),
    };
    const pre = "The mind rests (SYNTHETIC) here";
    const items = await runBacktest({
      engine, sabads, rules: rulesFixture, rulesetVersion: 1, at: AT,
      corrections: [correction("c1", ["l1", "l2"], pre, "The mind rests here"), correction("c2", ["nope"], "x", "y"), correction("c3", ["l2", "l3"], "x", "y")],
    });
    expect(seen.map((entry) => entry.phase)).toEqual(["code", "llm"]);
    const input = CheckInputSchema.parse(seen[0].input);
    expect(input.draft).toMatchObject({ id: "backtest-c1", text: pre, version: 1, updated_at: AT, line_ids: ["l1", "l2"], layer: "transcreation" });
    expect(input.references).toEqual([]);
    expect(items[0].run).toMatchObject({ status: "evaluated", notEvaluable: [{ ruleId: "TERM-02", reason: "model check not run." }] });
    expect(items[1].run).toEqual({ status: "not_evaluated", reason: "Source lines not available for this correction: nope." });
    expect(items[2].run).toEqual({ status: "not_evaluated", reason: "The correction's source lines belong to more than one Sabad." });
    expect(scoreBacktest(items).catch).toEqual({ numerator: 1, denominator: 1 });
  });

  it("propagates engine errors instead of scoring a partial run", async () => {
    const engine = { runChecks: async () => { throw new Error("model unavailable"); } };
    await expect(runBacktest({ engine, sabads, rules: rulesFixture, rulesetVersion: 1, at: AT, corrections: [correction("c1", ["l1"], "a", "b")] })).rejects.toThrow("model unavailable");
  });

  it("with the real engine and no model, a code finding is caught and the rerun is identical", async () => {
    const engine = createEngine({ client: null });
    const pre = "The mind rests (SYNTHETIC)";
    const items = await runBacktest({ engine, sabads, rules: rulesFixture, rulesetVersion: 1, at: AT, corrections: [correction("c1", ["l1"], pre, "The mind rests")] });
    const first = await runBacktest({ engine, sabads, rules: rulesFixture, rulesetVersion: 1, at: AT, corrections: [correction("c1", ["l1"], pre, "The mind rests")] });
    expect(items).toEqual(first);
    const score = scoreBacktest(items);
    expect(score.catch).toEqual({ numerator: 1, denominator: 1 });
    expect(score.items[0].units[0].caught_by.map((entry) => entry.rule_id)).toContain("LAYER-07");
  });
});
