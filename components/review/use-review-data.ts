"use client";

import { useCallback, useEffect, useState } from "react";
import { DATA_CHANGED_EVENT, callApi } from "@/lib/client/hooks";
import type { Draft, Rule, Sabad } from "@/lib/contracts/domain";
import { hasPendingRun, type Report, type Unit } from "./format";

interface Slot<T> { load: unknown; data: T | null; error: Error | null }

/**
 * Run `load` on mount and whenever `eko:data-changed` fires; poll every second while `isPending(data)`.
 * Old data stays visible while refetching. A new `load` identity starts from scratch.
 */
function useLiveLoad<T>(load: () => Promise<T>, isPending: (data: T) => boolean) {
  const [slot, setSlot] = useState<Slot<T> | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const onChange = () => setTick((t) => t + 1);
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => { if (!cancelled) setSlot({ load, data, error: null }); },
      (error: unknown) => {
        if (cancelled) return;
        const err = error instanceof Error ? error : new Error(String(error));
        setSlot((prev) => ({ load, data: prev && prev.load === load ? prev.data : null, error: err }));
      },
    );
    return () => { cancelled = true; };
  }, [load, tick]);

  const current = slot && slot.load === load ? slot : null;
  const pending = current?.data != null && isPending(current.data);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setTick((t) => t + 1), 1000);
    return () => clearTimeout(timer);
  }, [pending, tick]);

  return { data: current?.data ?? null, error: current?.error ?? null, refresh };
}

export type ReviewLoad =
  | { status: "unavailable"; reason: string }
  | { status: "available"; sabad: Sabad; units: Unit[]; rules: Rule[]; rulesetVersion: number };

/** Everything the review page needs for one Sabad: drafts, current reports, publish gates and rules. */
export function useReviewData(shabadId: string) {
  const load = useCallback(async (): Promise<ReviewLoad> => {
    const [sabadResponse, rules] = await Promise.all([callApi("getSabad", { shabad_id: shabadId }), callApi("listRules", {})]);
    if (sabadResponse.status === "unavailable") return { status: "unavailable", reason: sabadResponse.reason };
    const { sabad, drafts } = sabadResponse;
    const first = (draft: Draft) => Math.min(...draft.line_ids.map((id) => sabad.lines.findIndex((line) => line.line_id === id)).filter((i) => i >= 0));
    const ordered = [...drafts].sort((a, b) => first(a) - first(b));
    const units = await Promise.all(ordered.map(async (draft): Promise<Unit> => {
      const [report, gate] = await Promise.all([callApi("getReport", { draft_id: draft.id }), callApi("getPublishGate", { draft_id: draft.id })]);
      return { draft: report.draft, report, gate };
    }));
    return { status: "available", sabad, units, rules: rules.rules, rulesetVersion: rules.ruleset_version };
  }, [shabadId]);
  return useLiveLoad(load, (data) => data.status === "available" && hasPendingRun(data.units));
}

export interface QueueGroup { shabad_id: string; drafts: Draft[]; reports: Report[] }

/** The review queue grouped by Sabad, with each draft's current report (for the finding counts). */
export function useQueueData() {
  const load = useCallback(async (): Promise<QueueGroup[]> => {
    const { drafts } = await callApi("reviewQueue", {});
    const reports = await Promise.all(drafts.map((draft) => callApi("getReport", { draft_id: draft.id })));
    const groups = new Map<string, QueueGroup>();
    drafts.forEach((draft, i) => {
      const group = groups.get(draft.shabad_id) ?? { shabad_id: draft.shabad_id, drafts: [], reports: [] };
      group.drafts.push(draft);
      group.reports.push(reports[i]);
      groups.set(draft.shabad_id, group);
    });
    return [...groups.values()];
  }, []);
  return useLiveLoad(load, (groups) => groups.some((g) => g.reports.some((r) => r.check_runs.some((run) => run.status === "pending"))));
}
