import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../../contracts/api";
import type { EvalRun } from "../../contracts/domain";
import { GET as getEvalRoute } from "../../../app/api/eval/route";
import { __setSourceForTests, __setStoreForTests } from "./context";
import { getEval } from "./eval";
import { testSabad } from "./testing";

const NO_OUTPUT = "No backtest output yet: run pnpm eval once real pre-edit drafts are available.";
const BAD_OUTPUT = "The latest eval output did not match its contract.";
const metric = { numerator: 1, denominator: 2, rate: 0.5 };
const available: EvalRun = {
  status: "available", id: "eval-test-1", ruleset_version: 1, at: "2026-10-16T12:00:00.000Z", data_label: "synthetic_test",
  policy: { id: "test-policy", description: "SYNTHETIC TEST policy" }, n_corrections: 2, n_findings: 3,
  excluded: { typos: 0, out_of_scope: 0, unmatched: 0 }, catch_rate: metric, false_flag_rate: { numerator: 0, denominator: 0, rate: null }, per_rule: [],
};

let dir: string;
beforeEach(() => { __setSourceForTests(testSabad()); dir = mkdtempSync(join(tmpdir(), "eko-eval-")); });
afterEach(() => { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); __setSourceForTests(undefined); __setStoreForTests(null); });

function write(contents: string) {
  const file = join(dir, "latest.json");
  writeFileSync(file, contents);
  return file;
}

describe("getEval", () => {
  it("is unavailable, with the current ruleset version, when the file is missing", () => {
    expect(getEval({ path: join(dir, "missing.json") })).toEqual({ status: "unavailable", ruleset_version: 1, reason: NO_OUTPUT });
  });

  it("returns a valid run exactly as written", () => {
    expect(getEval({ path: write(JSON.stringify(available)) })).toEqual(available);
  });

  it("is unavailable when the file does not match its contract or is not JSON", () => {
    const expected = { status: "unavailable", ruleset_version: 1, reason: BAD_OUTPUT };
    expect(getEval({ path: write(JSON.stringify({ ...available, catch_rate: { numerator: 1, denominator: 2, rate: 0.9 } })) })).toEqual(expected);
    expect(getEval({ path: write("{ not json") })).toEqual(expected);
    expect(getEval({ path: write("null") })).toEqual(expected);
  });
});

describe("GET /api/eval", () => {
  it("reads data/eval/latest.json under the working directory and validates the response", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const missing = await getEvalRoute(new Request("http://localhost/api/eval"));
    expect(missing.status).toBe(200);
    expect(routes.getEval.response.parse(await missing.json())).toMatchObject({ status: "unavailable", reason: NO_OUTPUT });

    mkdirSync(join(dir, "data", "eval"), { recursive: true });
    writeFileSync(join(dir, "data", "eval", "latest.json"), JSON.stringify(available));
    const found = await getEvalRoute(new Request("http://localhost/api/eval"));
    expect(routes.getEval.response.parse(await found.json())).toEqual(available);
  });
});
