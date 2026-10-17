import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findingMatchesInput } from "../../contracts/domain";
import { rulesFixture } from "../../contracts/fixtures";
import { checkedRules } from "../rules";
import { runCodePhase } from "./pipeline";
import { syntheticInput } from "./test-helpers";

interface GoldenRow { rule: string; sentence: string; note: string; expect: "pass" | "flag"; detail: string; quoted: string | null; modelNote: boolean }

const notesPath = new URL("../../../_docs/rules/RULES_NOTES.md", import.meta.url);

function parseGolden(): GoldenRow[] {
  const markdown = readFileSync(notesPath, "utf8");
  const start = markdown.search(/^## 10\./m);
  const section = markdown.slice(start).split("\n");
  const rows: GoldenRow[] = [];
  for (const line of section.slice(1)) {
    if (/^## /.test(line)) break;
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 4 || cells[0] === "Rule" || /^-+$/.test(cells[0])) continue;
    const [rule, layer, rawSentence, rawExpect] = cells;
    if (layer !== "transcreation") continue;
    const note = rawSentence.match(/^\[([^\]]*)\]\s*/)?.[1] ?? "";
    const sentence = rawSentence.replace(/^\[[^\]]*\]\s*/, "");
    const kind = rawExpect.startsWith("pass") ? "pass" : rawExpect.startsWith("flag") ? "flag" : null;
    if (!kind) throw new Error(`Unrecognised Expect cell: ${rawExpect}`);
    rows.push({ rule, sentence, note, expect: kind, detail: rawExpect, quoted: rawExpect.match(/"([^"]+)"/)?.[1] ?? null, modelNote: rawExpect.includes("-est") });
  }
  return rows;
}

const CODE_TIER = new Set(["TERM-01", "TERM-03", "TERM-07", "LAYER-06", "LAYER-07", "LAYER-08", "PRIN-04"]);
const checked = new Set(checkedRules(rulesFixture).map((rule) => rule.id));
const allRows = parseGolden();
const rows = allRows.filter((row) => checked.has(row.rule));

describe("CHK-03 golden harness: RULES_NOTES section 10 transcreation rows", () => {
  it("parses a non-trivial table", () => {
    expect(allRows.length).toBeGreaterThanOrEqual(20);
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows.every((row) => row.sentence.length > 0)).toBe(true);
  });

  it("lists checked rules that have no transcreation golden rows", () => {
    const covered = new Set(rows.map((row) => row.rule));
    const gap = [...checked].filter((id) => !covered.has(id)).sort();
    console.info(`Checked rules with no transcreation golden rows: ${gap.join(", ")}`);
    expect(gap).toEqual(["CONS-01", "LAYER-09", "PRIN-01", "PRIN-06", "PRIN-07", "PRIN-08", "TERM-02"]);
  });

  it.each(rows.map((row) => [`${row.rule} · ${row.expect}${row.quoted ? ` "${row.quoted}"` : ""} · ${row.sentence}`, row] as const))("%s", (_name, row) => {
    const input = syntheticInput([row.sentence]);
    if (row.rule === "LAYER-08") {
      const literal = { ...input.draft, id: "synthetic-literal-1", layer: "literal" as const,
        text: row.expect === "flag" ? "The restless mind (is) steadied (by) wisdom." : "A different synthetic literal." };
      input.relatedDrafts = [literal];
    }
    const { result, candidates } = runCodePhase(input);
    const findings = result.findings.filter((finding) => finding.rule_id === row.rule);
    const own = candidates.filter((candidate) => candidate.ruleId === row.rule);
    for (const finding of result.findings) {
      expect(findingMatchesInput(finding, input), finding.id).toBe(true);
      expect(finding.explanation.replace(finding.quoted_span, "")).not.toMatch(/incorrect|wrong/i);
    }
    const tier = CODE_TIER.has(row.rule) ? "code" : "model";

    if (row.expect === "pass") {
      expect(findings.map((finding) => finding.quoted_span), "unexpected finding").toEqual([]);
      if (!row.modelNote) expect(own.map((candidate) => candidate.quoted_span), "unexpected candidate").toEqual([]);
      return;
    }
    if (tier === "model") {
      expect(findings.length + own.length, "model-tier rule needs a finding or candidate").toBeGreaterThan(0);
      return;
    }
    if (row.rule === "PRIN-04" && findings.length === 0) {
      expect(own.length, "only a model can confirm; code must at least raise a candidate").toBeGreaterThan(0);
      return;
    }
    expect(findings.length, "code tier must raise a finding").toBeGreaterThan(0);
    if (row.quoted) expect(findings.some((finding) => finding.quoted_span.includes(row.quoted!)), `a finding quoting ${row.quoted}`).toBe(true);
  });
});
