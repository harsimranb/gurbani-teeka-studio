"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleCheck, Loader2, Lock } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { ApiClientError } from "@/lib/client/api";
import { callApi } from "@/lib/client/hooks";
import type { Sabad } from "@/lib/contracts/domain";
import { summarizeBlockers, unitLabel, unique, type Blocker, type Unit } from "./format";

function BlockerText({ blockers, units, sabad }: { blockers: Blocker[]; units: Unit[]; sabad: Sabad }) {
  const { ruleIds, sentences } = summarizeBlockers(blockers, units, sabad);
  return (
    <>
      {ruleIds.length > 0
        ? <><b className="text-ink">Publishing is blocked by {ruleIds.join(", ")}</b> (open error/flag).</>
        : <b className="text-ink">Publishing is blocked.</b>}
      {sentences.map((sentence) => <span key={sentence}> {sentence}</span>)}
      {" "}Warnings don&apos;t block.
    </>
  );
}

/** Bottom card: the combined publish gate of every unpublished unit, and the Approve & publish action. */
export function PublishCard({ sabad, units, name, refresh }: { sabad: Sabad; units: Unit[]; name: string; refresh: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; blockers?: Blocker[] } | null>(null);

  const open = units.filter((u) => u.draft.status !== "published");
  const blockers = open.flatMap((u) => u.gate.blockers);
  const blocked = blockers.length > 0;
  const warnings = open.flatMap((u) => {
    const all = [...u.report.findings];
    return u.gate.warning_ids.flatMap((id) => all.filter((f) => f.id === id));
  });
  const notReady = open.filter((u) => u.draft.status === "draft");
  const needsChecks = blockers.some((b) => b.kind === "check_phase");
  const allPublished = units.length > 0 && open.length === 0;
  const canPublish = !blocked && open.length > 0 && name.length > 0 && !busy;

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      for (const unit of open) {
        await callApi("publish", {
          draft_id: unit.draft.id, draft_version: unit.report.draft.version, ruleset_version: unit.report.ruleset_version,
          actor: name, departure_reasons: [],
        });
      }
      router.push(`/review/${encodeURIComponent(sabad.shabad_id)}/published`);
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError({ message: caught.message, blockers: caught.code === "publish_blocked" ? caught.blockers : undefined });
        refresh();
      } else setError({ message: caught instanceof Error ? caught.message : String(caught) });
      setBusy(false);
    }
  }

  let status;
  if (units.length === 0) status = <>There is nothing to publish yet: no authored unit exists for this Sabad.</>;
  else if (allPublished) status = <><b className="text-ink">Every authored unit is published.</b></>;
  else if (blocked) status = <BlockerText blockers={blockers} units={units} sabad={sabad} />;
  else {
    status = (
      <>
        <b className="text-ink">No publish blockers.</b>{" "}
        {warnings.length > 0
          ? <>Open warnings don&apos;t block: {unique(warnings.map((w) => `${w.rule_id} “${w.quoted_span}”`)).join(", ")}.</>
          : <>Warnings don&apos;t block.</>}
        {" "}Publishing records {name || "your name"} as the approver.
      </>
    );
  }

  return (
    <Card padded={false} className="flex flex-col gap-3 px-[18px] py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="status" className="flex flex-[1_1_360px] items-start gap-2.5 text-sm text-body">
          {blocked
            ? <Lock className="mt-0.5 size-[18px] flex-none text-error" aria-hidden="true" />
            : <CircleCheck className="mt-0.5 size-[18px] flex-none text-ok" aria-hidden="true" />}
          <span>
            {status}
            {blocked && needsChecks ? <> <Link href={`/workspace/${encodeURIComponent(sabad.shabad_id)}/report`} className="text-link underline underline-offset-2">Open the report card</Link>.</> : null}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {allPublished ? (
            <Link href={`/review/${encodeURIComponent(sabad.shabad_id)}/published`} className="text-[13px] text-link underline underline-offset-2">See what was published →</Link>
          ) : (
            <Button variant="primary" className="min-h-11 px-[18px]" disabled={!canPublish} onClick={() => { void publish(); }}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Approve &amp; publish
            </Button>
          )}
        </div>
      </div>
      {notReady.length > 0 && !allPublished ? (
        <p className="m-0 text-xs text-muted">{unique(notReady.map((u) => unitLabel(sabad, u.draft))).join(", ")}: the writer has not marked this ready for review yet.</p>
      ) : null}
      {error ? (
        <div role="alert" className="flex flex-col gap-1 rounded-lg bg-error-bg px-3 py-2 text-sm text-error">
          <span>{error.message}</span>
          {error.blockers && error.blockers.length > 0 ? <span className="text-body"><BlockerText blockers={error.blockers} units={units} sabad={sabad} /></span> : null}
        </div>
      ) : null}
    </Card>
  );
}
