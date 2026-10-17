import type { Draft, Finding } from "../contracts/domain";

const SEVERITY_RANK: Record<Finding["severity"], number> = { error: 0, flag: 1, warning: 2, hint: 3 };

/**
 * Shared display order for findings (report and review pages):
 * layer L1 first, then L2/style; within that error > flag > warning > hint;
 * then draft order (index of `draft_id` in `drafts`); then start offset.
 * Returns a new array; the input is not modified.
 */
export function orderFindings(findings: Finding[], drafts: Draft[]): Finding[] {
  const draftIndex = (id: string) => { const i = drafts.findIndex((d) => d.id === id); return i === -1 ? drafts.length : i; };
  return [...findings].sort((a, b) =>
    (a.layer === "L1" ? 0 : 1) - (b.layer === "L1" ? 0 : 1)
    || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || draftIndex(a.draft_id) - draftIndex(b.draft_id)
    || a.start - b.start);
}

/** Finding id -> 1..n, numbered in `orderFindings` order. */
export function numberFindings(findings: Finding[], drafts: Draft[]): Map<string, number> {
  return new Map(orderFindings(findings, drafts).map((finding, i) => [finding.id, i + 1]));
}
