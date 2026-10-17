import type { DriftResult, Proposal, Rule } from "@/lib/contracts/domain";

/** HH:MM in the viewer's locale, 24-hour. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export const CHECK_LABEL: Record<DriftResult["assessment"]["check"], string> = {
  reference_replay: "Retroactive impact",
  glossary_collision: "Glossary collision",
  contradiction: "Contradiction",
  scope_change: "Scope change",
  duplicate: "Duplicate",
};

/** Display order of the drift checks. */
export const CHECK_ORDER: DriftResult["assessment"]["check"][] = ["reference_replay", "glossary_collision", "scope_change", "contradiction", "duplicate"];

export function blockingResults(results: DriftResult[]): DriftResult[] {
  return results.filter((r) => r.assessment.status === "evaluated" && r.assessment.outcome === "block");
}

export const STATUS_LABEL: Record<Proposal["status"], string> = { pending: "Pending", approved: "Approved", rejected: "Rejected" };

/** The first non-empty line of a proposal's own text. */
export function firstLine(text: string): string {
  return text.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "";
}

/** The rule created by approving this proposal: same verbatim text, newest version. */
export function ruleForProposal(proposal: Proposal, rules: Rule[]): Rule | null {
  const matches = rules.filter((rule) => rule.source === "proposal" && rule.text === proposal.rule_text);
  return matches.sort((a, b) => b.version - a.version)[0] ?? null;
}
