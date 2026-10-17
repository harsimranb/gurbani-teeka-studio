"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "@/lib/client/api";
import type { ApiResponse } from "@/lib/contracts/api";
import type { CheckRun, Draft, Finding, Line, Rule } from "@/lib/contracts/domain";
import { numberFindings, orderFindings } from "@/lib/client/finding-order";
import { callApi, DATA_CHANGED_EVENT, useApi } from "@/lib/client/hooks";

export type ReportData = ApiResponse<"getReport">;
export type GateData = ApiResponse<"getPublishGate">;

export interface UnitData {
  draft: Draft;
  report: ReportData;
  /** Rules exactly as stored for this report's ruleset version. */
  reportRules: Rule[];
  gate: GateData;
  /** Source lines covered by the unit, in the unit's own order, with 1-based Sabad positions. */
  lines: Array<{ line: Line; number: number }>;
  /** Current findings that pass the exact-span check against the unit's current text. */
  findings: Finding[];
  codeRun: CheckRun | null;
  llmRun: CheckRun | null;
}

export interface FindingEntry {
  /** 1..n global number, shared by the highlight superscript and the finding card. */
  number: number;
  finding: Finding;
  unit: UnitData;
}

/** A finding is shown as current only if it is current, matches the draft/ruleset version and quotes the draft text exactly. */
function isCurrent(finding: Finding, report: ReportData): boolean {
  return finding.state === "current"
    && finding.draft_id === report.draft.id
    && finding.draft_version === report.draft.version
    && finding.ruleset_version === report.ruleset_version
    && report.draft.text.slice(finding.start, finding.end) === finding.quoted_span;
}

/** Shared order and numbering (`@/lib/client/finding-order`), identical to the review page. */
export function buildEntries(units: UnitData[]): FindingEntry[] {
  const drafts = units.map((u) => u.draft);
  const findings = units.flatMap((u) => u.findings);
  const numbers = numberFindings(findings, drafts);
  const unitOf = new Map(units.flatMap((u) => u.findings.map((f) => [f.id, u] as const)));
  return orderFindings(findings, drafts).flatMap((finding) => {
    const unit = unitOf.get(finding.id);
    return unit ? [{ number: numbers.get(finding.id) ?? 0, finding, unit }] : [];
  });
}

interface Loaded { key: string; items: Array<{ report: ReportData; gate: GateData; rules: Rule[] }>; error: Error | null }

export interface ReportPageData {
  loading: boolean;
  error: Error | null;
  unavailableReason: string | null;
  shabadId: string;
  rulesetVersion: number | null;
  ruleList: Rule[];
  units: UnitData[];
  entries: FindingEntry[];
  anyLlmPending: boolean;
}

/** Loads the Sabad, ruleset and, per authored unit, its report and publish gate. Refetches on data change and polls every 1 s while a model run is pending. */
export function useReportData(shabadId: string): ReportPageData {
  const sabadQ = useApi("getSabad", { shabad_id: shabadId });
  const rulesQ = useApi("listRules", {});
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const sabad = sabadQ.data?.status === "available" ? sabadQ.data.sabad : null;
  const draftIds = useMemo(() => {
    if (!sabad || sabadQ.data?.status !== "available") return [] as string[];
    const order = new Map(sabad.lines.map((line, i) => [line.line_id, i] as const));
    const position = (d: Draft) => Math.min(...d.line_ids.map((id) => order.get(id) ?? Number.MAX_SAFE_INTEGER));
    return [...sabadQ.data.drafts].sort((a, b) => position(a) - position(b)).map((d) => d.id);
  }, [sabad, sabadQ.data]);
  const key = JSON.stringify([shabadId, draftIds]);

  useEffect(() => {
    const onChange = () => setTick((t) => t + 1);
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (sabadQ.data?.status !== "available") return;
    let cancelled = false;
    Promise.all(draftIds.map(async (id) => {
      const [report, gate] = await Promise.all([callApi("getReport", { draft_id: id }), callApi("getPublishGate", { draft_id: id })]);
      return { report, gate };
    })).then(async (items) => {
      const versions = [...new Set(items.map((item) => item.report.ruleset_version))];
      const snapshots = await Promise.all(versions.map(async (ruleset_version) => {
        try { return await callApi("listRules", { ruleset_version }); }
        catch (error) {
          if (error instanceof ApiClientError && error.code === "not_found") return { ruleset_version, rules: [] };
          throw error;
        }
      }));
      const rulesByVersion = new Map(snapshots.map((snapshot) => [snapshot.ruleset_version, snapshot.rules] as const));
      const withRules = items.map((item) => ({ ...item, rules: rulesByVersion.get(item.report.ruleset_version) ?? [] }));
      if (!cancelled) setLoaded({ key, items: withRules, error: null });
    }).catch((error: unknown) => {
      if (!cancelled) setLoaded({ key, items: [], error: error instanceof Error ? error : new Error(String(error)) });
    });
    return () => { cancelled = true; };
  }, [key, draftIds, tick, sabadQ.data?.status]);

  const current = loaded && loaded.key === key ? loaded : null;

  const units: UnitData[] = useMemo(() => {
    if (!sabad || !current) return [];
    return current.items.map(({ report, gate, rules }) => {
      const lines = report.draft.line_ids.flatMap((id) => {
        const index = sabad.lines.findIndex((line) => line.line_id === id);
        return index >= 0 ? [{ line: sabad.lines[index], number: index + 1 }] : [];
      });
      const runFor = (phase: "code" | "llm") => [...report.check_runs].reverse().find((run) => run.phase === phase) ?? null;
      return { draft: report.draft, report, reportRules: rules, gate, lines, findings: report.findings.filter((f) => isCurrent(f, report)), codeRun: runFor("code"), llmRun: runFor("llm") };
    });
  }, [sabad, current]);

  const anyLlmPending = units.some((u) => u.llmRun?.status === "pending");
  useEffect(() => {
    if (!anyLlmPending) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [anyLlmPending]);

  const entries = useMemo(() => buildEntries(units), [units]);
  const ruleList = rulesQ.data?.rules ?? [];

  const error = sabadQ.error ?? rulesQ.error ?? current?.error ?? null;
  const unavailableReason = sabadQ.data?.status === "unavailable" ? sabadQ.data.reason : null;
  const loading = !error && !unavailableReason && (sabadQ.data === null || rulesQ.data === null || current === null);
  return { loading, error, unavailableReason, shabadId, rulesetVersion: rulesQ.data?.ruleset_version ?? null, ruleList, units, entries, anyLlmPending };
}

/** "Line 3", "Lines 2–3" or "Lines 2, 5" from 1-based line numbers. */
export function lineLabel(numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  if (sorted.length === 0) return "Lines";
  if (sorted.length === 1) return `Line ${sorted[0]}`;
  const contiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  return contiguous ? `Lines ${sorted[0]}–${sorted[sorted.length - 1]}` : `Lines ${sorted.join(", ")}`;
}
export const unitLineLabel = (unit: UnitData) => lineLabel(unit.lines.map((l) => l.number));
