import { CheckInputSchema } from "../../contracts/domain";
import type { CheckInput, Rule } from "../../contracts/domain";
import { rulesFixture } from "../../contracts/fixtures";

// SYNTHETIC test input. The source placeholder is Latin text, never Gurmukhi (hard rule 2).
export const SOURCE_PLACEHOLDER = "SYNTHETIC SOURCE PLACEHOLDER, NOT GURBANI";

/** One synthetic authored unit per English text, in Sabad order. `changed` lists unit indexes (default: all). */
export function syntheticInput(texts: string[], options: { changed?: number[]; rules?: Rule[]; rulesetVersion?: number } = {}): CheckInput {
  const lines = texts.map((_, index) => ({
    line_id: `synthetic-line-${index + 1}`, shabad_id: "synthetic-sabad", ang: 1, raag: "Synthetic raag",
    writer: "Synthetic writer", is_rahao: false, gurmukhi: SOURCE_PLACEHOLDER,
  }));
  const drafts = texts.map((text, index) => ({
    id: `synthetic-draft-${index + 1}`, shabad_id: "synthetic-sabad", line_ids: [lines[index].line_id], layer: "transcreation" as const,
    text, author: "Synthetic test author", status: "draft" as const, version: 1, updated_at: "2026-10-16T12:00:00.000Z",
  }));
  const changed = options.changed ?? texts.map((_, index) => index);
  return CheckInputSchema.parse({
    sabad: { shabad_id: "synthetic-sabad", lines }, draft: drafts[changed[0] ?? 0], sabadDrafts: drafts,
    changedLineIds: changed.map((index) => lines[index].line_id), rules: options.rules ?? rulesFixture,
    rulesetVersion: options.rulesetVersion ?? 1, references: [],
  });
}
