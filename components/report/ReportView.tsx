"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { Banner, Card, CardHeader, CountPill, RuleId, StatusPill, Unavailable, type Severity } from "@/components/ui";
import { ApiClientError } from "@/lib/client/api";
import { rulesetLabel } from "@/lib/contracts/domain";
import { unitLineLabel, useReportData, type ReportPageData, type UnitData } from "./data";
import { FindingCard } from "./FindingCard";
import { StatusCards } from "./StatusCards";
import { UnitCard } from "./UnitCard";

const SEVERITIES: Severity[] = ["error", "flag", "warning", "hint"];

function BlockerBanner({ units }: { units: UnitData[] }) {
  // Already-published units are not publish blockers; their re-check results are shown on their own cards.
  const blockers = units.filter((u) => u.draft.status !== "published").flatMap((u) => u.gate.blockers.map((b) => ({ b, unit: u })));
  const findingRules = [...new Set(blockers.flatMap(({ b }) => (b.kind === "finding" ? [b.rule_id] : [])))];
  const phaseParts = blockers.flatMap(({ b, unit }) => {
    if (b.kind !== "check_phase") return [];
    const phase = b.phase === "llm" ? "model" : "code";
    const where = unitLineLabel(unit);
    return [b.status === "pending" ? `${phase} checks pending for ${where}` : b.status === "failed" ? `${phase} checks failed for ${where}` : `${phase} checks not run for ${where}`];
  });
  const departure = blockers.some(({ b }) => b.kind === "departure_reason");
  const parts: string[] = [];
  if (findingRules.length) parts.push(findingRules.join(", "));
  parts.push(...phaseParts);
  if (departure) parts.push("CONS-01 departure needs a reason");
  if (parts.length === 0) {
    return <Banner tone="ok"><b>No publish blockers.</b> Warnings don&rsquo;t block.</Banner>;
  }
  return (
    <Banner tone="error" icon={<Lock className="size-4" aria-hidden="true" />} className="items-center rounded-[10px] border-0 py-3">
      <span className="text-[#7A1A12]"><b>Publishing is blocked</b> by {parts.join("; ")} until each is fixed, waived or overridden with a reason.</span>
    </Banner>
  );
}

function Findings({ data }: { data: ReportPageData }) {
  const { units, entries, rules } = data;
  const decisions = units.flatMap((u) => u.report.decisions);
  const departureIds = new Set(units.flatMap((u) => u.gate.blockers.flatMap((b) => (b.kind === "departure_reason" ? [b.finding_id] : []))));
  return (
    <section aria-label="Findings" className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
      <BlockerBanner units={units} />
      {data.anyLlmPending ? (
        <div role="status" className="rounded-xl border border-dashed border-line-strong px-[18px] py-3.5 text-sm text-muted">
          Model checks running… model findings will appear here.
        </div>
      ) : null}
      {entries.length === 0 && !data.anyLlmPending ? (
        <Card className="text-sm text-muted">
          {!units.every((u) => u.codeRun?.status === "succeeded" && u.llmRun?.status === "succeeded")
            ? "No current findings, but not every check phase has completed, so this is not a pass."
            : units.some((u) => (u.codeRun?.not_evaluable.length ?? 0) + (u.llmRun?.not_evaluable.length ?? 0) > 0)
              ? "No current findings, but some rules could not be evaluated (listed under Not evaluable), so this is not a pass."
              : "No current findings."}
        </Card>
      ) : null}
      {entries.map((entry) => (
        <FindingCard
          key={entry.finding.id}
          entry={entry}
          shabadId={data.shabadId}
          rule={rules.get(entry.finding.rule_id)}
          decisions={decisions}
          needsDeparture={departureIds.has(entry.finding.id)}
          published={entry.unit.draft.status === "published"}
          cached={(entry.finding.layer === "L1" ? entry.unit.codeRun : entry.unit.llmRun)?.cached ?? false}
        />
      ))}
    </section>
  );
}

function LeftColumn({ data }: { data: ReportPageData }) {
  const { units, entries, ruleList } = data;
  const byDesign = ruleList.filter((r) => r.status === "approved" && r.resolution.active && (r.resolution.scope === "p0_by_design" || r.resolution.scope === "p0_suppressor"));
  const notEvaluable = new Map<string, { ruleId: string; reason: string }>();
  for (const u of units) for (const run of [u.codeRun, u.llmRun]) for (const n of run?.not_evaluable ?? []) notEvaluable.set(`${n.ruleId}\u0000${n.reason}`, n);
  const anyRuns = units.some((u) => u.codeRun || u.llmRun);
  const cleared = units.reduce((sum, u) => sum + u.report.history.length, 0);
  return (
    <section aria-label="Transcreation with highlights" className="flex min-w-0 flex-[1_1_460px] flex-col gap-3.5">
      {units.map((unit) => <UnitCard key={unit.draft.id} unit={unit} entries={entries} />)}

      <Card className="flex flex-col gap-2 px-[18px] py-3.5">
        <CardHeader title="Passed and by design" className="[&_h2]:text-sm" />
        {byDesign.length === 0 ? <p className="m-0 text-[13px] text-muted">No by-design rules are active in this ruleset.</p> : (
          <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 text-[13px] text-body">
            {byDesign.map((r) => (
              <li key={r.id}>
                <RuleId id={r.id} link className="font-bold text-link-dark" />{" "}
                {r.resolution.scope === "p0_by_design" ? "— by design: enforced in the review workflow" : "— suppressor: a recorded reason clears a consistency warning"}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-2 px-[18px] py-3.5">
        <CardHeader title="Not evaluable" right={<StatusPill>{notEvaluable.size}</StatusPill>} className="[&_h2]:text-sm" />
        <p className="m-0 text-[13px] text-muted">Approved rules that could not be judged in the current runs. These are not passes.</p>
        {notEvaluable.size === 0 ? (
          <p className="m-0 text-[13px] text-muted">{anyRuns ? "The current runs report none." : "No check has run yet."}</p>
        ) : (
          <ul tabIndex={0} aria-label="Rules that could not be evaluated" className="m-0 flex max-h-80 list-none flex-col gap-1 overflow-y-auto p-0 text-[13px] text-body">
            {[...notEvaluable.values()].map((n) => (
              <li key={`${n.ruleId}${n.reason}`} className="flex flex-wrap gap-x-2"><RuleId id={n.ruleId} link /><span>{n.reason}</span></li>
            ))}
          </ul>
        )}
      </Card>

      {cleared > 0 ? (
        <p className="m-0 px-1 text-[13px] text-muted">{cleared} earlier {cleared === 1 ? "finding was" : "findings were"} cleared by re-check or decision.</p>
      ) : null}
    </section>
  );
}

export function ReportView({ shabadId }: { shabadId: string }) {
  const data = useReportData(shabadId);
  const back = (
    <Link href={`/workspace?sabad=${encodeURIComponent(shabadId)}`} className="text-[13px] text-link hover:text-link-dark">← Back to the transcreation</Link>
  );
  if (data.unavailableReason) {
    return <div className="flex flex-col gap-4">{back}<Unavailable title="Sabad unavailable" reason={data.unavailableReason} /></div>;
  }
  if (data.error) {
    const message = data.error instanceof ApiClientError ? data.error.message : data.error.message || "The report could not be loaded.";
    return <div className="flex flex-col gap-4">{back}<Banner tone="error">{message}</Banner></div>;
  }
  if (data.loading) return <div className="flex flex-col gap-4">{back}<p role="status" className="text-sm text-muted">Loading the report card…</p></div>;

  const counts = SEVERITIES.map((s) => ({ s, n: data.entries.filter((e) => e.finding.severity === s).length })).filter((c) => c.n > 0);
  const n = data.units.length;
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {back}
          <h1 className="m-0 mt-1 text-[28px] font-semibold tracking-tight text-ink">Report card</h1>
          <div className="text-sm text-muted">
            Sabad {shabadId} · transcreation · {n} authored {n === 1 ? "unit" : "units"}{data.rulesetVersion !== null ? ` · checked against ruleset ${rulesetLabel(data.rulesetVersion)}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Current findings">
          {counts.length === 0 ? <StatusPill className="min-h-9 px-3 text-sm font-semibold">{data.anyLlmPending ? "Model checks running" : "No current findings"}</StatusPill> : null}
          {counts.map(({ s, n: count }) => <CountPill key={s} severity={s} count={count} />)}
        </div>
      </div>

      {n === 0 ? (
        <Unavailable title="No authored units yet" reason="There is no transcreation to check for this Sabad. Write one in the workspace first." />
      ) : (
        <>
          <StatusCards units={data.units} ruleList={data.ruleList} />
          <div className="flex flex-wrap items-start gap-6">
            <LeftColumn data={data} />
            <Findings data={data} />
          </div>
        </>
      )}
    </div>
  );
}
