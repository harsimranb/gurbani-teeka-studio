import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SabadSchema } from "../../contracts/domain";
import { passesReviewGuards } from "./guards";

// Gurmukhi comes only from the git-ignored BaniDB fixture (hard rule 2); these tests skip without it.
const sourcePath = new URL("../../contracts/fixtures/sabad.demo.json", import.meta.url);
let sabad: ReturnType<typeof SabadSchema.parse> | undefined;
try { sabad = SabadSchema.parse(JSON.parse(readFileSync(sourcePath, "utf8"))); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const sourceTests = sabad ? describe : describe.skip;

const draft = "Through the Word, the mind is steadied. The Lord sustains all.";

describe("review guards", () => {
  it.each([
    'Use "the Creator" instead of "the Lord".',
    'This should be rendered as "Creator".',
    'The draft would be closer as: "The Creator sustains all."',
    "Prefer Creator here.",
    "A preferable word exists.",
    "This is not accurate.",
    "The draft is inaccurate.",
    "This is an error in translation.",
    "It could be rendered differently.",
    "The line might read otherwise.",
    "Consider rendering it as something else.",
    "This is wrong.",
    "The line is incorrect.",
    "A mistranslation.",
  ])("rejects %s", (text) => {
    expect(passesReviewGuards(text, [draft])).toBe(false);
  });

  it("keeps descriptions of a draft's claim, including words the rule itself uses", () => {
    const claim = "This is the only correct translation of the line.";
    expect(passesReviewGuards("The draft presents its rendering as the single correct translation of the line.", [claim])).toBe(true);
    expect(passesReviewGuards("The draft says 'other translations are wrong'.", ["Other translations are wrong."])).toBe(true);
    expect(passesReviewGuards("The draft labels other renderings wrong.", [claim, "Never label a rendering as the single correct translation, or other translations as wrong."])).toBe(false);
    expect(passesReviewGuards("Render it as something else.", [claim])).toBe(false);
  });

  it("keeps neutral uses of 'preferred'", () => {
    expect(passesReviewGuards("The phrase 'the Word' differs from the preferred transcribed term Sabad.", [draft])).toBe(true);
  });

  it("rejects a quote that is not in the allowed evidence, in any quote style", () => {
    expect(passesReviewGuards('A rendering such as "the Creator" would retain the attribute.', [draft])).toBe(false);
    expect(passesReviewGuards("A rendering such as “the Creator” would retain it.", [draft])).toBe(false);
    expect(passesReviewGuards("A rendering such as ‘the Creator’ would retain it.", [draft])).toBe(false);
    expect(passesReviewGuards("A rendering such as 'the Creator' would retain it.", [draft])).toBe(false);
    expect(passesReviewGuards('A quote "the Word" with no allowed evidence.')).toBe(false);
  });

  it("accepts neutral explanations and quotes found in the evidence (case-insensitive)", () => {
    expect(passesReviewGuards("The phrase 'the Word' stands for the core term Sabad and differs from the transcribed form.", [draft])).toBe(true);
    expect(passesReviewGuards("The draft's 'Lord' does not retain the Creator attribute.", [draft])).toBe(true);
    expect(passesReviewGuards('The phrase "THE LORD" differs from the rule.', [draft])).toBe(true);
    expect(passesReviewGuards("The phrase “the Word” differs from the rule.", [draft])).toBe(true);
    expect(passesReviewGuards("Differs from reference rendering ref-1; it carries an exception mark.")).toBe(true);
    expect(passesReviewGuards("The draft's wording and the model's reading differ.")).toBe(true);
  });
});

sourceTests("Gurmukhi in model text (hard rule 2)", () => {
  const words = (text: string): string[] => text.match(/[\u0A00-\u0A7F]+/gu) ?? [];
  const lines = sabad!.lines.map((line) => line.gurmukhi);
  const [first, second] = lines;
  const own = words(first).find((word) => [...word].length > 1)!;
  const elsewhere = words(second).find((word) => !words(first).includes(word))!;

  it("passes a whole source word copied from the evidence", () => {
    expect(passesReviewGuards(`The source name ${own} differs from the draft phrase.`, [first])).toBe(true);
  });

  it("drops Gurmukhi that is not a whole word of the evidence", () => {
    expect(passesReviewGuards(`The source name ${own.slice(0, -1)} differs from the draft phrase.`, [first])).toBe(false);
    expect(passesReviewGuards(`The source name ${elsewhere} differs from the draft phrase.`, [first])).toBe(false);
    expect(passesReviewGuards(`The source name ${own} differs from the draft phrase.`)).toBe(false);
  });
});
