import { z } from "zod";
import { CheckInputSchema, CheckPhaseSchema, DriftContextSchema, ProposalSchema, ReferenceSchema } from "../contracts/domain";
import type { Engine } from "../contracts/ports";
import { runCodePhase, runLlmPhase } from "./checks/pipeline";
import type { LlmJudge } from "./checks/pipeline";
import { runDrift } from "./drift";
import { createLlmClient } from "./llm/adapter";
import type { LlmClient } from "./llm/adapter";
import { createLlmJudge } from "./llm/judge";
import { createReferenceIndex } from "./retrieval";
import type { ReferenceIndex } from "./retrieval";

export { codePhaseScope, isCodeFinding, llmPhaseScope } from "./checks/pipeline";
export type { CodePhaseScope, LlmJudge, LlmPacket } from "./checks/pipeline";
export { runBacktest, scoreBacktest, toEvalRun } from "./eval";
export type { BacktestItem, BacktestRun, BacktestScore, EvalRunMeta } from "./eval";
export { checkedRules } from "./rules";
export { createLlmClient, DEFAULT_MODEL } from "./llm/adapter";
export type { LlmClient } from "./llm/adapter";

export interface EngineOptions {
  /** Defaults to the Anthropic client from `ANTHROPIC_API_KEY`/`EKO_LLM_MODEL`; `null` disables model checks. */
  client?: LlmClient | null;
  /** Overrides the judge built from `client` (tests). */
  judge?: LlmJudge;
  index?: ReferenceIndex;
}

/** Real code phase, model phase, drift check and reference index. Without a model, model checks report not evaluable. */
export function createEngine(options: EngineOptions = {}): Engine {
  let client: LlmClient | null | undefined = options.client;
  // Read the environment on first use, not at import, so the app can load `.env*` first.
  const getClient = () => (client === undefined ? (client = createLlmClient()) : client);
  const getJudge = () => options.judge ?? (getClient() ? createLlmJudge(getClient()!) : undefined);
  const index = options.index ?? createReferenceIndex();
  return {
    async runChecks(rawInput, rawPhase) {
      const input = CheckInputSchema.parse(rawInput);
      return CheckPhaseSchema.parse(rawPhase) === "code" ? runCodePhase(input).result : runLlmPhase(input, getJudge(), { index });
    },
    async runDriftCheck(rawProposal, rawContext) {
      return runDrift(ProposalSchema.parse(rawProposal), DriftContextSchema.parse(rawContext), { client: getClient() });
    },
    async indexReferences(references) {
      // Warming only: every check still receives its current reference snapshot.
      await index.warm(z.array(ReferenceSchema).parse(references));
    },
  };
}

export const engine: Engine = createEngine();
export const runChecks: Engine["runChecks"] = engine.runChecks;
export const runDriftCheck: Engine["runDriftCheck"] = engine.runDriftCheck;
export const indexReferences: Engine["indexReferences"] = engine.indexReferences;
