import type { ApiResponse } from "@/lib/contracts/api";
import type { Decision, Draft, Finding, Sabad } from "@/lib/contracts/domain";

export type Report = ApiResponse<"getReport">;
export type Gate = ApiResponse<"getPublishGate">;
export type Blocker = Gate["blockers"][number];
export type Severity = Finding["severity"];

/** One authored unit with everything the review page needs. */
export interface Unit { draft: Draft; report: Report; gate: Gate }

/** HH:MM in the viewer's locale (24 hour). */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export const LAYER_TAG: Record<Finding["layer"], string> = { L1: "L1 · code", L2: "L2 · model", style: "style · reference set" };

/** 1-based positions of a unit's lines inside the Sabad, ascending. */
export function linePositions(sabad: Sabad, lineIds: string[]): number[] {
  return lineIds.map((id) => sabad.lines.findIndex((line) => line.line_id === id) + 1).filter((n) => n > 0).sort((a, b) => a - b);
}

/** "Line 2", "Lines 2–3" or "Lines 2, 5". */
export function positionsLabel(positions: number[], upper = false): string {
  let label: string;
  if (positions.length === 0) label = "Lines";
  else if (positions.length === 1) label = `Line ${positions[0]}`;
  else {
    const contiguous = positions.every((n, i) => i === 0 || n === positions[i - 1] + 1);
    label = contiguous ? `Lines ${positions[0]}–${positions[positions.length - 1]}` : `Lines ${positions.join(", ")}`;
  }
  return upper ? label.toUpperCase() : label;
}
export function unitLabel(sabad: Sabad, draft: Draft): string { return positionsLabel(linePositions(sabad, draft.line_ids)); }

export function unique<T>(items: T[]): T[] { return [...new Set(items)]; }
export function joinList(items: string[]): string { return items.join(", "); }

export function plural(count: number, one: string, many: string): string { return `${count} ${count === 1 ? one : many}`; }
export const SEVERITY_NOUN: Record<Severity, [string, string]> = { error: ["error", "errors"], flag: ["flag", "flags"], warning: ["warning", "warnings"], hint: ["hint", "hints"] };

export const ACTION_PAST: Record<Decision["action"], string> = { accept: "Accepted · sent back to writer", override: "Overridden", waive: "Waived" };

export function hasPendingRun(units: Unit[]): boolean {
  return units.some((unit) => unit.report.check_runs.some((run) => run.status === "pending"));
}

export interface BlockerSummary {
  /** Rule IDs of open error/flag findings that block. */
  ruleIds: string[];
  /** Separate sentences for check phases and CONS-01 departures. */
  sentences: string[];
}

/** Plain-language summary of blockers, reused for the gate and for a `publish_blocked` error. */
export function summarizeBlockers(blockers: Blocker[], units: Unit[], sabad: Sabad): BlockerSummary {
  const labelOfDraft = (draftId: string): string => {
    const unit = units.find((u) => u.draft.id === draftId);
    return unit ? unitLabel(sabad, unit.draft) : "an authored unit";
  };
  const labelOfFinding = (findingId: string): string => {
    const unit = units.find((u) => [...u.report.findings, ...u.report.history].some((f) => f.id === findingId));
    return unit ? unitLabel(sabad, unit.draft) : "an authored unit";
  };
  const ruleIds = unique(blockers.flatMap((b) => (b.kind === "finding" ? [b.rule_id] : [])));
  const sentences: string[] = [];
  const phases = blockers.filter((b): b is Extract<Blocker, { kind: "check_phase" }> => b.kind === "check_phase");
  for (const phase of ["llm", "code"] as const) {
    for (const status of ["pending", "missing", "failed"] as const) {
      const labels = unique(phases.filter((b) => b.phase === phase && b.status === status).map((b) => labelOfDraft(b.draft_id)));
      if (labels.length === 0) continue;
      const noun = phase === "llm" ? "Model checks" : "Code checks";
      const where = joinList(labels);
      if (status === "pending") sentences.push(`${noun} are still running for ${where}.`);
      else if (status === "missing") sentences.push(`${noun} have not run on the current version for ${where}.`);
      else sentences.push(`${noun} failed for ${where}.`);
    }
  }
  const departures = unique(blockers.flatMap((b) => (b.kind === "departure_reason" ? [labelOfFinding(b.finding_id)] : [])));
  if (departures.length > 0) sentences.push(`A CONS-01 departure needs a recorded reason (${joinList(departures)}).`);
  return { ruleIds, sentences };
}
