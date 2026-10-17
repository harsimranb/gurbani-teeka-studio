"use client";

import { useEffect, useState } from "react";
import type { Draft } from "@/lib/contracts/domain";
import { callApi, DATA_CHANGED_EVENT } from "@/lib/client/hooks";
import type { Report } from "./model";

/**
 * Current report (findings and check runs) for each authored draft.
 * Refetches on `eko:data-changed` and polls every second while any model check is pending.
 */
export function useReports(drafts: Draft[]): Record<string, Report> {
  const key = JSON.stringify(drafts.map((d) => [d.id, d.version]));
  const [reports, setReports] = useState<Record<string, Report>>({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onChange = () => setTick((t) => t + 1);
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, onChange);
  }, []);

  const anyPending = Object.values(reports).some((r) => r.check_runs.some((run) => run.status === "pending"));
  useEffect(() => {
    if (!anyPending) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(timer);
  }, [anyPending]);

  useEffect(() => {
    const ids = (JSON.parse(key) as Array<[string, number]>).map(([id]) => id);
    let cancelled = false;
    Promise.all(ids.map((id) => callApi("getReport", { draft_id: id }).then((report) => [id, report] as const, () => null))).then((entries) => {
      if (cancelled) return;
      setReports(Object.fromEntries(entries.filter((e): e is readonly [string, Report] => e !== null)));
    });
    return () => { cancelled = true; };
  }, [key, tick]);

  return reports;
}
