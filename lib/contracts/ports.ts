import type { CheckInput, CheckResult, DriftContext, DriftResult, Proposal, Reference } from "./domain";

/** Pure review boundary. App-owned snapshots supply all shared records; no DB access. */
export interface Engine {
  runChecks(input: CheckInput, phase: "code" | "llm"): Promise<CheckResult>;
  runDriftCheck(proposal: Proposal, context: DriftContext): Promise<DriftResult[]>;
  /** Optional index warming only: correctness uses the current references passed per call. */
  indexReferences(references: Reference[]): Promise<void>;
}
