import { Check, CircleDashed, Loader2, TriangleAlert } from "lucide-react";
import type { CheckRun } from "@/lib/contracts/domain";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { StatusPill } from "./StatusPill";

const NAME = { code: "Code checks", llm: "Model checks" } as const;

function duration(run: CheckRun): string | null {
  if (!run.completed_at) return null;
  const ms = Date.parse(run.completed_at) - Date.parse(run.started_at);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return `${(ms / 1000).toFixed(1)} s`;
}

export interface PhaseStatusProps {
  phase: "code" | "llm";
  run?: CheckRun | null;
  /** Local "request in flight" flag, for when no pending run is stored yet. */
  running?: boolean;
  onRetry?: () => void;
  className?: string;
}

/** One check phase: not run, running, succeeded (with duration, cached tag and any not-evaluable rules) or failed. A pending model check never reads as passed. */
export function PhaseStatus({ phase, run, running = false, onRetry, className }: PhaseStatusProps) {
  const name = NAME[phase];
  const base = cn("inline-flex flex-wrap items-center gap-1.5 text-[13px] text-muted", className);
  if (running || run?.status === "pending") {
    return (
      <span className={base} role="status">
        <Loader2 className="size-4 animate-spin text-accent" aria-hidden="true" />
        <span className="text-body">{phase === "llm" ? "Model checks running…" : "Code checks running…"}</span>
      </span>
    );
  }
  if (!run) {
    return <span className={base}><CircleDashed className="size-4 text-faint" aria-hidden="true" />{name} not run</span>;
  }
  if (run.status === "failed") {
    return (
      <span className={cn(base, "text-error")}>
        <TriangleAlert className="size-4" aria-hidden="true" />
        {name} failed{run.error ? `: ${run.error}` : ""}
        {onRetry ? <Button variant="link" size="sm" onClick={onRetry}>Retry</Button> : null}
      </span>
    );
  }
  const took = duration(run);
  // A completed run that could not judge some rules is not a pass: say how many rules went unevaluated.
  const unjudged = new Set(run.not_evaluable.map((n) => n.ruleId)).size;
  return (
    <span className={base} title={unjudged > 0 ? run.not_evaluable.map((n) => `${n.ruleId}: ${n.reason}`).join("\n") : undefined}>
      {unjudged > 0 ? <CircleDashed className="size-4 text-faint" aria-hidden="true" /> : <Check className="size-4 text-ok" aria-hidden="true" />}
      {name}{took ? ` ${took}` : ""}
      {unjudged > 0 ? <span className="text-body">completed · {unjudged} {unjudged === 1 ? "rule" : "rules"} not evaluable</span> : null}
      {run.cached ? <StatusPill>cached</StatusPill> : null}
    </span>
  );
}
