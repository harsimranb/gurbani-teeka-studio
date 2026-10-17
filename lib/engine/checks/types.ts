import type { CheckInput, Draft, Finding, Rule } from "../../contracts/domain";
import type { CompiledPattern } from "../rules";

/** A prefilter hit that only a model may confirm; never reported as a finding by code. */
export interface Candidate { ruleId: string; draftId: string; start: number; end: number; quoted_span: string; patternIndex: number }

export interface CheckOutput { findings: Finding[]; candidates: Candidate[] }

export interface CodeCheckContext {
  input: CheckInput;
  rule: Rule;
  patterns: CompiledPattern[];
  /** Units to report on, in Sabad line order. Sabad-scoped checks receive every unit. */
  drafts: Draft[];
}

export interface CodeCheck {
  ruleId: string;
  /** `sabad`: the result for one unit depends on other units (first use in the Sabad). */
  scope: "unit" | "sabad";
  run(context: CodeCheckContext): CheckOutput;
}
