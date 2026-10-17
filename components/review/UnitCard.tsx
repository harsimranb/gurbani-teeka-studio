"use client";

import { DRAFT_STATUS, GurmukhiText, HighlightedText, RuleId, SeverityBadge, StatusPill } from "@/components/ui";
import type { Decision, Finding, Rule, Sabad } from "@/lib/contracts/domain";
import { Check } from "lucide-react";
import { FindingCard, HintRow } from "./FindingCard";
import { formatTime, linePositions, positionsLabel, unique, type Unit } from "./format";

const SEVERITY_ORDER = ["error", "flag", "warning", "hint"] as const;

/** Cleared by a re-check (nobody decided). Grouped by severity into compact rows. */
function RecheckRows({ findings, version, rulesetVersion }: { findings: Finding[]; version: number; rulesetVersion: number }) {
  return (
    <>
      {SEVERITY_ORDER.map((severity) => {
        const group = findings.filter((f) => f.severity === severity);
        if (group.length === 0) return null;
        const byRuleset = group.every((f) => f.ruleset_version !== rulesetVersion && f.draft_version === version);
        const spans = unique(group.map((f) => f.quoted_span));
        return (
          <article key={severity} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-card px-[18px] py-3.5">
            <div className="flex min-w-0 flex-[1_1_320px] flex-wrap items-center gap-2 text-sm">
              <SeverityBadge severity={severity} />
              {unique(group.map((f) => f.rule_id)).map((id, i, all) => (
                <span key={id} className="inline-flex items-center gap-2">
                  <RuleId id={id} link className="text-[13px] font-semibold" />
                  {i < all.length - 1 ? <span className="text-body">and</span> : null}
                </span>
              ))}
              <span className="text-muted">{spans.map((s) => `“${s}”`).join(", ")}</span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-ok-bg px-3 py-1.5 text-[13px] font-semibold text-ok">
              <Check className="size-3.5" aria-hidden="true" />
              {byRuleset
                ? `Replaced when the ruleset changed · findings cleared, checks run again`
                : `Fixed in v${version} · findings replaced on re-check`}
            </span>
          </article>
        );
      })}
    </>
  );
}

/** Cleared by a reviewer's override or waiver. */
function DecidedRow({ finding, decision }: { finding: Finding; decision: Decision }) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-line bg-card px-[18px] py-3.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <SeverityBadge severity={finding.severity} />
        <RuleId id={finding.rule_id} link className="text-[13px] font-semibold" />
        <span className="text-muted">“{finding.quoted_span}”</span>
        <StatusPill tone="info" className="ml-auto">{decision.action === "override" ? "Overridden" : "Waived"}</StatusPill>
      </div>
      <div className="rounded-lg bg-subtle px-3 py-2.5 text-sm text-body">
        <b className="text-ink">{decision.action === "override" ? "Overridden" : "Waived"} by {decision.reviewer}, {formatTime(decision.at)}:</b> “{decision.reason}”
      </div>
    </article>
  );
}

export interface UnitCardProps {
  unit: Unit;
  sabad: Sabad;
  rules: Rule[];
  rulesetVersion: number;
  /** Sabad-wide finding numbers (id to 1..n), shared with the report card. */
  numbers: Map<string, number>;
  name: string;
  refresh: () => void;
}

/** One authored unit: its lines and draft with highlights, cleared history, then open findings. */
export function UnitCard({ unit, sabad, rules, rulesetVersion, numbers, name, refresh }: UnitCardProps) {
  const { draft, report } = unit;
  const positions = linePositions(sabad, draft.line_ids);
  const lines = positions.map((n) => sabad.lines[n - 1]);
  const grouped = lines.length > 1;
  const where = positionsLabel(positions);
  const bothSucceeded = (["code", "llm"] as const).every((phase) => report.check_runs.some((run) => run.phase === phase && run.status === "succeeded"));
  const ordered = [...report.findings].sort((a, b) => (numbers.get(a.id) ?? 0) - (numbers.get(b.id) ?? 0));
  const findingNumber = numbers;

  const decisionsFor = (findingId: string) => report.decisions.filter((d) => d.finding_id === findingId);
  const decidedClears = report.decisions.filter((d) => d.action !== "accept");
  const decidedIds = new Set(decidedClears.map((d) => d.finding_id));
  const decided = report.history
    .filter((f) => decidedIds.has(f.id))
    .map((finding) => ({ finding, decision: decidedClears.filter((d) => d.finding_id === finding.id).sort((a, b) => b.at.localeCompare(a.at))[0] }));
  const rechecked = report.history.filter((f) => !decidedIds.has(f.id));

  return (
    <>
      <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-card px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span className="font-semibold tracking-[0.05em] uppercase">
            {positionsLabel(positions, true)}{grouped ? " · one transcreation" : ""}
          </span>
          <span className="flex items-center gap-2">
            {draft.status !== "ready_for_review" ? <StatusPill tone={DRAFT_STATUS[draft.status].tone}>{DRAFT_STATUS[draft.status].label}</StatusPill> : null}
            <span className="font-mono">{lines.map((l) => l.line_id).join(" · ")}</span>
          </span>
        </div>
        {lines.map((line, i) => (
          <div key={line.line_id}>
            {grouped ? <span className="text-xs text-muted">Line {positions[i]}</span> : null}
            <GurmukhiText text={line.gurmukhi} size="lg" className="text-[22px] leading-[1.6]" />
          </div>
        ))}
        <HighlightedText
          text={draft.text}
          spans={ordered.map((f) => ({ start: f.start, end: f.end, tone: f.severity, label: findingNumber.get(f.id) }))}
          className="text-[17px] leading-[1.9]"
        />
        {ordered.length === 0 && decided.length === 0 ? (
          <p className="m-0 text-xs text-muted">
            {bothSucceeded ? "No open findings for this unit." : "No current findings, but the checks for this version are not all complete."}
          </p>
        ) : null}
      </div>

      {rechecked.length > 0 ? <RecheckRows findings={rechecked} version={draft.version} rulesetVersion={rulesetVersion} /> : null}
      {decided.map(({ finding, decision }) => <DecidedRow key={finding.id} finding={finding} decision={decision} />)}

      {ordered.map((finding) => {
        const index = findingNumber.get(finding.id) ?? 0;
        if (finding.severity === "hint" && finding.rule_id !== "CONS-01") return <HintRow key={finding.id} finding={finding} index={index} />;
        return (
          <FindingCard
            key={finding.id}
            finding={finding}
            index={index}
            rule={rules.find((r) => r.id === finding.rule_id)}
            draft={draft}
            rulesetVersion={report.ruleset_version}
            shabadId={sabad.shabad_id}
            where={where}
            decisions={decisionsFor(finding.id)}
            name={name}
            refresh={refresh}
          />
        );
      })}
    </>
  );
}
