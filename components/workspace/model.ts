import { DRAFT_STATUS, type Tone } from "@/components/ui";
import type { ApiResponse } from "@/lib/contracts/api";
import type { CheckRun, Draft, Finding, Line } from "@/lib/contracts/domain";

export type Report = ApiResponse<"getReport">;
export type Severity = Finding["severity"];
export const SEVERITIES: Severity[] = ["error", "flag", "warning", "hint"];

/** One authored unit on screen: an existing draft, a merged/split group, or a single not-yet-written line. */
export interface Unit {
  /** Stable React key: the first covered line. Units cover disjoint lines, so it is unique. */
  key: string;
  lineIds: string[];
  text: string;
  /** null for new units and for merged/split units (they are saved as new drafts). */
  draftId: string | null;
  version: number | null;
  /** What the server holds for this unit, to detect unsaved changes. */
  base: { text: string; lineIds: string[] };
}

export const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value, i) => value === b[i]);

export function isDirty(unit: Unit): boolean {
  if (unit.draftId === null) return unit.text.trim() !== "";
  return unit.text !== unit.base.text || !sameList(unit.lineIds, unit.base.lineIds);
}

const unitKey = (lineIds: string[]) => `u:${lineIds[0]}`;

/** Authored units in source order: each draft once (at its first line), every uncovered line as a new single-line unit. */
export function buildUnits(lines: Line[], drafts: Draft[]): Unit[] {
  const order = new Map(lines.map((line, i) => [line.line_id, i]));
  const byFirst = new Map<string, Draft>();
  for (const draft of drafts) {
    const ids = draft.line_ids.filter((id) => order.has(id)).sort((a, b) => order.get(a)! - order.get(b)!);
    if (ids.length > 0 && !byFirst.has(ids[0])) byFirst.set(ids[0], { ...draft, line_ids: ids });
  }
  const covered = new Set<string>();
  const units: Unit[] = [];
  for (const line of lines) {
    if (covered.has(line.line_id)) continue;
    const draft = byFirst.get(line.line_id);
    if (draft) {
      draft.line_ids.forEach((id) => covered.add(id));
      units.push({ key: unitKey(draft.line_ids), lineIds: draft.line_ids, text: draft.text, draftId: draft.id, version: draft.version, base: { text: draft.text, lineIds: draft.line_ids } });
    } else {
      covered.add(line.line_id);
      units.push(newUnit([line.line_id]));
    }
  }
  return units;
}

function newUnit(lineIds: string[], text = ""): Unit {
  return { key: unitKey(lineIds), lineIds, text, draftId: null, version: null, base: { text: "", lineIds } };
}

/** Merge a unit with the one after it. The text is the writer's own: both texts, trimmed, joined by one space. */
export function mergeWithNext(units: Unit[], index: number): Unit[] {
  const a = units[index];
  const b = units[index + 1];
  if (!a || !b) return units;
  const text = [a.text.trim(), b.text.trim()].filter(Boolean).join(" ");
  return [...units.slice(0, index), newUnit([...a.lineIds, ...b.lineIds], text), ...units.slice(index + 2)];
}

/** Split a group: the text stays with the first line, the other lines become empty new units. */
export function ungroup(units: Unit[], index: number): Unit[] {
  const unit = units[index];
  if (!unit || unit.lineIds.length < 2) return units;
  const [first, ...rest] = unit.lineIds;
  return [...units.slice(0, index), newUnit([first], unit.text), ...rest.map((id) => newUnit([id])), ...units.slice(index + 1)];
}

/** After the server drafts changed: take the fresh layout unless there are unsaved edits, in which case only refresh versions. */
export function syncUnits(prev: Unit[], fresh: Unit[]): Unit[] {
  if (!prev.some(isDirty)) return fresh;
  return prev.map((unit) => {
    const match = unit.draftId ? fresh.find((f) => f.draftId === unit.draftId) : undefined;
    return match && match.version !== unit.version ? { ...unit, version: match.version, base: match.base } : unit;
  });
}

/** "Line 4", "Lines 2–3" or "Lines 2, 5" from source line IDs, numbered by position in the Sabad. */
export function lineLabel(lineIds: string[], numberOf: (lineId: string) => number): string {
  const nums = lineIds.map(numberOf).sort((a, b) => a - b);
  if (nums.length === 1) return `Line ${nums[0]}`;
  const contiguous = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  return contiguous ? `Lines ${nums[0]}–${nums[nums.length - 1]}` : `Lines ${nums.join(", ")}`;
}

export function runOf(report: Report | undefined, phase: "code" | "llm"): CheckRun | null {
  return report?.check_runs.find((run) => run.phase === phase) ?? null;
}

/** Code findings are layer L1; model findings are L2 and style. */
export function findingsOf(report: Report | undefined, phase: "code" | "llm"): Finding[] {
  return (report?.findings ?? []).filter((f) => (f.layer === "L1") === (phase === "code"));
}

export function countBySeverity(findings: Finding[]): Array<{ severity: Severity; count: number }> {
  return SEVERITIES.map((severity) => ({ severity, count: findings.filter((f) => f.severity === severity).length })).filter((c) => c.count > 0);
}

export interface SabadStatus { label: string; tone: Tone }

/** Status of a whole Sabad derived from its drafts; per-draft labels and tones come from DRAFT_STATUS. */
export function sabadStatus(drafts: Draft[]): SabadStatus {
  if (drafts.length === 0) return { label: "Not started", tone: "neutral" };
  const published = drafts.filter((d) => d.status === "published").length;
  if (published === drafts.length) return DRAFT_STATUS.published;
  if (published > 0) return { label: "Partly published", tone: "info" };
  if (drafts.some((d) => d.status === "changes_requested")) return DRAFT_STATUS.changes_requested;
  if (drafts.some((d) => d.status === "draft")) return DRAFT_STATUS.draft;
  return DRAFT_STATUS.ready_for_review;
}
