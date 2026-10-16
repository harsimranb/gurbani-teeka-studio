import { describe, expect, it } from "vitest";
import { ApiErrorSchema, routes, type RouteName } from "./api";
import { CheckResultSchema, DraftSchema, DriftResultSchema, EvalRunSchema, findingMatchesInput } from "./domain";
import { checkResultFixture, draftFixture, driftFixtures, evalFixture, mockResponses, rulesFixture } from "./fixtures";

describe("minimal C-02 fixtures", () => {
  it("validates labelled synthetic check evidence against its real seed rule and English draft", () => {
    expect(DraftSchema.safeParse(draftFixture).success).toBe(true);
    expect(CheckResultSchema.safeParse(checkResultFixture).success).toBe(true);
    expect(checkResultFixture.findings[0].model).toBe("synthetic-fixture-stub");
    const context = { draft: draftFixture, sabadDrafts: [draftFixture], rules: rulesFixture, rulesetVersion: 1, references: [] };
    expect(findingMatchesInput(checkResultFixture.findings[0], context)).toBe(true);
    expect(findingMatchesInput({ ...checkResultFixture.findings[0], rule_id: "unknown" }, context)).toBe(false);
    expect(findingMatchesInput({ ...checkResultFixture.findings[0], reference_ids: ["missing"] }, context)).toBe(false);
    expect(findingMatchesInput(checkResultFixture.findings[0], { ...context, rulesetVersion: 2 })).toBe(false);
    expect(findingMatchesInput(checkResultFixture.findings[0], { ...context, sabadDrafts: [{ ...draftFixture, text: "different synthetic test data" }] })).toBe(false);
  });
  it("provides a schema-valid response or explicit error for every P0 route", () => {
    for (const name of Object.keys(routes) as RouteName[]) {
      const payload = mockResponses[name];
      expect(routes[name].response.safeParse(payload).success || ApiErrorSchema.safeParse(payload).success, name).toBe(true);
    }
    expect(ApiErrorSchema.parse(mockResponses.getReference).error.code).toBe("unavailable");
    expect(mockResponses.getSabad).toEqual({ status: "unavailable", reason: "Load the private BaniDB-exported fixture to view source text; no source text is synthesized." });
  });
  it("labels unknown drift and eval evidence unavailable", () => {
    expect(driftFixtures.every((result) => DriftResultSchema.safeParse(result).success && result.assessment.status === "not_evaluable")).toBe(true);
    expect(EvalRunSchema.parse(evalFixture).status).toBe("unavailable");
  });
});
