import { describe, expect, it } from "vitest";
import { assertCompleteSabad, normalizeSourceText, toDemoSabad } from "./export-banidb-demo";

describe("BaniDB demo export boundaries", () => {
  it("normalizes source Unicode without changing its content", () => {
    // A Latin sentinel exercises Unicode handling without inventing Gurbani.
    expect(normalizeSourceText("e\u0301")).toBe("é");
    expect(normalizeSourceText("  source sentinel  ")).toBe("  source sentinel  ");
  });

  it("rejects empty or missing Unicode instead of substituting source text", () => {
    for (const value of [null, undefined, "", "   "]) {
      expect(() => normalizeSourceText(value)).toThrow("Unicode source text");
    }
  });

  it("rejects partial Sabads even when their angs and stored lines are valid", () => {
    expect(() => assertCompleteSabad(15, 5)).toThrow("Incomplete Sabad");
    expect(() => assertCompleteSabad(1, 1)).not.toThrow();
    expect(() => assertCompleteSabad(0, 0)).toThrow("Incomplete Sabad");
  });

  it("rejects source lines that consistently belong to a different Sabad than the header", () => {
    expect(() => toDemoSabad([{ ShabadID: 56 } as never], 55))
      .toThrow("Sabad header does not match source line IDs");
  });

  it("rejects an empty Sabad and source IDs outside Guru Granth Sahib", () => {
    expect(() => toDemoSabad([])).toThrow("No source lines");
    expect(() => toDemoSabad([{ SourceID: "D" } as never])).toThrow("SourceID G");
  });
});
