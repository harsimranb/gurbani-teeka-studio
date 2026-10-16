import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { engine } from "../index";
import { CheckInputSchema, CheckResultSchema, DriftResultSchema, SabadSchema, findingMatchesInput } from "../../contracts/domain";
import { draftFixture, proposalFixture, rulesFixture } from "../../contracts/fixtures";

// Local source is exported from BaniDB by C-03; never synthesize source text.
const sourcePath = new URL("../../contracts/fixtures/sabad.demo.json", import.meta.url);
let sabad: ReturnType<typeof SabadSchema.parse> | undefined;
try { sabad = SabadSchema.parse(JSON.parse(readFileSync(sourcePath, "utf8"))); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const sourceTests = sabad ? describe : describe.skip;
sourceTests("fixture engine boundary with private BaniDB source", () => {
  const input = () => {
    const draft = { ...draftFixture, id: "local-draft", shabad_id: sabad!.shabad_id, line_ids: sabad!.lines.slice(0, 2).map((line) => line.line_id), version: 4 };
    return CheckInputSchema.parse({ sabad, draft, sabadDrafts: [draft], changedLineIds: draft.line_ids, rules: rulesFixture, rulesetVersion: 2, references: [] });
  };
  it("rebinds synthetic evidence to actual input IDs/versions and keeps exact spans", async () => {
    const current = input();
    const result = CheckResultSchema.parse(await engine.runChecks(current, "code"));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ draft_id: "local-draft", draft_version: 4, ruleset_version: 2, rule_id: "LAYER-07", model: "synthetic-fixture-stub" });
    expect(findingMatchesInput(result.findings[0], current)).toBe(true);
    expect(result.notEvaluable.some((entry) => entry.ruleId === "TERM-02")).toBe(true);
  });
  it("attributes fixture findings to the current rule version and severity", async () => {
    const current = input();
    const updatedRules = current.rules.map((rule) => rule.id === "LAYER-07" ? { ...rule, version: 2, severity: "warning" as const, resolution: { ...rule.resolution, severity: "warning" as const } } : rule);
    const result = await engine.runChecks({ ...current, rules: updatedRules }, "code");
    expect(result.findings[0]).toMatchObject({ rule_version: 2, severity: "warning" });
  });
  it("returns no invented finding when text/rule evidence does not match", async () => {
    const current = input();
    const changed = { ...current.draft, text: "SYNTHETIC TEST WITHOUT MATCHING EVIDENCE" };
    const result = await engine.runChecks({ ...current, draft: changed, sabadDrafts: [changed] }, "code");
    expect(result.findings).toEqual([]);
    expect(result.notEvaluable.some((entry) => entry.ruleId === "LAYER-07")).toBe(true);
    expect((await engine.runChecks({ ...current, rules: current.rules.filter((rule) => rule.id !== "LAYER-07") }, "code")).findings).toEqual([]);
    expect((await engine.runChecks(current, "llm")).findings).toEqual([]);
  });
});
describe("fixture drift boundary", () => {
  it("reports unavailable subchecks instead of claiming a real drift pass", async () => {
    const results = await engine.runDriftCheck(proposalFixture, { rules: rulesFixture, rulesetVersion: 1, references: [], glossary: null });
    expect(results).toHaveLength(3);
    expect(results.every((result) => DriftResultSchema.safeParse(result).success && result.proposal_id === proposalFixture.id && result.assessment.status === "not_evaluable")).toBe(true);
  });
});
