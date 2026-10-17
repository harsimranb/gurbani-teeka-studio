"use client";

import { useState } from "react";
import { Ban, Check } from "lucide-react";
import { Card, Mono, RuleId } from "@/components/ui";
import type { DriftResult } from "@/lib/contracts/domain";
import { cn } from "@/lib/utils";
import { blockingResults, CHECK_LABEL, CHECK_ORDER } from "./format";

type Assessment = DriftResult["assessment"];

function OutcomePill({ assessment }: { assessment: Assessment }) {
  const base = "inline-flex items-center rounded-full border px-2 py-px font-mono text-[11px] font-semibold";
  if (assessment.status === "not_evaluable") return <span className={cn(base, "border-line-strong text-muted")}>Unavailable</span>;
  if (assessment.outcome === "block") return <span className={cn(base, "border-error text-error")}>Block</span>;
  if (assessment.outcome === "warn") return <span className={cn(base, "border-warning text-warning")}>Warn</span>;
  return <span className={cn(base, "border-ok text-ok")}>Pass</span>;
}

const CHIP = "rounded-md bg-info-bg/50 px-2 py-0.5 font-mono text-xs text-ink";

function Evidence({ evidence }: { evidence: Extract<Assessment, { status: "evaluated" }>["evidence"] }) {
  const [all, setAll] = useState(false);
  const ids = evidence.reference_ids;
  const shown = all ? ids : ids.slice(0, 3);
  const hidden = ids.length - shown.length;
  return (
    <div className="flex flex-col gap-2">
      {ids.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {shown.map((id) => <span key={id} className={CHIP}>{id}</span>)}
          {hidden > 0 ? (
            <button type="button" onClick={() => setAll(true)} className={cn(CHIP, "text-link hover:text-link-dark")}>+{hidden} more</button>
          ) : null}
          {all && ids.length > 3 ? (
            <button type="button" onClick={() => setAll(false)} className="text-xs text-link hover:text-link-dark">Show fewer</button>
          ) : null}
        </div>
      ) : null}
      <p className="m-0 text-xs text-muted">
        <b className="font-semibold text-ink">{evidence.affected_count}</b> affected lines · published {evidence.source_counts.published} · SikhRI sample {evidence.source_counts.sikhri_sample}
      </p>
      {evidence.rule_ids.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Related rules</span>
          {evidence.rule_ids.map((id) => <span key={id} className={CHIP}><RuleId id={id} link /></span>)}
        </div>
      ) : null}
    </div>
  );
}

function Row({ result }: { result: DriftResult }) {
  const a = result.assessment;
  const label = <b className="text-[15px] font-semibold text-ink">{CHECK_LABEL[a.check]}</b>;
  const compact = a.status === "not_evaluable" || (a.outcome === "pass" && a.evidence.affected_count === 0 && a.evidence.reference_ids.length === 0 && a.evidence.rule_ids.length === 0);
  return (
    <li className="border-b border-divider px-5 py-4 last:border-b-0">
      {compact ? (
        <div className="flex flex-wrap items-center gap-2">
          {label}
          <OutcomePill assessment={a} />
          <span className="text-[13px] text-body">{a.reason}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">{label}<OutcomePill assessment={a} /></div>
          <p className="m-0 text-sm text-body">{a.reason}</p>
          {a.status === "evaluated" ? <Evidence evidence={a.evidence} /> : null}
        </div>
      )}
      {result.override ? (
        <p className="mt-2 mb-0 rounded-lg bg-accent-bg px-3 py-2 text-[13px] text-accent-dark">
          Block overridden by <b>{result.override.actor}</b>: “{result.override.reason}”
        </p>
      ) : null}
    </li>
  );
}

function P1Row({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2 border-b border-divider px-5 py-3.5 text-muted last:border-b-0">
      <span className="text-[15px] font-semibold">{label}</span>
      <span className="font-mono text-[11px]">P1</span>
    </li>
  );
}

/** Header pill: blocked / no blocking checks / not checked. */
export function DriftSummaryPill({ results }: { results: DriftResult[] | null }) {
  const base = "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold";
  if (!results || results.length === 0) return <span className={cn(base, "bg-hint-bg text-muted")}>Not checked</span>;
  const n = blockingResults(results).length;
  if (n > 0) return <span className={cn(base, "bg-error-bg text-error")}><Ban className="size-3.5" aria-hidden="true" />Blocked by {n} {n === 1 ? "check" : "checks"}</span>;
  return <span className={cn(base, "bg-ok-bg text-ok")}><Check className="size-3.5" aria-hidden="true" />No blocking checks</span>;
}

/** Right card: one row per drift result. `results` null means nothing is selected yet. */
export function DriftCard({ results }: { results: DriftResult[] | null }) {
  const present = new Set((results ?? []).map((r) => r.assessment.check));
  const ordered = [...(results ?? [])].sort((a, b) => CHECK_ORDER.indexOf(a.assessment.check) - CHECK_ORDER.indexOf(b.assessment.check));
  const unavailable = ordered.filter((r) => r.assessment.status === "not_evaluable").length;
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-divider px-5 py-4">
        <h2 className="m-0 text-lg font-semibold text-ink">Drift check</h2>
        <div className="flex flex-wrap items-center gap-2.5">
          {unavailable > 0 ? <Mono>{unavailable} unavailable</Mono> : null}
          <DriftSummaryPill results={results} />
        </div>
      </div>
      {results === null || results.length === 0 ? (
        <p className="m-0 px-5 py-4 text-[13px] text-muted">
          {results === null ? "Submit a proposal, or pick an earlier one, to see its drift check." : "This proposal has no drift results; it has not been checked."}
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {ordered.map((r) => <Row key={r.id} result={r} />)}
          {!present.has("duplicate") ? <P1Row label="Duplicate" /> : null}
          {!present.has("scope_change") ? <P1Row label="Scope change" /> : null}
        </ul>
      )}
    </Card>
  );
}
