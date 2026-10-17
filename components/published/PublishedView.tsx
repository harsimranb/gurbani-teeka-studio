"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { Banner, Card, DRAFT_STATUS, StatusPill, Unavailable, buttonStyles } from "@/components/ui";
import { rulesetLabel, type Reference } from "@/lib/contracts/domain";
import { useApi } from "@/lib/client/hooks";
import { cn } from "@/lib/utils";
import { GateColumn } from "./GateColumn";
import { ReferenceSetCard } from "./ReferenceSetCard";
import { collectDecisions, currentStateDiffers, firstPosition, formatTime, lineRangeLabel, linePositions, summarizeGate, type UnitData } from "./derive";
import { usePublishedData } from "./usePublishedData";

function Loading({ children }: { children: string }) {
  return <p role="status" className="m-0 text-sm text-muted">{children}</p>;
}

export function PublishedView({ shabadId }: { shabadId: string }) {
  const sabadRes = useApi("getSabad", { shabad_id: shabadId });
  const rulesRes = useApi("listRules", {});
  const { loaded, error } = usePublishedData(shabadId, sabadRes.data);
  const reviewHref = `/review/${encodeURIComponent(shabadId)}`;

  if (sabadRes.error) return <Banner tone="error">{sabadRes.error.message}</Banner>;
  if (!sabadRes.data) return <Loading>Loading the Sabad…</Loading>;
  if (sabadRes.data.status === "unavailable") return <Unavailable title="Sabad unavailable" reason={sabadRes.data.reason} />;
  const sabad = sabadRes.data.sabad;
  if (error && !loaded) return <Banner tone="error">{error.message}</Banner>;
  if (!loaded) return <Loading>Loading the publish record…</Loading>;

  const units = [...loaded.units].sort((a, b) => firstPosition(sabad, a.draft) - firstPosition(sabad, b.draft));
  const published = units.filter((u) => u.draft.status === "published");
  const unpublished = units.filter((u) => u.draft.status !== "published");

  if (published.length === 0) {
    const first = sabad.lines[0];
    return (
      <div className="flex max-w-[720px] flex-col gap-4">
        <Unavailable title="Not published yet" reason={units.length === 0 ? `No authored units exist for Sabad ${shabadId} yet, so nothing has been published.` : `None of the ${units.length} authored unit${units.length === 1 ? "" : "s"} in Sabad ${shabadId} has been published.`} />
        <Card className="flex flex-col gap-3">
          <div className="text-[13px] text-muted">Ang {first.ang} · {first.writer} · Raag: {first.raag}</div>
          {units.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {units.map((u) => (
                <li key={u.draft.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-ink">{lineRangeLabel(linePositions(sabad, u.draft.line_ids))}</span>
                  <StatusPill tone={DRAFT_STATUS[u.draft.status].tone}>{DRAFT_STATUS[u.draft.status].label}</StatusPill>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="m-0 text-[13px] text-body">A Sabad is published from its review page, once nothing blocks it.</p>
          <div><Link href={reviewHref} className={buttonStyles({ variant: "primary" })}>Go to the review for Sabad {shabadId}</Link></div>
        </Card>
      </div>
    );
  }

  const publishedRefs: Reference[] = published.flatMap((u) => (u.publication ? [u.publication.reference] : []));
  const gate = summarizeGate(published);
  const decisions = collectDecisions(published);
  const maxVersion = Math.max(...published.map((u) => u.draft.version));
  const authors = [...new Set(published.map((u) => u.draft.author))].join(", ");
  const publications = published.map((u) => u.publication).filter((p) => p !== null);
  const approvers = [...new Set(publications.map((p) => p.approver))].join(", ");
  const latestAt = publications.map((p) => p.at).sort().at(-1);
  // The gate card describes the gate recorded at publish time, so label it with the ruleset each publication was checked on.
  const gateVersions = [...new Set(publications.map((p) => p.gate.ruleset_version))].sort((x, y) => x - y);
  const gateRulesetLabel = gateVersions.length === 0 ? null : gateVersions.map((v) => rulesetLabel(v)).join(", ");
  const differs = currentStateDiffers(published);
  const currentRuleset = rulesRes.data?.ruleset_version ?? Math.max(...published.map((u) => u.gate.ruleset_version));
  const blocking = gate.errors + gate.flags;
  const blockNote = blocking === 0 ? "no open errors or flags" : `${gate.errors} open error${gate.errors === 1 ? "" : "s"}, ${gate.flags} open flag${gate.flags === 1 ? "" : "s"}`;

  return (
    <div className="flex flex-col gap-5">
      <div role="status" className="flex flex-wrap items-center gap-x-5 gap-y-3.5 rounded-xl bg-ok-bg px-[22px] py-[18px]">
        <span className="inline-flex size-10 flex-none items-center justify-center rounded-full bg-ok" aria-hidden="true"><Check className="size-5 text-white" strokeWidth={2.5} /></span>
        <div className="min-w-0 flex-[1_1_360px]">
          <div className="text-[19px] font-semibold text-[#1D4733]">Published · Sabad {shabadId}</div>
          <div className="text-sm text-[#2B4D3C]">
            Transcreation v{maxVersion} by {authors} · approved by {approvers || "an approver (name unavailable)"}{latestAt ? ` at ${formatTime(latestAt)}` : ""} · {blockNote}
          </div>
        </div>
        <Link href="/rules/proposals" className={cn(buttonStyles({ variant: "primary" }), "min-h-11 px-[18px] font-semibold")}>Propose a rule</Link>
      </div>

      <Banner tone="info">These published renderings express the team&apos;s current understanding of Sabad. Other renderings may coexist as understanding deepens.</Banner>

      {unpublished.length > 0 ? (
        <Banner tone="warning">
          <b>Not published yet:</b>{" "}
          {unpublished.map((u) => `${lineRangeLabel(linePositions(sabad, u.draft.line_ids))} (${DRAFT_STATUS[u.draft.status].label.toLowerCase()})`).join(", ")}.{" "}
          Only the published units are shown below.{" "}
          <Link href={reviewHref} className="font-medium text-link underline underline-offset-2 hover:text-link-dark">Open the review</Link>
        </Banner>
      ) : null}
      {differs ? (
        <p role="status" className="m-0 rounded-lg border border-line bg-subtle px-4 py-2.5 text-[13px] text-body">
          Since publishing, ruleset {rulesetLabel(currentRuleset)} has new results; re-check from the{" "}
          <Link href={`/workspace?sabad=${encodeURIComponent(shabadId)}`} className="font-medium text-link underline underline-offset-2 hover:text-link-dark">workspace</Link>.
        </p>
      ) : null}
      {error ? <Banner tone="error">{error.message}</Banner> : null}

      <div className="flex flex-wrap items-start gap-6">
        <ReferenceSetCard sabad={sabad} references={publishedRefs} />
        <GateColumn gate={gate} decisions={decisions} rulesetVersionLabel={gateRulesetLabel} workspaceHref={`/workspace?sabad=${encodeURIComponent(shabadId)}`} />
      </div>
    </div>
  );
}

export type { UnitData };
