"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonStyles, RuleId, SeverityBadge } from "@/components/ui";
import { useApi } from "@/lib/client/hooks";
import { rulesetLabel, type Decision, type Finding, type Rule } from "@/lib/contracts/domain";
import { cn } from "@/lib/utils";
import { unitLineLabel, type FindingEntry } from "./data";

const LAYER_TAG: Record<Finding["layer"], string> = { L1: "L1 · code", L2: "L2 · model", style: "style · reference set" };
const SOURCE_LABEL = { sikhri_sample: "SikhRI sample", published: "Published in Eko" } as const;
const QUOTE_BG = { error: "bg-error-bg", flag: "bg-flag-bg", warning: "bg-warning-bg", hint: "bg-hint-bg" } as const;
const ACTION_LABEL = { accept: "accepted", override: "overridden", waive: "waived", context_reason: "departure with reason" } as const;

/** Verbatim rule text, clamped to two lines with a toggle. */
function RuleText({ rule }: { rule: Rule | undefined }) {
  const [open, setOpen] = useState(false);
  if (!rule) return null;
  return (
    <div className="text-ink">
      <p className={cn("m-0 text-[15px] font-semibold", !open && "line-clamp-2")}>{rule.text}</p>
      {rule.text.length > 120 ? (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-0.5 cursor-pointer border-0 bg-transparent p-0 text-xs font-medium text-link underline underline-offset-2 hover:text-link-dark">
          {open ? "Hide full rule" : "Show full rule"}
        </button>
      ) : null}
    </div>
  );
}

function ReferencePanel({ id }: { id: string }) {
  const { data, error, loading } = useApi("getReference", { reference_id: id });
  if (error) return <p role="alert" className="m-0 text-xs text-error">Reference {id} could not be loaded: {error.message}</p>;
  if (!data) return <p className="m-0 text-xs text-muted">{loading ? "Loading reference…" : "Reference unavailable."}</p>;
  const ref = data.reference;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-card p-3 text-[13px] text-body">
      <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold text-ink">{ref.id}</span><span className="text-xs text-muted">Source: {SOURCE_LABEL[ref.source]}</span></div>
      <p className="m-0 font-serif text-[15px] text-ink">{ref.english}</p>
      {ref.exceptions.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs text-muted">
          {ref.exceptions.map((ex) => <li key={ex.decision_id}>{ex.rule_id} {ACTION_LABEL[ex.action]} by {ex.reviewer}: “{ex.reason}”</li>)}
        </ul>
      ) : <p className="m-0 text-xs text-muted">No recorded exceptions.</p>}
    </div>
  );
}

function ReferenceLinks({ ids }: { ids: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-subtle px-3 py-2.5 text-[13px] text-body">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <b className="font-semibold text-ink">Reference renderings cited:</b>
        {ids.map((id, i) => (
          <span key={id} className="inline-flex items-center gap-2">
            {i > 0 ? <span aria-hidden="true" className="text-faint">·</span> : null}
            <button type="button" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)} className="cursor-pointer border-0 bg-transparent p-0 font-mono text-xs text-link underline underline-offset-2 hover:text-link-dark">{id}</button>
          </span>
        ))}
      </span>
      {open ? <ReferencePanel id={open} /> : null}
    </div>
  );
}

function statusLabel(finding: Finding, needsDeparture: boolean, published: boolean): { text: string; blocks: boolean } {
  if (published) return { text: "Published unit · re-check result", blocks: false };
  if (finding.severity === "error" || finding.severity === "flag") return { text: "Blocks publishing", blocks: true };
  if (needsDeparture) return { text: "Needs a departure reason to publish", blocks: true };
  if (finding.severity === "warning") return { text: "Needs a reason to dismiss", blocks: false };
  return { text: "No action needed", blocks: false };
}

export function FindingCard({ entry, shabadId, rule, decisions, needsDeparture, published, cached }: {
  entry: FindingEntry; shabadId: string; rule: Rule | undefined; decisions: Decision[]; needsDeparture: boolean; published: boolean; cached: boolean;
}) {
  const { finding, unit, number } = entry;
  const where = unitLineLabel(unit).toLowerCase();
  const status = statusLabel(finding, needsDeparture, published);
  const isHint = finding.severity === "hint";
  const isCons = finding.rule_id === "CONS-01";
  const focusHref = `/workspace?sabad=${encodeURIComponent(shabadId)}&focus=${encodeURIComponent(unit.draft.id)}`;
  const reviewHref = `/review/${encodeURIComponent(shabadId)}#${encodeURIComponent(finding.id)}`;
  const decisionLabel = isCons ? "Keep, with reason" : finding.severity === "error" ? "Waive with reason" : finding.severity === "flag" ? "Override with reason" : "Dismiss with reason";
  const accepted = decisions.filter((d) => d.finding_id === finding.id && d.action === "accept");
  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <article
      id={`finding-${finding.id}`}
      className={cn(
        "flex flex-col gap-2 rounded-xl bg-card px-[18px] py-4",
        isHint ? "border border-dashed border-line-strong py-3.5" : finding.severity === "flag" ? "border-2 border-accent px-[17px] py-[15px]" : "border border-line",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} index={number} />
        <RuleId id={finding.rule_id} link className="text-[13px] font-semibold" />
        <span className="rounded-md bg-hint-bg px-2 py-px text-xs text-body">{LAYER_TAG[finding.layer]}</span>
        <span className={cn("ml-auto text-xs", status.blocks ? "text-error" : "text-muted")}>{status.text}</span>
      </div>
      <RuleText rule={rule} />
      <div className="text-[13px] text-body">
        Quoted from {where}:{" "}
        <span className={cn("rounded-[3px] px-1 font-serif text-[15px] text-ink", QUOTE_BG[finding.severity])}>{finding.quoted_span}</span>
      </div>
      <p className="m-0 text-sm text-body">{finding.explanation}</p>
      {finding.reference_ids.length > 0 ? <ReferenceLinks ids={finding.reference_ids} /> : null}
      {accepted.map((d) => (
        <p key={d.id} className="m-0 text-[13px] text-muted">Accepted by {d.reviewer}, {time(d.at)} · sent back to writer: “{d.reason}”</p>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-muted">
          ruleset {rulesetLabel(finding.ruleset_version)} · rule v{finding.rule_version} · model {finding.model} · prompt {finding.prompt_version}{cached ? " · cached" : ""}
        </span>
        {isHint ? null : (
          <div className="flex flex-wrap gap-2">
            <Link href={focusHref} className={buttonStyles({ variant: "secondary" })}>{isCons ? `Edit ${where}` : `Fix in ${where}`}</Link>
            <Link href={reviewHref} className={buttonStyles({ variant: "secondary" })}>{decisionLabel}</Link>
          </div>
        )}
      </div>
    </article>
  );
}
