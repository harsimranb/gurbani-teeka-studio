"use client";

import { Card, CardHeader, RuleId } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ACTION_PAST, formatTime, type Unit } from "./format";

const DOT = { accept: "bg-faint", override: "bg-link-dark", waive: "bg-ink" } as const;

/** Right column: every decision on this Sabad, newest first, with its reason. */
export function DecisionLog({ units }: { units: Unit[] | null }) {
  const entries = (units ?? [])
    .flatMap((unit) => unit.report.decisions.map((decision) => ({
      decision,
      finding: [...unit.report.findings, ...unit.report.history].find((f) => f.id === decision.finding_id),
    })))
    .sort((a, b) => b.decision.at.localeCompare(a.decision.at));
  return (
    <Card className="flex flex-col gap-3 p-[18px]" aria-label="Decision log">
      <CardHeader title="Decision log" />
      <p className="m-0 text-xs text-muted">Every reason stays visible to later reviewers.</p>
      {units === null ? <p className="m-0 text-[13px] text-muted">Loading…</p> : entries.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">No decisions yet.</p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {entries.map(({ decision, finding }) => (
            <li key={decision.id} className="flex gap-2.5 pb-3.5 last:pb-0">
              <span aria-hidden="true" className={cn("mt-[7px] size-[9px] flex-none rounded-full", DOT[decision.action])} />
              <div className="min-w-0 text-[13px]">
                <b>{decision.reviewer}</b> · {formatTime(decision.at)}
                <div className="text-body">
                  {ACTION_PAST[decision.action]}
                  {finding ? <> · <RuleId id={finding.rule_id} link /> “{finding.quoted_span}”</> : null}
                </div>
                <div className="break-words text-body">“{decision.reason}”</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
