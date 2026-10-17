import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EvalRunSchema } from "../../lib/contracts/domain";
import type { ReviewCorrection } from "../../lib/contracts/domain";
import { getEval } from "../../lib/server/services/eval";
import { loadCorrections, main } from "./eval";

// SYNTHETIC: the source side is a Latin placeholder, never Gurbani (hard rule 2); English is test text only.
const PLACEHOLDER = "SYNTHETIC SOURCE PLACEHOLDER, NOT GURBANI";
const sabad = { shabad_id: "s1", lines: ["l1", "l2"].map((id) => ({ line_id: id, shabad_id: "s1", ang: 1, raag: "Synthetic raag", writer: "Synthetic writer", is_rahao: false, gurmukhi: PLACEHOLDER })) };
const record = (id: string, line: string, pre: string, post: string, label: ReviewCorrection["label"] = "unclassified"): ReviewCorrection => ({
  id, line_ids: [line], pre_edit: pre, post_edit: post, reviewer: "Synthetic test reviewer", source_id: "synthetic-source", label, changed_spans: [],
});
const records = [
  record("c1", "l1", "The mind rests (SYNTHETIC) here", "The mind rests here"),
  record("c2", "l2", "A calm SYNTHETIC line", "A quiet SYNTHETIC line"),
  record("c3", "l2", "A SYNTHETIC lien", "A SYNTHETIC line", "typo"),
  record("c4", "missing", "x", "y"),
  record("c5", "l1", "Remembering the lord, the mind becomes still.", "Remembering the lord, the mind becomes calm."),
];

let base: string;
const put = (relative: string, value: unknown) => {
  const file = join(base, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
};
const quiet = { log: () => {}, error: () => {} };
const read = (relative = "data/eval/latest.json") => JSON.parse(readFileSync(join(base, relative), "utf8"));

beforeEach(() => { base = mkdtempSync(join(tmpdir(), "eko-backtest-")); put("lib/contracts/fixtures/sabad.demo.json", sabad); });
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe("loadCorrections", () => {
  it("falls back to the fixture and always labels it synthetic, even if the file claims to be real", () => {
    put("lib/contracts/fixtures/corrections.json", { data_label: "real_review_history", records });
    const source = loadCorrections(base);
    expect(source).toMatchObject({ relative: "lib/contracts/fixtures/corrections.json", dataLabel: "synthetic_test" });
    expect(source.corrections).toHaveLength(5);
  });

  it("prefers the normalized sample and labels a bare array as real review history unless the file says synthetic", () => {
    put("lib/contracts/fixtures/corrections.json", { data_label: "synthetic_test", records: [] });
    put("data/sikhri-sample/normalized/corrections.json", records);
    expect(loadCorrections(base)).toMatchObject({ relative: "data/sikhri-sample/normalized/corrections.json", dataLabel: "real_review_history" });
    put("data/sikhri-sample/normalized/corrections.json", { data_label: "synthetic_test", records });
    expect(loadCorrections(base).dataLabel).toBe("synthetic_test");
  });
});

describe("pnpm eval backtest script", () => {
  it("writes a contract-valid, explicitly synthetic run for fixture input and reports unreachable records as unmatched", async () => {
    put("lib/contracts/fixtures/corrections.json", { data_label: "synthetic_test", records });
    expect(await main([], {}, quiet, { base })).toBe(0);
    const run = EvalRunSchema.parse(read());
    if (run.status !== "available") throw new Error("expected an available run");
    expect(run.data_label).toBe("synthetic_test");
    expect(run.policy.description).toContain("SYNTHETIC TEST DATA");
    expect(run).toMatchObject({ n_corrections: 5, excluded: { typos: 1, out_of_scope: 0, unmatched: 1 } });
    // c1 is caught by the LAYER-07 code check; c2 and c5 are missed; c3 (typo) and c4 (no source lines) are not in the denominator.
    expect(run.catch_rate).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 });
    expect(run.per_rule.find((rule) => rule.rule_id === "LAYER-07")?.catch_rate).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 });
    // Without ANTHROPIC_API_KEY, model rules with work to judge (TERM-01 on "lord") and CONS-01 are reported, never passed.
    expect(run.policy.description).toMatch(/Not evaluated in this run: [^.]*TERM-01/);
    expect(run.policy.description).toMatch(/Not evaluated in this run: [^.]*CONS-01/);
    expect(run.per_rule.some((rule) => rule.rule_id === "TERM-01" || rule.rule_id === "CONS-01")).toBe(false);
    expect(read("data/eval/latest.detail.json").items[0].units[0].caught_by[0].rule_id).toBe("LAYER-07");
  });

  it("reproduces the same run on a rerun, apart from its timestamp", async () => {
    put("lib/contracts/fixtures/corrections.json", { data_label: "synthetic_test", records });
    await main([], {}, quiet, { base, now: () => new Date("2026-10-17T00:00:00Z") });
    const first = read();
    const detail = read("data/eval/latest.detail.json");
    await main([], {}, quiet, { base, now: () => new Date("2026-10-18T00:00:00Z") });
    expect({ ...read(), at: first.at }).toEqual(first);
    expect(read("data/eval/latest.detail.json")).toEqual(detail);
    expect(read().at).not.toBe(first.at);
  });

  it("labels real review history as real and hands the unchanged file to the API-09 reader", async () => {
    put("data/sikhri-sample/normalized/corrections.json", records);
    await main([], {}, quiet, { base });
    const file = join(base, "data/eval/latest.json");
    const direct = EvalRunSchema.parse(read());
    expect(direct.status === "available" && direct.data_label).toBe("real_review_history");
    expect(getEval({ path: file })).toEqual(direct);
  });

  it("carries the synthetic label through the API-09 reader", async () => {
    put("lib/contracts/fixtures/corrections.json", { data_label: "synthetic_test", records });
    await main([], {}, quiet, { base });
    const served = getEval({ path: join(base, "data/eval/latest.json") });
    expect(served.status === "available" && served.data_label).toBe("synthetic_test");
  });

  it("writes an unavailable run, not a 0% rate, when there are no corrections", async () => {
    put("lib/contracts/fixtures/corrections.json", { data_label: "synthetic_test", records: [] });
    expect(await main([], {}, quiet, { base })).toBe(0);
    expect(read()).toMatchObject({ status: "unavailable", ruleset_version: 1 });
  });

  it("fails without writing when the input is unusable", async () => {
    put("lib/contracts/fixtures/corrections.json", "{ not json");
    const errors: string[] = [];
    expect(await main([], {}, { log: () => {}, error: (message) => errors.push(message) }, { base })).toBe(1);
    expect(errors[0]).toContain("no output was written");
    expect(existsSync(join(base, "data/eval/latest.json"))).toBe(false);
  });

  it("does not create or touch the app database", async () => {
    put("lib/contracts/fixtures/corrections.json", { data_label: "synthetic_test", records });
    await main([], {}, quiet, { base });
    expect(existsSync(join(base, "eko.db"))).toBe(false);
  });
});
