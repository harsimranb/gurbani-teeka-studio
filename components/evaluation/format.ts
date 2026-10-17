import type { EvalRun } from "@/lib/contracts/domain";

export type AvailableEval = Extract<EvalRun, { status: "available" }>;
export type EvalMetric = AvailableEval["catch_rate"];

/** One decimal place, e.g. 0.75 becomes "75.0%". Null (no denominator) has no number. */
export function formatRate(metric: EvalMetric): string | null {
  return metric.rate === null ? null : `${(metric.rate * 100).toFixed(1)}%`;
}

export function formatRunTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
