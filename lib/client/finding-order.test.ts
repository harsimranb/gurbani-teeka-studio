import { describe, expect, it } from "vitest";
import type { Draft, Finding } from "../contracts/domain";
import { numberFindings, orderFindings } from "./finding-order";

const draft = (id: string): Draft => ({ id, shabad_id: "s", line_ids: [id], layer: "transcreation", text: "x", author: "T", status: "draft", version: 1, updated_at: "2026-10-16T12:00:00.000Z" });
const finding = (id: string, draft_id: string, layer: Finding["layer"], severity: Finding["severity"], start: number): Finding => ({
  id, draft_id, draft_version: 1, ruleset_version: 1, rule_id: "R", rule_version: 1, layer, severity, quoted_span: "x", start, end: start + 1,
  explanation: "e", reference_ids: [], model: "m", prompt_version: "p", state: "current", cleared_at: null,
});

describe("finding order", () => {
  const drafts = [draft("a"), draft("b")];
  const all = [
    finding("l2-error", "a", "L2", "error", 0),
    finding("l1-hint", "a", "L1", "hint", 0),
    finding("l1-flag-b", "b", "L1", "flag", 0),
    finding("l1-flag-a-late", "a", "L1", "flag", 9),
    finding("l1-flag-a-early", "a", "L1", "flag", 2),
    finding("l1-error", "b", "L1", "error", 5),
    finding("style-warning", "a", "style", "warning", 0),
  ];
  it("sorts L1 first, then severity, draft order and start", () => {
    expect(orderFindings(all, drafts).map((f) => f.id)).toEqual([
      "l1-error", "l1-flag-a-early", "l1-flag-a-late", "l1-flag-b", "l1-hint", "l2-error", "style-warning",
    ]);
  });
  it("numbers 1..n in that order without mutating the input", () => {
    const before = all.map((f) => f.id);
    const numbers = numberFindings(all, drafts);
    expect(all.map((f) => f.id)).toEqual(before);
    expect(numbers.get("l1-error")).toBe(1);
    expect(numbers.get("style-warning")).toBe(7);
    expect(new Set(numbers.values()).size).toBe(all.length);
  });
});
