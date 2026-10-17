import { z } from "zod";
import { CheckInputSchema, CheckPhaseSchema, DriftContextSchema, DriftResultSchema, ProposalSchema, ReferenceSchema } from "../contracts/domain";
import { driftFixtures } from "../contracts/fixtures";
import type { Engine } from "../contracts/ports";
import { runCodePhase, runLlmPhase } from "./checks/pipeline";
import type { LlmJudge } from "./checks/pipeline";

export { codePhaseScope, isCodeFinding } from "./checks/pipeline";
export type { CodePhaseScope, LlmJudge, LlmPacket } from "./checks/pipeline";

/** Real code phase (CHK-10) and model phase (CHK-11). Drift and reference indexing remain stubs. */
export function createEngine(options: { judge?: LlmJudge } = {}): Engine {
  return {
    async runChecks(rawInput, rawPhase) {
      const input = CheckInputSchema.parse(rawInput);
      return CheckPhaseSchema.parse(rawPhase) === "code" ? runCodePhase(input).result : runLlmPhase(input, options.judge);
    },
    // C-02 SYNTHETIC FIXTURE STUB until LLM-10: reports unavailable subchecks, never a pass.
    async runDriftCheck(rawProposal, rawContext) {
      const proposal = ProposalSchema.parse(rawProposal);
      DriftContextSchema.parse(rawContext);
      return driftFixtures.map((result) => DriftResultSchema.parse({ ...result, id: `synthetic-stub:${proposal.id}:${result.assessment.check}`, proposal_id: proposal.id }));
    },
    async indexReferences(references) {
      z.array(ReferenceSchema).parse(references); // Validating no-op; each check receives its current snapshot.
    },
  };
}

export const engine: Engine = createEngine();
export const runChecks: Engine["runChecks"] = engine.runChecks;
export const runDriftCheck: Engine["runDriftCheck"] = engine.runDriftCheck;
export const indexReferences: Engine["indexReferences"] = engine.indexReferences;
