import { readFileSync } from "node:fs";
import path from "node:path";
import type { ApiResponse } from "../../contracts/api";
import { EvalRunSchema } from "../../contracts/domain";
import { getStore } from "./context";
import { currentRuleset } from "./state";

const NO_OUTPUT = "No backtest output yet: run pnpm eval once real pre-edit drafts are available.";
const BAD_OUTPUT = "The latest eval output did not match its contract.";

/** Default location of the EVAL stream's output (git-ignored). Resolved per call so tests can change cwd. */
export const defaultEvalPath = (): string => path.join(process.cwd(), "data", "eval", "latest.json");

/**
 * API-09: returns the latest backtest output when it exists and matches `EvalRunSchema`.
 * Otherwise an honest `unavailable` result. Rates are never synthesised here.
 * `options.path` is injectable for tests.
 */
export function getEval(options: { path?: string } = {}): ApiResponse<"getEval"> {
  const file = options.path ?? defaultEvalPath();
  const unavailable = (reason: string): ApiResponse<"getEval"> => ({ status: "unavailable", ruleset_version: currentRuleset(getStore()).version, reason });
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return unavailable(NO_OUTPUT);
  }
  try {
    const parsed = EvalRunSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : unavailable(BAD_OUTPUT);
  } catch {
    return unavailable(BAD_OUTPUT);
  }
}
