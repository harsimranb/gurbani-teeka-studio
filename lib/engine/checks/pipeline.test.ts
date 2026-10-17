import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CheckInputSchema, CheckResultSchema, DriftResultSchema, SabadSchema, findingMatchesInput } from "../../contracts/domain";
import { proposalFixture, rulesFixture } from "../../contracts/fixtures";
import { codePhaseScope, createEngine, engine } from "../index";
import { llmPackets } from "./pipeline";
import { syntheticInput } from "./test-helpers";

const PLANTED = ["The Lord sustains all (always).", "IkOankar pervades everything.", "Thou art the Giver."];

describe("CHK-10 code phase", () => {
  it("checks changed units for every rule and Sabad-scoped rules on every unit", async () => {
    const input = syntheticInput(PLANTED, { changed: [0] });
    expect(codePhaseScope(input)).toEqual({ draftIds: ["synthetic-draft-1"], ruleIds: ["TERM-03", "TERM-07"] });
    const result = CheckResultSchema.parse(await engine.runChecks(input, "code"));
    const byRule = (id: string) => result.findings.filter((finding) => finding.rule_id === id);
    expect(byRule("TERM-01").map((finding) => finding.quoted_span)).toEqual(["Lord"]);
    expect(byRule("LAYER-07").map((finding) => [finding.quoted_span, finding.severity])).toEqual([["(", "error"], [")", "error"]]);
    expect(byRule("TERM-03").map((finding) => finding.draft_id)).toEqual(["synthetic-draft-2"]);
    expect(byRule("LAYER-06")).toEqual([]); // unit 3 unchanged: unit-scoped rules don't re-check it
    expect(result.findings.every((finding) => findingMatchesInput(finding, input) && finding.model === "eko-code")).toBe(true);
    expect(result.notEvaluable.map((entry) => entry.ruleId)).toEqual(["CONS-01"]);
  });

  it("an earlier unit's first use clears a later unit's gloss finding", async () => {
    const input = syntheticInput(["IkOankar, One Universal Integrative Force, is everywhere.", "IkOankar pervades everything."], { changed: [0] });
    const result = await engine.runChecks(input, "code");
    expect(result.findings.filter((finding) => finding.rule_id === "TERM-03")).toEqual([]);
  });

  it("uses the input ruleset/rule versions and skips inactive rules", async () => {
    const rules = rulesFixture.map((rule) => rule.id === "TERM-01" ? { ...rule, resolution: { ...rule.resolution, active: false } } : rule.id === "LAYER-07" ? { ...rule, version: 3 } : rule);
    const input = syntheticInput([PLANTED[0]], { rules, rulesetVersion: 2 });
    const result = await engine.runChecks(input, "code");
    expect(result.findings.some((finding) => finding.rule_id === "TERM-01")).toBe(false);
    expect(result.findings.filter((finding) => finding.rule_id === "LAYER-07").every((finding) => finding.rule_version === 3 && finding.ruleset_version === 2)).toBe(true);
  });

  it("finds exact spans inside a grouped draft", async () => {
    const base = syntheticInput(["placeholder", "placeholder"]);
    const grouped = { ...base.sabadDrafts[0], line_ids: base.sabad.lines.map((line) => line.line_id), text: "Remembering God, the mind (at last) is still." };
    const input = CheckInputSchema.parse({ ...base, draft: grouped, sabadDrafts: [grouped], changedLineIds: grouped.line_ids });
    const result = await engine.runChecks(input, "code");
    expect(result.findings.map((finding) => [finding.rule_id, finding.quoted_span, finding.start])).toEqual([["TERM-01", "God", 12], ["LAYER-07", "(", 26], ["LAYER-07", ")", 34]]);
  });
});

describe("CHK-11 model phase", () => {
  const input = syntheticInput(["This is the only correct translation of the line.", "Remembering the gods, the mind becomes still."]);

  it("reports per-rule notEvaluable without a judge and fabricates nothing", async () => {
    const result = await engine.runChecks(input, "llm");
    expect(result.findings).toEqual([]);
    expect(result.notEvaluable.map((entry) => entry.ruleId).sort()).toEqual(["PRIN-04", "TERM-01"]);
  });

  it("keeps only valid findings for the packet's own rule and unit", async () => {
    const judged = createEngine({
      judge: async (packet) => {
        const candidate = packet.candidates[0];
        const finding = { id: `llm:${packet.rule.id}:${packet.draft.id}`, draft_id: packet.draft.id, draft_version: packet.draft.version, ruleset_version: 1, rule_id: packet.rule.id, rule_version: packet.rule.version, layer: "L2", severity: "flag", quoted_span: candidate.quoted_span, start: candidate.start, end: candidate.end, explanation: "Synthetic judge evidence.", reference_ids: [], model: "synthetic-judge", prompt_version: "synthetic-v1", state: "current", cleared_at: null };
        if (packet.rule.id === "TERM-01") return { status: "evaluated", findings: [finding, { ...finding, id: "bad-span", start: finding.start + 1 }, { ...finding, id: "other-rule", rule_id: "PRIN-04" }] };
        return { status: "not_evaluable", findings: [], reason: "Synthetic judge declined." };
      },
    });
    const result = await judged.runChecks(input, "llm");
    expect(result.findings.map((finding) => [finding.id, finding.quoted_span])).toEqual([["llm:TERM-01:synthetic-draft-2:v1:r1:16-20", "gods"]]);
    expect(result.notEvaluable).toEqual([
      { ruleId: "PRIN-04", reason: "synthetic-draft-1: Synthetic judge declined." },
      { ruleId: "TERM-01", reason: "synthetic-draft-2: 2 model finding(s) failed evidence validation and were dropped." },
    ]);
  });

  it("caps model severity at the resolved rule and rejects findings posing as code output", async () => {
    const judged = createEngine({
      judge: async (packet) => {
        const candidate = packet.candidates[0];
        const finding = { id: "model-chosen-id", draft_id: packet.draft.id, draft_version: packet.draft.version, ruleset_version: 1, rule_id: packet.rule.id, rule_version: packet.rule.version, layer: "L1", severity: "error", quoted_span: candidate.quoted_span, start: candidate.start, end: candidate.end, explanation: "Synthetic judge evidence.", reference_ids: [], model: packet.rule.id === "PRIN-04" ? "synthetic-judge" : "eko-code", prompt_version: "synthetic-v1", state: "current", cleared_at: null };
        return { status: "evaluated", findings: [finding] };
      },
    });
    const result = await judged.runChecks(input, "llm");
    expect(result.findings.map((finding) => [finding.rule_id, finding.severity, finding.layer, finding.id.startsWith("llm:PRIN-04:")])).toEqual([["PRIN-04", "flag", "L2", true]]);
    expect(result.notEvaluable.map((entry) => entry.ruleId)).toEqual(["TERM-01"]);
  });

  it("discards a schema-invalid judge response", async () => {
    const result = await createEngine({ judge: async () => ({ status: "evaluated", findings: [{ rewrite: "SYNTHETIC" }] }) }).runChecks(input, "llm");
    expect(result.findings).toEqual([]);
    expect(result.notEvaluable).toHaveLength(2);
  });
});

// Local source is exported from BaniDB by C-03; never synthesize source text.
const sourcePath = new URL("../../contracts/fixtures/sabad.demo.json", import.meta.url);
let sabad: ReturnType<typeof SabadSchema.parse> | undefined;
try { sabad = SabadSchema.parse(JSON.parse(readFileSync(sourcePath, "utf8"))); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
(sabad ? describe : describe.skip)("TERM-02 evidence from the private BaniDB fixture", () => {
  it("builds TERM-02 packets from Divine names in the unit's source lines", () => {
    const drafts = sabad!.lines.map((line, index) => ({ id: `local-${index}`, shabad_id: sabad!.shabad_id, line_ids: [line.line_id], layer: "transcreation" as const, text: "SYNTHETIC ENGLISH TEST MARKER", author: "Synthetic test author", status: "draft" as const, version: 1, updated_at: "2026-10-16T12:00:00.000Z" }));
    const input = CheckInputSchema.parse({ sabad, draft: drafts[0], sabadDrafts: drafts, changedLineIds: sabad!.lines.map((line) => line.line_id), rules: rulesFixture, rulesetVersion: 1, references: [] });
    const packets = llmPackets(input).filter((packet) => packet.rule.id === "TERM-02");
    expect(packets.length).toBeGreaterThan(0);
    expect(packets.every((packet) => packet.divineNames.length > 0 && packet.divineNames.every((hit) => packet.draft.line_ids.includes(hit.line_id)))).toBe(true);
  });
});

describe("drift boundary stub", () => {
  it("reports unavailable subchecks instead of claiming a real drift pass", async () => {
    const results = await engine.runDriftCheck(proposalFixture, { rules: rulesFixture, rulesetVersion: 1, references: [], glossary: null });
    expect(results).toHaveLength(3);
    expect(results.every((result) => DriftResultSchema.safeParse(result).success && result.assessment.status === "not_evaluable")).toBe(true);
  });
});
