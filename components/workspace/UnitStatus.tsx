"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { CountPill, PhaseStatus } from "@/components/ui";
import { countBySeverity, findingsOf, runOf, type Report, type Unit } from "./model";

export interface Inflight { code?: boolean; llm?: boolean }

function Counts({ report, phase, href }: { report: Report; phase: "code" | "llm"; href: string }) {
  return (
    <>
      {countBySeverity(findingsOf(report, phase)).map(({ severity, count }) => (
        <Link key={severity} href={href} className="no-underline"><CountPill severity={severity} count={count} size="sm" /></Link>
      ))}
    </>
  );
}

/** The left side of a unit's status row: unsaved, not checked, loading, all clear, or the two check phases with their findings. */
export function UnitStatus({ unit, dirty, report, inflight, shabadId, onRetry }: {
  unit: Unit; dirty: boolean; report: Report | undefined; inflight: Inflight; shabadId: string; onRetry: (phase: "code" | "llm") => void;
}) {
  const base = "flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px]";
  if (dirty) return <span className={`${base} font-medium text-accent-dark`} role="status">Unsaved changes</span>;
  if (unit.draftId === null) return <span className={`${base} text-muted`}>Not checked yet</span>;
  if (!report) return <span className={`${base} text-muted`} role="status">Loading checks…</span>;
  const code = runOf(report, "code");
  const llm = runOf(report, "llm");
  const running = { code: inflight.code === true, llm: inflight.llm === true };
  if (report.findings.length === 0 && code?.status === "succeeded" && llm?.status === "succeeded" && !running.code && !running.llm) {
    return <span className={`${base} text-ok`}><Check className="size-4" aria-hidden="true" />All checks clear</span>;
  }
  const href = `/workspace/${encodeURIComponent(shabadId)}/report`;
  return (
    <div className={base} role="status">
      <PhaseStatus phase="code" run={code} running={running.code} onRetry={() => onRetry("code")} />
      {!running.code ? <Counts report={report} phase="code" href={href} /> : null}
      <span className="text-line-strong" aria-hidden="true">|</span>
      <PhaseStatus phase="llm" run={llm} running={running.llm} onRetry={() => onRetry("llm")} />
      {llm?.status === "succeeded" ? <Counts report={report} phase="llm" href={href} /> : null}
    </div>
  );
}
