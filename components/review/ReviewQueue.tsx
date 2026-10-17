"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import { SEVERITY_NOUN, formatTime, unique, type Severity } from "./format";
import { useQueueData, type QueueGroup } from "./use-review-data";

const COUNT_COLOR: Record<Severity, string> = { error: "text-error", flag: "text-flag", warning: "text-warning", hint: "text-muted" };
const SEVERITIES: Severity[] = ["error", "flag", "warning", "hint"];

function QueueItem({ group, selected }: { group: QueueGroup; selected: boolean }) {
  const version = Math.max(...group.drafts.map((d) => d.version));
  const authors = unique(group.drafts.map((d) => d.author)).join(", ");
  const latest = group.drafts.map((d) => d.updated_at).sort().at(-1);
  const findings = group.reports.flatMap((r) => r.findings);
  const counts = SEVERITIES.map((severity) => ({ severity, count: findings.filter((f) => f.severity === severity).length })).filter((c) => c.count > 0);
  return (
    <Link
      href={`/review/${encodeURIComponent(group.shabad_id)}`}
      aria-current={selected ? "true" : undefined}
      className={cn("flex flex-col gap-1 rounded-lg p-3 text-ink no-underline hover:bg-subtle", selected && "bg-accent-bg ring-1 ring-inset ring-accent-line hover:bg-accent-bg")}
    >
      <span className={cn("text-sm", selected ? "font-semibold" : "font-medium")}>Sabad {group.shabad_id}</span>
      <span className={cn("text-xs", selected ? "text-body" : "text-muted")}>
        {authors} · transcreation v{version}{latest ? ` · ${formatTime(latest)}` : ""}
      </span>
      <span className="flex flex-wrap gap-x-1.5 font-mono text-[11px] font-semibold">
        {counts.length === 0
          ? <span className="text-muted">No open findings</span>
          : counts.map(({ severity, count }) => (
            <span key={severity} className={COUNT_COLOR[severity]}>{count} {SEVERITY_NOUN[severity][count === 1 ? 0 : 1]}</span>
          ))}
      </span>
    </Link>
  );
}

/** Left column: drafts that are ready for review, grouped by Sabad. */
export function ReviewQueue({ selectedId }: { selectedId?: string }) {
  const { data, error } = useQueueData();
  let body: ReactNode;
  if (error && !data) body = <p role="alert" className="m-0 text-[13px] text-error">The queue could not be loaded: {error.message}</p>;
  else if (!data) body = <p className="m-0 text-[13px] text-muted">Loading the queue…</p>;
  else if (data.length === 0) body = <p className="m-0 text-[13px] text-muted">Nothing is ready for review.</p>;
  else body = <div className="flex flex-col gap-1">{data.map((group) => <QueueItem key={group.shabad_id} group={group} selected={group.shabad_id === selectedId} />)}</div>;
  return (
    <Card className="flex flex-col gap-3 p-[18px]" aria-label="Ready for review">
      <CardHeader title="Ready for review" />
      <p className="m-0 text-xs text-muted">Anyone can review. Your decisions are saved under your name.</p>
      {body}
    </Card>
  );
}
