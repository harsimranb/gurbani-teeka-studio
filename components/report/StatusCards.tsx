"use client";

import { Check, CircleDashed, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, StatusPill } from "@/components/ui";
import { callApi } from "@/lib/client/hooks";
import type { CheckRun, Rule } from "@/lib/contracts/domain";
import { cn } from "@/lib/utils";
import { unitLineLabel, type UnitData } from "./data";

function StatusCard({ icon, tone, title, children }: { icon: ReactNode; tone: "ok" | "info" | "error" | "neutral"; title: ReactNode; children: ReactNode }) {
  const bg = { ok: "bg-ok-bg text-ok", info: "bg-info-bg text-info", error: "bg-error-bg text-error", neutral: "bg-hint-bg text-muted" }[tone];
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-card px-4 py-3.5">
      <span className={cn("inline-flex size-7 flex-none items-center justify-center rounded-full", bg)}>{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <div className="text-[13px] text-muted">{children}</div>
      </div>
    </div>
  );
}

function longestSeconds(runs: CheckRun[]): string | null {
  const ms = runs.filter((r) => r.completed_at).map((r) => Date.parse(r.completed_at ?? "") - Date.parse(r.started_at)).filter((n) => Number.isFinite(n) && n >= 0);
  return ms.length ? `${(Math.max(...ms) / 1000).toFixed(1)} s` : null;
}
const names = (units: UnitData[]) => units.map(unitLineLabel).join("; ");

function CodeChecksCard({ units, ruleList }: { units: UnitData[]; ruleList: Rule[] }) {
  const runs = units.flatMap((u) => (u.codeRun ? [u.codeRun] : []));
  const done = runs.filter((r) => r.status === "succeeded");
  const failed = units.filter((u) => u.codeRun?.status === "failed");
  const pending = units.filter((u) => u.codeRun?.status === "pending");
  const missing = units.filter((u) => !u.codeRun);
  // A rule counts as having run only if every checked run evaluated it (intersection); units with no succeeded run contribute nothing.
  const ran = done.length === 0 ? [] : ruleList
    .filter((r) => r.status === "approved" && r.resolution.active && r.resolution.scope === "p0_check" && done.every((run) => !run.not_evaluable.some((n) => n.ruleId === r.id)))
    .map((r) => r.id);
  const took = longestSeconds(done);
  const problem = failed.length > 0;
  const icon = problem ? <TriangleAlert className="size-3.5" aria-hidden="true" /> : pending.length ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : missing.length ? <CircleDashed className="size-3.5" aria-hidden="true" /> : <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />;
  return (
    <StatusCard icon={icon} tone={problem ? "error" : missing.length || pending.length ? "neutral" : "ok"} title={`Code checks${took ? ` · ${took}` : ""}`}>
      <div>{done.length} of {units.length} authored units checked</div>
      {failed.length ? <div className="text-error">Failed for {names(failed)}</div> : null}
      {pending.length ? <div>Running for {names(pending)}</div> : null}
      {missing.length ? <div>Not run for {names(missing)}</div> : null}
      {done.length && ran.length ? <div>Rules that ran{done.length < units.length ? ` on the ${done.length} checked ${done.length === 1 ? "unit" : "units"}` : ""}: <span className="font-mono text-xs">{ran.join(", ")}</span></div> : null}
    </StatusCard>
  );
}

function ModelChecksCard({ units }: { units: UnitData[] }) {
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const runs = units.flatMap((u) => (u.llmRun ? [u.llmRun] : []));
  const done = runs.filter((r) => r.status === "succeeded");
  const pending = units.filter((u) => u.llmRun?.status === "pending");
  const failed = units.filter((u) => u.llmRun?.status === "failed");
  const missing = units.filter((u) => !u.llmRun);
  const cached = runs.some((r) => r.cached);
  const took = longestSeconds(done);

  async function retry(unit: UnitData) {
    setError(null);
    setRetrying((s) => new Set(s).add(unit.draft.id));
    try {
      await callApi("runLlmChecks", { draft_id: unit.draft.id, draft_version: unit.draft.version, ruleset_version: unit.report.ruleset_version, changed_line_ids: unit.draft.line_ids });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The model check could not be started.");
    } finally {
      setRetrying((s) => { const next = new Set(s); next.delete(unit.draft.id); return next; });
    }
  }

  const running = pending.length > 0;
  const icon = failed.length ? <TriangleAlert className="size-3.5" aria-hidden="true" /> : running ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : missing.length ? <CircleDashed className="size-3.5" aria-hidden="true" /> : <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />;
  return (
    <StatusCard icon={icon} tone={failed.length ? "error" : running || missing.length ? "neutral" : "ok"} title={<span className="inline-flex flex-wrap items-center gap-2">Model checks{took && !running ? ` · ${took}` : ""}{cached ? <StatusPill>cached</StatusPill> : null}</span>}>
      <div>{done.length} of {units.length} authored units checked</div>
      {running ? <div role="status">Running for {names(pending)}; model findings will appear here.</div> : null}
      {missing.length ? <div>Not run for {names(missing)}</div> : null}
      {failed.map((u) => (
        <div key={u.draft.id} className="flex flex-wrap items-center gap-2 text-error">
          <span>Failed for {unitLineLabel(u)}{u.llmRun?.error ? `: ${u.llmRun.error}` : ""}</span>
          <Button variant="secondary" size="sm" disabled={retrying.has(u.draft.id)} onClick={() => void retry(u)}>Retry</Button>
        </div>
      ))}
      {error ? <div role="alert" className="text-error">{error}</div> : null}
    </StatusCard>
  );
}

export function StatusCards({ units, ruleList }: { units: UnitData[]; ruleList: Rule[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
      <CodeChecksCard units={units} ruleList={ruleList} />
      <ModelChecksCard units={units} />
      <StatusCard icon={<ShieldCheck className="size-[15px]" aria-hidden="true" />} tone="info" title="Citation validator">
        <div>Every finding below passed the exact-span check: its quoted words equal the draft text at its offsets.</div>
        <div>Dropped-finding count not reported in this build.</div>
      </StatusCard>
    </div>
  );
}
