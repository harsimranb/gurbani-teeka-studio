"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Banner, Button, Card } from "@/components/ui";
import { ApiClientError } from "@/lib/client/api";
import { callApi } from "@/lib/client/hooks";
import type { DriftResult, Proposal, Rule } from "@/lib/contracts/domain";
import { blockingResults, formatTime, ruleForProposal } from "./format";

const AREA = "w-full resize-y rounded-lg border border-line-strong bg-card px-3 py-2.5 text-[15px] text-ink focus:border-navy";

export interface DecideCardProps {
  proposal: Proposal;
  results: DriftResult[];
  /** Current ruleset version from `listRules`; null until loaded. */
  rulesetVersion: number | null;
  rules: Rule[];
  /** Saved name; "" when missing. */
  name: string;
  onRevise: () => void;
  /** Called after a `version_conflict` so the page reloads the ruleset. */
  onConflict: () => void;
}

function errorText(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "drift_blocked") return `Drift check blocks this proposal: ${error.message}`;
    if (error.code === "version_conflict") return `The ruleset changed: ${error.message} It has been reloaded; check the version below and try again.`;
    return error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

/** The "Decide" card (pending proposals) or the recorded outcome (decided proposals). */
export function DecideCard(props: DecideCardProps) {
  const { proposal, results, rules, onRevise } = props;
  if (proposal.status === "pending") return <PendingDecision {...props} />;

  const rule = ruleForProposal(proposal, rules);
  const override = results.find((r) => r.override)?.override ?? null;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="m-0 text-base font-semibold text-ink">Decision</h2>
      {proposal.status === "approved" ? (
        <Banner tone="ok">
          <p className="m-0 font-semibold text-ink">
            {rule ? <>Approved as <span className="font-mono">{rule.id}</span> · ruleset <span className="font-mono">v{rule.version}</span></> : "Approved"}
          </p>
          {rule ? <p className="mt-1 mb-0"><Link href={`/rules?rule=${encodeURIComponent(rule.id)}`} className="text-link underline underline-offset-2 hover:text-link-dark">Open {rule.id} in the rules catalog</Link></p> : null}
          {rule?.provenance ? (
            <p className="mt-2 mb-0">Approved by <b>{rule.provenance.actor}</b> at {formatTime(rule.provenance.at)}: “{rule.provenance.reason}”</p>
          ) : null}
          {override ? <p className="mt-1 mb-0">Block overridden by <b>{override.actor}</b> at {formatTime(override.at)}: “{override.reason}”</p> : null}
        </Banner>
      ) : (
        <Banner tone="info">This proposal was rejected. Rejection reasons are not recorded in this build.</Banner>
      )}
      <div><Button onClick={onRevise}>Revise proposal</Button></div>
    </Card>
  );
}

function PendingDecision({ proposal, results, rulesetVersion, name, onRevise, onConflict }: DecideCardProps) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = blockingResults(results).length > 0;
  const needsReasons = reason.trim() === "" || (blocked && overrideReason.trim() === "");
  const disabled = needsReasons || busy || rulesetVersion === null || name.trim() === "";
  const helpId = `${id}-help`;

  async function approve() {
    if (disabled || rulesetVersion === null) return;
    setBusy(true);
    setError(null);
    try {
      await callApi("approveProposal", {
        proposal_id: proposal.id,
        ruleset_version: rulesetVersion,
        actor: name,
        reason: reason.trim(),
        drift_override_reason: blocked ? overrideReason.trim() : null,
      });
      // Success fires eko:data-changed; the page refetches and shows the approved state.
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiClientError && e.code === "version_conflict") onConflict();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 px-5 py-[18px]">
      <h2 className="m-0 text-base font-semibold text-ink">Decide</h2>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-reason`} className="text-sm font-semibold text-ink">Reason to approve <span className="font-normal text-muted">(required · saved with the rule)</span></label>
        <textarea id={`${id}-reason`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why should this become a rule?" className={AREA} />
      </div>
      {blocked ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-override`} className="text-sm font-semibold text-ink">Reason to override the block <span className="font-normal text-muted">(required · stays on the rule&apos;s record)</span></label>
          <textarea id={`${id}-override`} rows={2} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Why should this rule change already-approved work?" className={AREA} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2.5">
        <Button className="min-h-11 px-4" onClick={onRevise}>Revise proposal</Button>
        <Button variant="primary" className="min-h-11 px-4" disabled={disabled} aria-describedby={disabled ? helpId : undefined} onClick={() => void approve()}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {blocked ? "Override block and approve" : "Approve"}
        </Button>
        {disabled ? (
          <span id={helpId} className="text-xs text-muted">
            {name.trim() === "" ? "Enter your name first" : rulesetVersion === null ? "Loading the ruleset version" : "Enter a reason first"}
          </span>
        ) : null}
      </div>
      {error ? <p role="alert" className="m-0 text-sm text-error">{error}</p> : null}
      <p className="m-0 border-t border-divider pt-3 text-[13px] text-body">
        Approving makes <b className="font-mono text-xs text-ink">{rulesetVersion === null ? "the next ruleset version" : `ruleset v${rulesetVersion + 1}`}</b>, saved with who approved it, when and why. The very next check uses it. Anyone can approve or override; there are no roles.
      </p>
    </Card>
  );
}
