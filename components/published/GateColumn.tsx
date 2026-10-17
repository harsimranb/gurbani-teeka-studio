import Link from "next/link";
import { buttonStyles } from "@/components/ui";
import { cn } from "@/lib/utils";
import { formatTime, type DecisionLine, type GateSummary } from "./derive";

function GateRow({ label, value, tone }: { label: string; value: string; tone: "ok" | "error" | "neutral" }) {
  return (
    <div className="flex justify-between gap-2.5 text-sm">
      <span>{label}</span>
      <b className={cn("font-semibold", tone === "ok" && "text-ok", tone === "error" && "text-error", tone === "neutral" && "text-ink")}>{value}</b>
    </div>
  );
}

const VERB = { overridden: "overridden", waived: "waived", departure: "departure" } as const;

export function GateColumn({ gate, decisions, rulesetVersionLabel, workspaceHref }: { gate: GateSummary; decisions: DecisionLine[]; rulesetVersionLabel: string | null; workspaceHref: string }) {
  const count = (n: number) => (n === 0 ? "ok" : "error") as "ok" | "error";
  return (
    <aside aria-label="Publish record" className="flex min-w-0 flex-[1_1_360px] flex-col gap-4">
      <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-card px-5 py-[18px]">
        <h2 className="m-0 text-[15px] font-semibold text-ink">Gate at publish</h2>
        <GateRow label="Open errors" value={String(gate.errors)} tone={count(gate.errors)} />
        <GateRow label="Open flags" value={String(gate.flags)} tone={count(gate.flags)} />
        <GateRow label="Check phases complete" value={gate.incompletePhases === 0 ? "✓ Yes" : `✗ No (${gate.incompletePhases} incomplete)`} tone={gate.incompletePhases === 0 ? "ok" : "error"} />
        <GateRow label="CONS-01 departures without a reason" value={String(gate.departuresWithoutReason)} tone={count(gate.departuresWithoutReason)} />
        <GateRow label="Open warnings (don't block)" value={String(gate.warnings)} tone="neutral" />
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-card px-5 py-[18px]">
        <h2 className="m-0 text-[15px] font-semibold text-ink">Decisions behind it</h2>
        {decisions.length === 0 ? (
          <p className="m-0 text-[13px] text-body">No override, waiver or departure decisions were needed.</p>
        ) : decisions.map((d) => (
          <div key={d.key} className="text-[13px] text-body">
            <b className="font-mono font-semibold text-ink">{d.rule_id}</b>{" "}
            {d.kind === "departure" ? "departure" : VERB[d.kind]} by <b className="font-semibold text-ink">{d.reviewer}</b>
            <span className="text-xs text-muted"> · {formatTime(d.at)}</span>: “{d.reason}”
          </div>
        ))}
        <div className="border-t border-hint-bg pt-2.5 font-mono text-[11px] text-muted">
          {rulesetVersionLabel ? `checked on ruleset ${rulesetVersionLabel}` : "ruleset version unavailable"} · every finding keeps its rule version, model and prompt version
        </div>
      </section>

      <Link href={workspaceHref} className={cn(buttonStyles({ variant: "secondary" }), "min-h-11 w-full")}>Back to the workspace</Link>
    </aside>
  );
}
