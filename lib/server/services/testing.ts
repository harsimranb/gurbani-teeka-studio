import type { CheckRun, Draft, Finding, Sabad } from "../../contracts/domain";

/** Test-only builders (ASCII markers, never Gurmukhi). Shared by service tests. */
export const TEST_AT = "2026-10-16T12:00:00.000Z";

/** A Sabad whose line IDs are `${shabadId}-L1` ... `-Ln` and whose source text is the marker TEST-SOURCE-n. */
export function testSabad(shabadId = "TEST-SABAD", lineCount = 5): Sabad {
  return {
    shabad_id: shabadId,
    lines: Array.from({ length: lineCount }, (_, i) => ({
      line_id: `${shabadId}-L${i + 1}`, shabad_id: shabadId, ang: 1, raag: "TEST-RAAG", writer: "TEST-WRITER",
      is_rahao: i === 1, gurmukhi: `TEST-SOURCE-${i + 1}`,
    })),
  };
}

export function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "draft-t1", shabad_id: "TEST-SABAD", line_ids: ["TEST-SABAD-L1"], layer: "transcreation",
    text: "SYNTHETIC TEST: [sample]", author: "Test author", status: "draft", version: 1, updated_at: TEST_AT, ...overrides,
  };
}

export function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "finding-t1", draft_id: "draft-t1", draft_version: 1, ruleset_version: 1, rule_id: "LAYER-07", rule_version: 1,
    layer: "L1", severity: "error", quoted_span: "[", start: 16, end: 17, explanation: "Synthetic bracket evidence.",
    reference_ids: [], model: "test-model", prompt_version: "test-v1", state: "current", cleared_at: null, ...overrides,
  };
}

export function makeRun(overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    id: "run-t1", draft_id: "draft-t1", draft_version: 1, ruleset_version: 1, phase: "code", status: "succeeded",
    started_at: TEST_AT, completed_at: TEST_AT, error: null, cached: false, not_evaluable: [], ...overrides,
  };
}
