import { describe, expect, it } from "vitest";
import { splitWords } from "./word-selection";

describe("splitWords", () => {
  it("keeps every character and each word's start offset; punctuation-only and numeric tokens are not words", () => {
    const text = "ALPHA  BETA ] 12 GAMMA";
    const parts = splitWords(text);
    expect(parts.map((part) => part.text).join("")).toBe(text);
    expect(parts.filter((part) => part.word).map((part) => [part.text, part.start])).toEqual([["ALPHA", 0], ["BETA", 7], ["GAMMA", 17]]);
    for (const part of parts) expect(text.slice(part.start, part.start + part.text.length)).toBe(part.text);
  });
  it("handles empty and whitespace-only text", () => {
    expect(splitWords("")).toEqual([]);
    expect(splitWords("  ")).toEqual([{ text: "  ", start: 0, word: false }]);
  });
});
