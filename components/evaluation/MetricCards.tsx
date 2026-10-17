import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatRate, type AvailableEval, type EvalMetric } from "./format";

const BIG = "text-[50px] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums text-ink";
const UNAVAILABLE = "text-[26px] font-semibold leading-[1.3] tracking-tight text-muted";
const NOTE = "m-0 text-[13px] text-muted";
const GRID = "grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4";

function Tile({ title, tag, emphasis, children }: { title: string; tag?: string; emphasis?: boolean; children: ReactNode }) {
  return (
    <section className={cn("flex flex-col gap-1.5 rounded-xl bg-card", emphasis ? "border-2 border-navy px-[21px] py-[19px]" : "border border-line px-[22px] py-5")}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-semibold text-body">{title}</h2>
        {tag ? <span className="rounded-full bg-navy px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.05em] text-white uppercase">{tag}</span> : null}
      </div>
      {children}
    </section>
  );
}

function RateValue({ metric }: { metric: EvalMetric }) {
  const text = formatRate(metric);
  return text === null ? <div className={UNAVAILABLE}>Unavailable (no denominator)</div> : <div className={BIG}>{text}</div>;
}

/** Three stat tiles when the run is available. Every number comes from the run. */
export function MetricCards({ run }: { run: AvailableEval }) {
  const { excluded } = run;
  return (
    <div className={GRID}>
      <Tile title="Catch rate">
        <RateValue metric={run.catch_rate} />
        {run.catch_rate.rate !== null ? (
          <p className="m-0 text-[13px] font-medium text-body tabular-nums">{run.catch_rate.numerator} of {run.catch_rate.denominator} reviewer corrections</p>
        ) : null}
        <p className={NOTE}>Corrections Eko flagged ÷ all reviewer corrections</p>
      </Tile>
      <Tile title="False-flag rate" tag="Precision first" emphasis>
        <RateValue metric={run.false_flag_rate} />
        {run.false_flag_rate.rate !== null ? (
          <p className="m-0 text-[13px] font-medium text-body tabular-nums">{run.false_flag_rate.numerator} of {run.false_flag_rate.denominator} findings</p>
        ) : null}
        <p className={NOTE}>Findings on spans reviewers left unchanged ÷ all findings. Lower is better.</p>
      </Tile>
      <Tile title="Sample size">
        <div className={BIG}>{run.n_corrections}</div>
        <p className="m-0 text-[13px] font-medium text-body">reviewer corrections</p>
        <p className={cn(NOTE, "tabular-nums")}>
          {excluded.typos} typos, {excluded.out_of_scope} out of scope, {excluded.unmatched} unmatched tagged separately
        </p>
      </Tile>
    </div>
  );
}

/** The same three tiles when no backtest exists: label only, never a number. */
export function UnavailableMetricCards() {
  return (
    <div className={GRID}>
      <Tile title="Catch rate">
        <div className={UNAVAILABLE}>Unavailable</div>
        <p className={NOTE}>Corrections Eko flagged ÷ all reviewer corrections</p>
      </Tile>
      <Tile title="False-flag rate" tag="Precision first" emphasis>
        <div className={UNAVAILABLE}>Unavailable</div>
        <p className={NOTE}>Findings on spans reviewers left unchanged ÷ all findings. Lower is better.</p>
      </Tile>
      <Tile title="Sample size">
        <div className={UNAVAILABLE}>Unavailable</div>
        <p className={NOTE}>Reviewer corrections in the run, with typos, out-of-scope and unmatched tagged separately.</p>
      </Tile>
    </div>
  );
}
