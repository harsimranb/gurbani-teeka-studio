"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, ReasonAction, RuleId, SeverityBadge, buttonStyles } from "@/components/ui";
import { ApiClientError } from "@/lib/client/api";
import { callApi } from "@/lib/client/hooks";
import type { Decision, Draft, Finding, Rule } from "@/lib/contracts/domain";
import { cn } from "@/lib/utils";
import { LAYER_TAG, formatTime } from "./format";

const CHIP: Record<Finding["severity"], string> = {
  error: "bg-error-bg", flag: "bg-flag-bg", warning: "bg-warning-bg", hint: "bg-hint-bg",
};

/** The span the finding quotes from the user's own draft, in a tinted serif chip. */
export function QuoteChip({ severity, children }: { severity: Finding["severity"]; children: string }) {
  return <span className={cn("rounded-[3px] px-1 font-serif text-ink", CHIP[severity])}>{children}</span>;
}

/** Verbatim rule text, clamped to two lines with a toggle. Never reworded. */
function RuleText({ rule }: { rule: Rule | undefined }) {
  const [open, setOpen] = useState(false);
  if (!rule) return null;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <p className={cn("m-0 text-[14px] text-ink", !open && "line-clamp-2")}>{rule.text}</p>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-link underline underline-offset-2 hover:text-link-dark">
        {open ? "Hide full rule" : "Show full rule"}
      </button>
    </div>
  );
}

interface Option { key: "accept" | "override" | "waive"; label: string; confirm: string }

function optionsFor(finding: Finding): Option[] {
  const accept: Option = { key: "accept", label: "Accept · send back to writer", confirm: "Confirm accept" };
  if (finding.rule_id === "CONS-01") return [{ key: "override", label: "Keep, with reason", confirm: "Confirm keep" }];
  if (finding.severity === "warning") return [accept, { key: "waive", label: "Dismiss", confirm: "Confirm dismiss" }];
  return [accept, { key: "override", label: "Override", confirm: "Confirm override" }, { key: "waive", label: "Waive", confirm: "Confirm waive" }];
}

export interface FindingCardProps {
  finding: Finding;
  /** Number in the unit's global finding order (matches the highlight superscript). */
  index: number;
  rule: Rule | undefined;
  draft: Draft;
  rulesetVersion: number;
  shabadId: string;
  /** All recorded decisions on this finding. */
  decisions: Decision[];
  name: string;
  /** Reload the page data. */
  refresh: () => void;
}

/** A dashed one-line row for hints: no decision is needed. */
export function HintRow({ finding, index }: { finding: Finding; index: number }) {
  return (
    <article id={finding.id} className="flex scroll-mt-24 flex-wrap items-center gap-2 rounded-xl border border-dashed border-[#A9B1BC] bg-card px-[18px] py-3 text-sm text-body">
      <SeverityBadge severity="hint" index={index} />
      <RuleId id={finding.rule_id} link />
      <span>“{finding.quoted_span}” · no decision needed</span>
    </article>
  );
}

/** An open error, flag or warning with its decision controls. */
export function FindingCard({ finding, index, rule, draft, rulesetVersion, shabadId, decisions, name, refresh }: FindingCardProps) {
  const [choice, setChoice] = useState<Option | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = optionsFor(finding);
  const cons01 = finding.rule_id === "CONS-01";
  const blocks = finding.severity === "error" || finding.severity === "flag";
  const accepted = decisions.filter((d) => d.action === "accept").sort((a, b) => b.at.localeCompare(a.at))[0];

  async function submit(option: Option, reason: string) {
    setBusy(true);
    setError(null);
    try {
      await callApi("decide", {
        draft_id: draft.id, draft_version: draft.version, ruleset_version: rulesetVersion,
        finding_id: finding.id, action: option.key, reason, reviewer: name,
      });
      setChoice(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      if (caught instanceof ApiClientError && caught.code === "version_conflict") refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      id={finding.id}
      className={cn("flex scroll-mt-24 flex-col gap-3 rounded-xl bg-card px-5 py-[18px]", choice ? "border-2 border-navy" : "border border-line")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} index={index} />
        <RuleId id={finding.rule_id} link className="text-[13px] font-semibold" />
        <span className="font-mono text-[11px] text-muted">{LAYER_TAG[finding.layer]}</span>
        <span className={cn("ml-auto text-xs", cons01 || blocks ? "text-error" : "text-muted")}>
          {cons01 ? "Blocks publishing until a reason is recorded" : blocks ? "Blocks publishing" : "Doesn't block"}
        </span>
      </div>
      <RuleText rule={rule} />
      <p className="m-0 text-sm text-body">
        <QuoteChip severity={finding.severity}>{finding.quoted_span}</QuoteChip>{" "}
        {finding.explanation}
        {finding.reference_ids.length > 0 ? <> Cites <span className="font-mono text-xs">{finding.reference_ids.join(", ")}</span>.</> : null}
      </p>
      {accepted ? (
        <p className="m-0 rounded-lg bg-subtle px-3 py-2 text-sm text-body">
          <b className="text-ink">Accepted by {accepted.reviewer}</b> · {formatTime(accepted.at)} — sent back to writer: “{accepted.reason}”
        </p>
      ) : null}
      <div role="group" aria-label={`Decision on ${finding.rule_id}`} className="flex flex-wrap gap-1.5">
        {cons01 ? (
          <Link href={`/workspace?sabad=${encodeURIComponent(shabadId)}&focus=${encodeURIComponent(draft.id)}`} className={buttonStyles({ variant: "secondary" })}>
            Edit lines
          </Link>
        ) : null}
        {options.map((option) => (
          <Button
            key={option.key}
            variant={choice?.key === option.key ? "primary" : "secondary"}
            aria-pressed={choice?.key === option.key}
            onClick={() => { setChoice(option); setError(null); }}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {choice ? (
        name ? (
          <div className="flex flex-col gap-2">
            <ReasonAction
              key={choice.key}
              label="Reason (required · shown to every later reviewer)"
              actions={[{ label: choice.confirm, variant: "primary", onClick: (reason) => submit(choice, reason) }]}
              busy={busy}
              error={error}
            />
            <p className="m-0 text-xs text-muted">Saved as {name}</p>
          </div>
        ) : (
          <p role="alert" className="m-0 text-sm text-error">Enter your name in the top bar to record a decision.</p>
        )
      ) : null}
    </article>
  );
}
