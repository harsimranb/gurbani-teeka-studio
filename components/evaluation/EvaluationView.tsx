"use client";

import { Banner, Button, Card, P1Placeholder, Unavailable } from "@/components/ui";
import { rulesetLabel } from "@/lib/contracts/domain";
import { useApi } from "@/lib/client/hooks";
import { formatRunTime } from "./format";
import { MetricCards, UnavailableMetricCards } from "./MetricCards";
import { ByRuleTable, ByVersionTable } from "./RunTables";

function P1Tag({ children }: { children: string }) {
  return <span className="font-mono text-[11px] text-muted">{children}</span>;
}

function Header({ version }: { version: number | null }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 flex-[1_1_520px]">
        <h1 className="m-0 text-[28px] font-semibold tracking-tight text-ink">Backtest on real reviewer corrections</h1>
        <p className="mt-1 mb-0 max-w-[780px] text-sm text-muted">
          Replays held-back pre-edit drafts through the same engine and rules, then compares Eko&apos;s findings with the corrections reviewers actually made. It reads history only and never writes to live drafts, decisions or rules.
        </p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap items-end justify-end gap-2.5">
          <div className="flex flex-col gap-1">
            <label htmlFor="eval-ruleset" className="flex items-center gap-2 text-xs text-muted">Ruleset version <P1Tag>P1</P1Tag></label>
            <select id="eval-ruleset" disabled className="min-h-10 rounded-lg border border-line bg-hint-bg px-2.5 font-mono text-[13px] text-disabled-text disabled:cursor-not-allowed">
              <option>{version === null ? "Unavailable" : rulesetLabel(version)}</option>
            </select>
          </div>
          <Button disabled>Export JSON</Button>
          <Button variant="primary" disabled>Run backtest</Button>
        </div>
        <p className="m-0 text-right text-xs text-muted">
          Run and export are P1 (FE-13). P0 run: <code className="font-mono">pnpm eval</code>
        </p>
      </div>
    </div>
  );
}

const STRIP = "flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-line bg-card px-[18px] py-3 text-[13px] text-body";

export function EvaluationView() {
  const evalRes = useApi("getEval", {});
  const rulesRes = useApi("listRules", {});
  const run = evalRes.data;
  const rules = rulesRes.data?.rules ?? null;

  if (!run) {
    return (
      <div className="flex flex-col gap-5">
        <Header version={null} />
        {evalRes.error ? (
          <Banner tone="error">
            <span>Could not load the backtest: {evalRes.error.message}</span>{" "}
            <Button variant="link" onClick={evalRes.refetch}>Try again</Button>
          </Banner>
        ) : (
          <Card role="status" className="text-sm text-muted">Loading backtest…</Card>
        )}
        <P1Placeholder title="Examples from the run">Examples come with FE-14.</P1Placeholder>
      </div>
    );
  }

  if (run.status === "unavailable") {
    return (
      <div className="flex flex-col gap-5">
        <Header version={run.ruleset_version} />
        <div className={STRIP}>
          <span className="font-mono text-xs text-ink">ruleset {rulesetLabel(run.ruleset_version)} · no backtest run yet</span>
        </div>
        <Unavailable title="Backtest unavailable" reason={run.reason} />
        <UnavailableMetricCards />
        <Card className="text-sm text-muted">
          The by-version and by-rule tables appear once a backtest has run. Nothing is estimated in its place.
        </Card>
        <P1Placeholder title="Examples from the run">Caught, missed and false-flag examples (FE-14) will appear here once a backtest has run.</P1Placeholder>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Header version={run.ruleset_version} />
      {run.data_label === "synthetic_test" ? (
        <Banner tone="warning" className="border-2 text-[15px]">
          <b className="font-semibold">Synthetic test data</b>: not measured on real reviewer corrections. Do not read these numbers as Eko&apos;s performance.
        </Banner>
      ) : null}
      <div className={STRIP}>
        <span className="font-mono text-xs text-ink">{run.id} · ruleset {rulesetLabel(run.ruleset_version)}</span>
        <span>Run {formatRunTime(run.at)}</span>
        <span>Policy: {run.policy.description}</span>
      </div>
      <MetricCards run={run} />
      <ByVersionTable run={run} />
      <ByRuleTable run={run} rules={rules} />
      <P1Placeholder title="Examples from the run">Caught, missed and false-flag examples (FE-14) will appear here once real run data is available.</P1Placeholder>
    </div>
  );
}
