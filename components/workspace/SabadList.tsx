"use client";

import Link from "next/link";
import { Card, CardHeader, GurmukhiText, StatusPill } from "@/components/ui";
import { useApi } from "@/lib/client/hooks";
import { cn } from "@/lib/utils";
import { sabadStatus } from "./model";

interface SabadSummary { shabad_id: string; ang: number; raag: string; writer: string }


function DisabledSelect({ id, label, option }: { id: string; label: string; option: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted">{label}</label>
      <select id={id} disabled className="min-h-10 min-w-0 rounded-lg border border-line bg-hint-bg px-1.5 text-sm text-disabled-text disabled:cursor-not-allowed">
        <option>{option}</option>
      </select>
    </div>
  );
}

function SabadListItem({ sabad, selected }: { sabad: SabadSummary; selected: boolean }) {
  const { data } = useApi("getSabad", { shabad_id: sabad.shabad_id });
  const available = data?.status === "available" ? data : null;
  const status = available ? sabadStatus(available.drafts) : null;
  const first = available?.sabad.lines[0];
  return (
    <Link
      href={`/workspace?sabad=${encodeURIComponent(sabad.shabad_id)}`}
      aria-current={selected ? "true" : undefined}
      className={cn("flex flex-col gap-0.5 rounded-lg px-3 py-2.5 text-ink no-underline", selected ? "bg-accent-bg shadow-[inset_0_0_0_1px_var(--color-accent-line)]" : "hover:bg-subtle")}
    >
      <span className="flex items-center justify-between gap-2 text-sm">
        <span className={selected ? "font-semibold" : "font-medium"}>Sabad {sabad.shabad_id}</span>
        {status ? <StatusPill tone={status.tone} className={cn(selected && status.tone === "neutral" && "bg-white")}>{status.label}</StatusPill> : null}
      </span>
      {first ? <GurmukhiText text={first.gurmukhi} className="truncate text-[15px] leading-6 text-body" /> : null}
      <span className="text-xs text-muted">Ang {sabad.ang} · {sabad.writer}</span>
    </Link>
  );
}

export function SabadList({ sabads, selectedId }: { sabads: SabadSummary[]; selectedId: string | null }) {
  return (
    <Card className="flex flex-col gap-3.5 p-[18px]" aria-label="Browse the Guru Granth Sahib">
      <CardHeader title="Sabads" right={<span className="rounded border border-line-strong px-1.5 py-px font-mono text-[11px] text-muted">Full browse · P1</span>} />
      <div className="grid grid-cols-3 gap-2">
        <DisabledSelect id="ws-ang" label="Ang" option="All" />
        <DisabledSelect id="ws-raag" label="Raag" option="All" />
        <DisabledSelect id="ws-writer" label="Writer" option="All" />
      </div>
      <div className="flex flex-col gap-1.5">
        {sabads.map((sabad) => <SabadListItem key={sabad.shabad_id} sabad={sabad} selected={sabad.shabad_id === selectedId} />)}
      </div>
      <p className="m-0 border-t border-divider pt-3 text-xs text-muted">The demo covers the exported demo Sabad. The data model holds every ang, raag and writer.</p>
    </Card>
  );
}
