"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, CardHeader, GurmukhiText, StatusPill } from "@/components/ui";
import { useApi } from "@/lib/client/hooks";
import type { ApiResponse } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";
import { angLabel, BROWSE_PAGE_SIZE, BROWSE_STATUS, isFiltered, readFilters, workspaceHref, type BrowseFilters } from "./browse";
import { sabadStatus } from "./model";

interface SabadSummary { shabad_id: string; ang: number; raag: string; writer: string }
type BrowseResult = ApiResponse<"browseSabads">;

const fieldClass = "min-h-10 min-w-0 rounded-lg border border-line-strong bg-card px-1.5 text-sm text-ink";

function SelectFilter({ id, label, value, options, onChange }: { id: string; label: string; value: string | undefined; options: string[]; onChange: (value: string | undefined) => void }) {
  // A value from the URL that the facet list does not contain (or has not loaded yet) stays selectable.
  const shown = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted">{label}</label>
      <select id={id} value={value ?? ""} onChange={(event) => onChange(event.target.value || undefined)} className={fieldClass}>
        <option value="">All</option>
        {shown.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}

function AngFilter({ ang, onChange }: { ang: number | undefined; onChange: (ang: number | undefined) => void }) {
  const [text, setText] = useState(ang === undefined ? "" : String(ang));
  useEffect(() => { setText(ang === undefined ? "" : String(ang)); }, [ang]);
  const invalid = text !== "" && !(Number.isInteger(Number(text)) && Number(text) >= 1 && Number(text) <= 1430);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor="ws-ang" className="text-xs text-muted">Ang</label>
      <input
        id="ws-ang"
        type="number"
        inputMode="numeric"
        min={1}
        max={1430}
        placeholder="1–1430"
        value={text}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setText(event.target.value);
          const next = Number(event.target.value);
          if (event.target.value === "") onChange(undefined);
          else if (Number.isInteger(next) && next >= 1 && next <= 1430) onChange(next);
        }}
        className={cn(fieldClass, "px-2 aria-[invalid=true]:border-error")}
      />
    </div>
  );
}

function StatusBadge({ status, selected }: { status: { label: string; tone: Parameters<typeof StatusPill>[0]["tone"] }; selected: boolean }) {
  return <StatusPill tone={status.tone} className={cn(selected && status.tone === "neutral" && "bg-white")}>{status.label}</StatusPill>;
}

function itemClass(selected: boolean) {
  return cn("flex flex-col gap-0.5 rounded-lg px-3 py-2.5 text-ink no-underline", selected ? "bg-accent-bg shadow-[inset_0_0_0_1px_var(--color-accent-line)]" : "hover:bg-subtle");
}

/** One of the demo Sabads: its status comes from loading the Sabad's drafts. */
function DemoItem({ sabad, selected, filters }: { sabad: SabadSummary; selected: boolean; filters: BrowseFilters }) {
  const { data } = useApi("getSabad", { shabad_id: sabad.shabad_id });
  const available = data?.status === "available" ? data : null;
  const status = available ? sabadStatus(available.drafts) : null;
  const first = available?.sabad.lines[0];
  return (
    <Link href={workspaceHref(sabad.shabad_id, filters)} aria-current={selected ? "true" : undefined} className={itemClass(selected)}>
      <span className="flex items-center justify-between gap-2 text-sm">
        <span className={selected ? "font-semibold" : "font-medium"}>Sabad {sabad.shabad_id}</span>
        {status ? <StatusBadge status={status} selected={selected} /> : null}
      </span>
      {first ? <GurmukhiText text={first.gurmukhi} className="truncate text-[15px] leading-6 text-body" /> : null}
      <span className="text-xs text-muted">Ang {sabad.ang} · {sabad.writer}</span>
    </Link>
  );
}

function BrowseItem({ sabad, selected, filters }: { sabad: BrowseResult["sabads"][number]; selected: boolean; filters: BrowseFilters }) {
  return (
    <Link href={workspaceHref(sabad.shabad_id, filters)} aria-current={selected ? "true" : undefined} className={itemClass(selected)}>
      <span className="flex items-center justify-between gap-2 text-sm">
        <span className={selected ? "font-semibold" : "font-medium"}>Sabad {sabad.shabad_id}</span>
        <StatusBadge status={BROWSE_STATUS[sabad.status]} selected={selected} />
      </span>
      <GurmukhiText text={sabad.first_line_gurmukhi} className="truncate text-[15px] leading-6 text-body" />
      <span className="text-xs text-muted">{angLabel(sabad.ang, sabad.last_ang)} · {sabad.raag} · {sabad.writer}</span>
    </Link>
  );
}

export function SabadList({ sabads, selectedId }: { sabads: SabadSummary[]; selectedId: string | null }) {
  const router = useRouter();
  const filters = readFilters(useSearchParams());
  const active = isFiltered(filters);
  // With no filter the browse request only supplies the raag/writer choices (one row), so the demo list stays the default.
  const { data, error, loading } = useApi("browseSabads", {
    ang: filters.ang, raag: filters.raag, writer: filters.writer,
    limit: active ? BROWSE_PAGE_SIZE : 1, offset: active ? filters.page * BROWSE_PAGE_SIZE : 0,
  });
  const go = (next: Partial<BrowseFilters>) => router.replace(workspaceHref(selectedId, { ...filters, page: 0, ...next }), { scroll: false });
  const total = data?.total ?? 0;
  const from = filters.page * BROWSE_PAGE_SIZE;

  return (
    <Card className="flex flex-col gap-3.5 p-[18px]" aria-label="Browse the Guru Granth Sahib">
      <CardHeader
        title="Sabads"
        right={active ? <Button variant="link" size="sm" onClick={() => go({ ang: undefined, raag: undefined, writer: undefined })}>Clear filters</Button> : undefined}
      />
      <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2">
        <AngFilter ang={filters.ang} onChange={(ang) => go({ ang })} />
        <SelectFilter id="ws-writer" label="Writer" value={filters.writer} options={data?.writers ?? []} onChange={(writer) => go({ writer })} />
        <div className="col-span-2"><SelectFilter id="ws-raag" label="Raag" value={filters.raag} options={data?.raags ?? []} onChange={(raag) => go({ raag })} /></div>
      </div>

      {!active ? (
        <>
          <p className="m-0 text-xs text-muted">Demo Sabads. Pick an ang, raag or writer to browse the whole Guru Granth Sahib.</p>
          <div className="flex flex-col gap-1.5">
            {sabads.map((sabad) => <DemoItem key={sabad.shabad_id} sabad={sabad} selected={sabad.shabad_id === selectedId} filters={filters} />)}
          </div>
          {error ? <p className="m-0 text-xs text-muted" role="status">Full browse is unavailable: {error.message}</p> : null}
        </>
      ) : error ? (
        <p className="m-0 text-sm text-muted" role="status">The corpus could not be browsed: {error.message}</p>
      ) : !data ? (
        <p className="m-0 text-sm text-muted" role="status">Loading…</p>
      ) : (
        <>
          <p className="m-0 text-xs text-muted" role="status" aria-live="polite">
            {total === 0 ? "No Sabad matches these filters." : `${total} ${total === 1 ? "Sabad" : "Sabads"} · showing ${from + 1}–${from + data.sabads.length}`}
            {loading ? " · updating…" : ""}
          </p>
          <div className="flex flex-col gap-1.5">
            {data.sabads.map((sabad) => <BrowseItem key={sabad.shabad_id} sabad={sabad} selected={sabad.shabad_id === selectedId} filters={filters} />)}
          </div>
          {total > BROWSE_PAGE_SIZE ? (
            <div className="flex items-center justify-between gap-2">
              <Button size="sm" disabled={filters.page === 0} onClick={() => go({ page: filters.page - 1 })}>Previous</Button>
              <span className="text-xs text-muted">Page {filters.page + 1} of {Math.ceil(total / BROWSE_PAGE_SIZE)}</span>
              <Button size="sm" disabled={from + BROWSE_PAGE_SIZE >= total} onClick={() => go({ page: filters.page + 1 })}>Next</Button>
            </div>
          ) : null}
        </>
      )}
      <p className="m-0 border-t border-divider pt-3 text-xs text-muted">Status comes from the drafts saved in Eko. Gurmukhi is read-only from BaniDB.</p>
    </Card>
  );
}
