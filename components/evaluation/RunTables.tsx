import type { ReactNode } from "react";
import { rulesetLabel, type Rule } from "@/lib/contracts/domain";
import { cn } from "@/lib/utils";
import { formatRate, type AvailableEval, type EvalMetric } from "./format";

const TH = "px-3 py-2.5 font-semibold first:pl-5 last:pr-5";
const TD = "px-3 first:pl-5 last:pr-5";

function TableCard({ label, title, note, minWidth, children }: { label: string; title: string; note: ReactNode; minWidth: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider px-5 py-3.5">
        <h2 className="m-0 text-base font-semibold text-ink">{title}</h2>
        <span className="text-[13px] text-muted">{note}</span>
      </div>
      <div className="overflow-x-auto">
        <table className={cn("w-full border-collapse text-sm", minWidth)}>{children}</table>
      </div>
    </section>
  );
}

function Head({ cols }: { cols: { label: string; right?: boolean }[] }) {
  return (
    <thead>
      <tr className="bg-subtle text-left font-mono text-[11px] tracking-[0.06em] text-muted uppercase">
        {cols.map((c) => (
          <th key={c.label} scope="col" className={cn(TH, c.right && "text-right")}>{c.label}</th>
        ))}
      </tr>
    </thead>
  );
}

/** A rate cell. Null means no denominator: say so for assistive tech, show a dash (or "Unavailable") visually. */
function Rate({ metric, word }: { metric: EvalMetric; word?: boolean }) {
  const text = formatRate(metric);
  if (text !== null) return <>{text}</>;
  if (word) return <span className="text-muted">Unavailable</span>;
  return (
    <span className="text-muted">
      <span aria-hidden="true">—</span>
      <span className="sr-only">Unavailable (no denominator)</span>
    </span>
  );
}

export function ByVersionTable({ run }: { run: AvailableEval }) {
  return (
    <TableCard label="By ruleset version" title="By ruleset version" minWidth="min-w-[620px]" note="Per-version comparison across approved rule changes is P1; this build reports one run.">
      <Head cols={[{ label: "Version" }, { label: "Policy" }, { label: "Corrections", right: true }, { label: "Catch rate", right: true }, { label: "False-flag rate", right: true }]} />
      <tbody className="tabular-nums">
        <tr className="border-t border-hint-bg bg-[#FBFBFC]">
          <td className={cn(TD, "py-3 font-mono font-semibold text-ink")}>{rulesetLabel(run.ruleset_version)}</td>
          <td className={cn(TD, "py-3 text-body")}>{run.policy.description}</td>
          <td className={cn(TD, "py-3 text-right")}>{run.n_corrections}</td>
          <td className={cn(TD, "py-3 text-right")}><Rate metric={run.catch_rate} word /></td>
          <td className={cn(TD, "py-3 text-right")}><Rate metric={run.false_flag_rate} word /></td>
        </tr>
      </tbody>
    </TableCard>
  );
}

const SEVERITY_ORDER = ["error", "flag", "warning", "hint", "lens", "none"] as const;
const SEVERITY_TEXT: Record<(typeof SEVERITY_ORDER)[number], { label: string; cls: string }> = {
  error: { label: "Error", cls: "text-error" },
  flag: { label: "Flag", cls: "text-flag" },
  warning: { label: "Warning", cls: "text-warning" },
  hint: { label: "Hint", cls: "text-hint" },
  lens: { label: "Lens", cls: "text-muted" },
  none: { label: "None", cls: "text-muted" },
};

export function ByRuleTable({ run, rules }: { run: AvailableEval; rules: Rule[] | null }) {
  const sev = (id: string) => rules?.find((r) => r.id === id)?.severity;
  const rank = (id: string) => { const s = sev(id); return s ? SEVERITY_ORDER.indexOf(s) : SEVERITY_ORDER.length; };
  const rows = run.per_rule.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r.rule_id) - rank(b.r.rule_id) || a.i - b.i).map((x) => x.r);
  return (
    <TableCard label="By rule" title="By rule" minWidth="min-w-[720px]" note="Findings is the false-flag denominator; Caught is the catch-rate numerator. A dash means no denominator.">
      <Head cols={[{ label: "Rule" }, { label: "Severity" }, { label: "Findings", right: true }, { label: "Caught", right: true }, { label: "Catch rate", right: true }, { label: "False-flag rate", right: true }]} />
      <tbody className="tabular-nums">
        {rows.length === 0 ? (
          <tr className="border-t border-hint-bg"><td colSpan={6} className="px-5 py-4 text-muted">The run reports no per-rule results.</td></tr>
        ) : rows.map((row) => {
          const s = sev(row.rule_id);
          const t = s ? SEVERITY_TEXT[s] : null;
          return (
            <tr key={row.rule_id} className="border-t border-hint-bg">
              <td className={cn(TD, "py-[11px] font-mono font-semibold text-ink")}>{row.rule_id}</td>
              <td className={cn(TD, "py-[11px]", t ? t.cls : "text-muted")}>{t ? t.label : "Unavailable"}</td>
              <td className={cn(TD, "py-[11px] text-right")}>{row.false_flag_rate.denominator}</td>
              <td className={cn(TD, "py-[11px] text-right")}>{row.catch_rate.numerator}</td>
              <td className={cn(TD, "py-[11px] text-right")}>
                <Rate metric={row.catch_rate} />
                {row.catch_rate.rate !== null ? <span className="ml-1.5 text-xs text-muted">of {row.catch_rate.denominator}</span> : null}
              </td>
              <td className={cn(TD, "py-[11px] text-right")}><Rate metric={row.false_flag_rate} /></td>
            </tr>
          );
        })}
      </tbody>
    </TableCard>
  );
}
