"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Banner, Unavailable, buttonStyles } from "@/components/ui";
import { numberFindings } from "@/lib/client/finding-order";
import { useUserName } from "@/lib/client/hooks";
import { DecisionLog } from "./DecisionLog";
import { PublishCard } from "./PublishCard";
import { ReviewGrid } from "./ReviewGrid";
import { ReviewQueue } from "./ReviewQueue";
import { UnitCard } from "./UnitCard";
import { formatTime, unique, type Unit } from "./format";
import { useReviewData } from "./use-review-data";

/** Eyebrow facts: only claims the data supports. */
function currentness(units: Unit[]): string {
  const runs = units.flatMap((u) => u.report.check_runs);
  if (runs.some((run) => run.status === "pending")) return "model checks running";
  const codeRuns = units.map((u) => u.report.check_runs.find((run) => run.phase === "code" && run.status === "succeeded"));
  if (units.length > 0 && codeRuns.every((run) => run?.completed_at)) {
    const latest = codeRuns.map((run) => run?.completed_at ?? "").sort().at(-1) ?? "";
    return `report card is current: re-checked ${formatTime(latest)}`;
  }
  return "checks have not all run on this version";
}

/** The `/review/[shabadId]` page body: queue, decisions per authored unit, publish gate, decision log. */
export function SabadReview({ shabadId }: { shabadId: string }) {
  const { data, error, refresh } = useReviewData(shabadId);
  const { name } = useUserName();
  const available = data?.status === "available" ? data : null;
  const scrolled = useRef(false);

  // Anchors such as /review/55#finding-id: the cards exist only after the data loads.
  useEffect(() => {
    if (!available || scrolled.current) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) { scrolled.current = true; return; }
    const target = document.getElementById(id);
    if (target) { scrolled.current = true; target.scrollIntoView({ block: "center" }); }
  }, [available]);

  let center;
  if (error && !data) {
    center = <Banner tone="error">The review could not be loaded: {error.message}</Banner>;
  } else if (!data) {
    center = <p className="m-0 text-sm text-muted">Loading the review…</p>;
  } else if (data.status === "unavailable") {
    center = <Unavailable title="Sabad unavailable" reason={data.reason} />;
  } else {
    const { sabad, units, rules, rulesetVersion } = data;
    const version = units.length > 0 ? Math.max(...units.map((u) => u.draft.version)) : null;
    const authors = unique(units.map((u) => u.draft.author)).join(", ");
    // Same input as the report card: ALL current findings of all drafts, drafts in source order.
    const numbers = numberFindings(units.flatMap((u) => u.report.findings), units.map((u) => u.draft));
    center = (
      <>
        <div>
          <div className="text-[13px] text-muted">
            Ang {sabad.lines[0].ang}
            {version !== null ? <> · transcreation v{version} by {authors} · {currentness(units)}</> : <> · no authored units yet</>}
          </div>
          <h1 className="mt-0.5 mb-0 text-[28px] font-semibold tracking-[-0.01em] text-ink">Sabad {sabad.shabad_id}</h1>
        </div>
        {error ? <Banner tone="warning">The latest refresh failed: {error.message}. Showing the last data loaded.</Banner> : null}
        {units.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-card p-5 text-sm text-body">
            <p className="m-0">Nothing has been written for this Sabad yet, so there is nothing to review.</p>
            <Link href={`/workspace?sabad=${encodeURIComponent(sabad.shabad_id)}`} className={buttonStyles({ variant: "secondary" })}>Open the workspace</Link>
          </div>
        ) : units.map((unit) => (
          <UnitCard key={unit.draft.id} unit={unit} sabad={sabad} rules={rules} rulesetVersion={rulesetVersion} numbers={numbers} name={name} refresh={refresh} />
        ))}
        <PublishCard sabad={sabad} units={units} name={name} refresh={refresh} />
      </>
    );
  }

  return <ReviewGrid left={<ReviewQueue selectedId={shabadId} />} center={center} right={<DecisionLog units={available ? available.units : null} />} />;
}
