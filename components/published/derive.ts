import type { ApiResponse } from "@/lib/contracts/api";
import type { Draft, PublishGate, Reference, Sabad } from "@/lib/contracts/domain";
import type { Publication } from "./mock-adapter";

export type Report = ApiResponse<"getReport">;

export interface UnitData {
  draft: Draft;
  report: Report;
  gate: PublishGate;
  publication: Publication | null;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown time";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** 1-based positions of the given line IDs within `sabad.lines`, ascending. */
export function linePositions(sabad: Sabad, lineIds: string[]): number[] {
  return lineIds
    .map((id) => sabad.lines.findIndex((line) => line.line_id === id) + 1)
    .filter((position) => position > 0)
    .sort((a, b) => a - b);
}

/** "Line 3", "Lines 3–4" (contiguous) or "Lines 2, 5". */
export function lineRangeLabel(positions: number[]): string {
  if (positions.length === 0) return "Lines unavailable";
  if (positions.length === 1) return `Line ${positions[0]}`;
  const contiguous = positions.every((p, i) => i === 0 || p === positions[i - 1] + 1);
  return contiguous ? `Lines ${positions[0]}–${positions[positions.length - 1]}` : `Lines ${positions.join(", ")}`;
}

export function firstPosition(sabad: Sabad, draft: Draft): number {
  return linePositions(sabad, draft.line_ids)[0] ?? Number.MAX_SAFE_INTEGER;
}

export interface GateSummary {
  errors: number;
  flags: number;
  incompletePhases: number;
  departuresWithoutReason: number;
  warnings: number;
}

/** Counted from the gate recorded at publish time (never the current gate). A CONS-01 departure with a recorded reference exception counts as having its reason. */
export function summarizeGate(units: UnitData[], references: Reference[]): GateSummary {
  const summary: GateSummary = { errors: 0, flags: 0, incompletePhases: 0, departuresWithoutReason: 0, warnings: 0 };
  for (const unit of units) {
    const gate = unit.publication?.gate;
    if (!gate) continue;
    let departures = 0;
    for (const blocker of gate.blockers) {
      if (blocker.kind === "finding") { if (blocker.severity === "error") summary.errors += 1; else summary.flags += 1; }
      else if (blocker.kind === "check_phase") summary.incompletePhases += 1;
      else departures += 1;
    }
    const reference = references.find((r) => r.id === unit.publication?.reference_id);
    const recorded = reference?.exceptions.filter((e) => e.rule_id === "CONS-01" && e.action === "context_reason").length ?? 0;
    summary.departuresWithoutReason += Math.max(0, departures - recorded);
    summary.warnings += gate.warning_ids.length;
  }
  return summary;
}

export interface DecisionLine { key: string; rule_id: string; kind: "overridden" | "waived" | "departure"; reviewer: string; reason: string; at: string }

/** Override and waive decisions on the published version, plus recorded CONS-01 departure reasons. */
export function collectDecisions(units: UnitData[], references: Reference[]): DecisionLine[] {
  const lines: DecisionLine[] = [];
  for (const unit of units) {
    const findings = [...unit.report.findings, ...unit.report.history];
    for (const decision of unit.report.decisions) {
      if (decision.action === "accept" || decision.draft_version !== unit.draft.version) continue;
      const finding = findings.find((f) => f.id === decision.finding_id);
      lines.push({
        key: decision.id, rule_id: finding?.rule_id ?? decision.finding_id,
        kind: decision.action === "override" ? "overridden" : "waived",
        reviewer: decision.reviewer, reason: decision.reason, at: decision.at,
      });
    }
    const reference = references.find((r) => r.id === unit.publication?.reference_id);
    for (const exception of reference?.exceptions ?? []) {
      if (exception.action !== "context_reason") continue;
      lines.push({ key: `${reference?.id}:${exception.decision_id}`, rule_id: exception.rule_id, kind: "departure", reviewer: exception.reviewer, reason: exception.reason, at: exception.at });
    }
  }
  return lines.sort((a, b) => a.at.localeCompare(b.at));
}

/** True when a published unit's CURRENT gate has blockers (for example after a new ruleset version cleared its results). */
export function currentStateDiffers(units: UnitData[]): boolean {
  return units.some((u) => u.gate.blockers.length > 0);
}
