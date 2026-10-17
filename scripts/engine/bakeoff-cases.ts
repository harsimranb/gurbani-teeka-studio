import { existsSync, readFileSync } from "node:fs";
import { CheckInputSchema, SabadSchema } from "../../lib/contracts/domain";
import type { CheckInput } from "../../lib/contracts/domain";
import { rulesFixture } from "../../lib/contracts/fixtures";
import { divineNameFamilies, findDivineNames } from "../../lib/engine/gurmukhi";

export type Expectation = { kind: "pass" } | { kind: "flag"; span: string };

export interface BakeoffCase {
  id: string; rule_id: string; text: string; expect: Expectation;
  /** SYNTHETIC English (RULES_NOTES section 10 style); the source side is a Latin placeholder, never Gurbani. */
  synthetic: boolean; note?: string;
  /** Builds the engine input for this case; omitted for plain synthetic cases. */
  input?: () => CheckInput;
}

const SOURCE_PLACEHOLDER = "SYNTHETIC SOURCE PLACEHOLDER, NOT GURBANI";
const AT = "2026-10-16T12:00:00.000Z";

function draftFor(shabadId: string, lineIds: string[], text: string) {
  return { id: "bakeoff-draft-1", shabad_id: shabadId, line_ids: lineIds, layer: "transcreation" as const, text, author: "Bakeoff", status: "draft" as const, version: 1, updated_at: AT };
}

/** One unit, only the case's rule active so each case asks the model that rule's question and nothing else. */
export function syntheticInput(ruleId: string, text: string): CheckInput {
  const line = { line_id: "bakeoff-line-1", shabad_id: "bakeoff-sabad", ang: 1, raag: "Synthetic raag", writer: "Synthetic writer", is_rahao: false, gurmukhi: SOURCE_PLACEHOLDER };
  const draft = draftFor("bakeoff-sabad", [line.line_id], text);
  return CheckInputSchema.parse({
    sabad: { shabad_id: "bakeoff-sabad", lines: [line] }, draft, sabadDrafts: [draft], changedLineIds: [line.line_id],
    rules: rulesFixture.filter((rule) => rule.id === ruleId), rulesetVersion: 1, references: [],
  });
}

const pass = (id: string, rule_id: string, text: string, note?: string): BakeoffCase => ({ id, rule_id, text, expect: { kind: "pass" }, synthetic: true, note });
const flag = (id: string, rule_id: string, text: string, span: string, note?: string): BakeoffCase => ({ id, rule_id, text, expect: { kind: "flag", span }, synthetic: true, note });

export const syntheticCases: BakeoffCase[] = [
  pass("term01-lower-pass-1", "TERM-01", "The gods of the old kingdoms fell, and their temples emptied.", "lowercase referent is worldly or another tradition"),
  pass("term01-lower-pass-2", "TERM-01", "The lords of the old kingdoms bowed to no one."),
  flag("term01-lower-flag-1", "TERM-01", "Remembering the lord, the mind becomes still.", "lord", "lowercase word renders the Divine"),
  flag("term01-lower-flag-2", "TERM-01", "The mind rests in the god who sustains all.", "god"),
  pass("prin04-pass-1", "PRIN-04", "Some read this line as fear; here it is read as awe.", "no prefilter hit: model may not be consulted"),
  flag("prin04-flag-1", "PRIN-04", "This is the only correct translation of the line.", "the only correct translation"),
  pass("prin04-pass-3", "PRIN-04", "The workshop on mistranslation ended at noon.", "keyword hit, no claim about any rendering"),
  pass("prin04-pass-2", "PRIN-04", "He was a true friend when it mattered.", "false-positive control; no prefilter hit"),
  flag("layer06-flag-1", "LAYER-06", "Thou art the Giver; Thy gifts are endless.", "art", "the ambiguous-word candidate"),
  pass("layer06-pass-1", "LAYER-06", "The best rest is found in the forest of contentment.", "false-positive control for -est"),
  pass("layer06-pass-2", "LAYER-06", "The art of waiting is learned slowly.", "art as a noun"),
  flag("layer06-flag-2", "LAYER-06", "The Giver giveth, and the gifts never run out.", "giveth", "-eth archaism"),
  pass("term07-pass-1", "TERM-07", "He gave his word, and the name of the village was changed.", "worldly word and name"),
  pass("term07-pass-2", "TERM-07", "The choir finished its hymn and the hall fell silent.", "ordinary hymn, not a substitute for Sabad"),
  flag("term07-flag-1", "TERM-07", "Through the Word, the mind is steadied.", "the Word", "substitute for Sabad"),
  flag("term07-flag-2", "TERM-07", "Meditating on the Name, the mind is steadied.", "the Name", "substitute for Naam"),
];

export const DEFAULT_SABAD_PATH = new URL("../../lib/contracts/fixtures/sabad.demo.json", import.meta.url);
export const TERM02_UNAVAILABLE = "unavailable: no BaniDB fixture with a Divine-name hit";

/**
 * TERM-02 control from the git-ignored BaniDB export: a line with a Divine-name hit, English that keeps no name.
 * Eko judges only the Creator family and the collapse detector, so this control expects no finding. Creator-family
 * attribute pairs would need that family identified from the data; none is attempted (no hand-typed Gurmukhi).
 */
export function term02Cases(path: URL | string = DEFAULT_SABAD_PATH): { cases: BakeoffCase[]; unavailable: string | null } {
  if (!existsSync(path)) return { cases: [], unavailable: TERM02_UNAVAILABLE };
  const sabad = SabadSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  const families = divineNameFamilies(rulesFixture);
  const line = sabad.lines.find((candidate) => findDivineNames(candidate, families).length > 0);
  if (!line) return { cases: [], unavailable: TERM02_UNAVAILABLE };
  const text = "The Divine is remembered, and the mind becomes still.";
  const draft = draftFor(sabad.shabad_id, [line.line_id], text);
  const input = () => CheckInputSchema.parse({
    sabad, draft, sabadDrafts: [draft], changedLineIds: [line.line_id],
    rules: rulesFixture.filter((rule) => rule.id === "TERM-02"), rulesetVersion: 1, references: [],
  });
  return { cases: [{ id: "term02-control-1", rule_id: "TERM-02", text, expect: { kind: "pass" }, synthetic: true, input, note: `English is synthetic; source line ${line.line_id} comes from the BaniDB fixture` }], unavailable: null };
}
