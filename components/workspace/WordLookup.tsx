"use client";

import Link from "next/link";
import { Card, CardHeader, GurmukhiText, Mono, StatusPill, Unavailable } from "@/components/ui";
import { useApi } from "@/lib/client/hooks";
import type { ApiResponse } from "@/lib/contracts/api";
import { workspaceHref } from "./browse";
import { useWordSelection, type SelectedWord } from "./word-selection";

type Lookup = Extract<ApiResponse<"lookupWord">, { status: "available" }>;

function Heading({ children, note }: { children: string; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="m-0 text-xs font-semibold tracking-wider text-muted uppercase">{children}</h3>
      {note ? <p className="m-0 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

function Occurrences({ lookup }: { lookup: Lookup }) {
  const { occurrences, word } = lookup;
  const more = occurrences.total - occurrences.items.length;
  return (
    <section className="flex flex-col gap-2" aria-label="Occurrences">
      <Heading note="Lines anywhere in the loaded Guru Granth Sahib with a word of the same stem. Source IDs are BaniDB's.">
        {`Occurrences · ${occurrences.total} ${occurrences.total === 1 ? "line" : "lines"}`}
      </Heading>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {occurrences.items.map((item) => (
          <li key={item.line_id} className="flex flex-col gap-0.5 rounded-lg bg-subtle px-2.5 py-2">
            <GurmukhiText text={item.gurmukhi} className="text-[16px] leading-7" />
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
              <Link href={workspaceHref(item.shabad_id, { page: 0 })} className="text-link">Sabad {item.shabad_id}</Link>
              <span>Ang {item.ang}</span>
              <Mono>line {item.line_id}</Mono>
              {item.line_id === word.line_id ? <StatusPill tone="accent">this line</StatusPill> : null}
              {item.surface !== word.surface ? <span>spelled <GurmukhiText as="span" text={item.surface} className="text-[14px] leading-5" /></span> : null}
            </span>
          </li>
        ))}
      </ul>
      {more > 0 ? <p className="m-0 text-xs text-muted">Showing the first {occurrences.items.length} of {occurrences.total} lines.</p> : null}
    </section>
  );
}

function PriorRenderings({ lookup }: { lookup: Lookup }) {
  const { prior_renderings: prior } = lookup;
  const more = prior.total - prior.items.length;
  return (
    <section className="flex flex-col gap-2" aria-label="Prior renderings">
      <Heading note="Existing references for lines that contain this word. Each is a line-level rendering of the whole line, not of this word.">
        {`Prior renderings · ${prior.total}`}
      </Heading>
      {prior.items.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">None available: no published or SikhRI reference covers a line with this word.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {prior.items.map((item) => (
            <li key={item.reference_id} className="flex flex-col gap-1 rounded-lg bg-subtle px-2.5 py-2">
              <p className="m-0 font-serif text-[14px] leading-snug text-body">{item.english}</p>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                <Mono>{item.reference_id}</Mono>
                <span>{item.source_label}</span>
                <span>{item.line_ids.length === 1 ? "line" : "lines"} {item.line_ids.join(", ")}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {more > 0 ? <p className="m-0 text-xs text-muted">Showing the first {prior.items.length} of {prior.total} references.</p> : null}
    </section>
  );
}

function Result({ selected }: { selected: SelectedWord }) {
  const { data, error, loading } = useApi("lookupWord", { line_id: selected.lineId, start: selected.start });
  if (error) return <Unavailable title="Lookup not available" reason={error.message} />;
  if (!data) return <p className="m-0 text-sm text-muted" role="status">{loading ? "Looking up…" : ""}</p>;
  if (data.status === "unavailable") return <Unavailable title="Lookup not available" reason={data.reason} />;
  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <div className="flex flex-col gap-1">
        <GurmukhiText text={data.word.surface} size="lg" />
        <p className="m-0 text-xs text-muted">
          Compared by stem <GurmukhiText as="span" text={data.word.stem_key} className="text-[15px] leading-6" />
          {data.word.ending_matra ? <> (ending matra <GurmukhiText as="span" text={data.word.ending_matra} className="text-[15px] leading-6" /> set aside)</> : null}
        </p>
      </div>
      <Occurrences lookup={data} />
      <PriorRenderings lookup={data} />
      <section className="flex flex-col gap-1" aria-label="Similar lines">
        <Heading>Similar lines</Heading>
        <p className="m-0 text-[13px] text-muted">Not available: Eko has no sourced way to compare Gurmukhi lines yet.</p>
      </section>
    </div>
  );
}

/** FE-11: read-only evidence for the word picked in the workspace. Shows sourced occurrences and references; never a suggested rendering. */
export function WordLookup() {
  const { selected, select } = useWordSelection();
  return (
    <Card className="flex flex-col gap-3.5 p-[18px]" aria-label="Word lookup">
      <CardHeader
        title="Word lookup"
        right={selected ? <button type="button" onClick={() => select(null)} className="border-0 bg-transparent p-0 text-xs font-medium text-link underline underline-offset-2">Clear</button> : undefined}
      />
      {selected ? <Result selected={selected} /> : (
        <p className="m-0 text-[13px] text-muted">Select a word in any Gurmukhi line to see where else it occurs and how existing references render those lines. Read-only; never a suggested translation.</p>
      )}
    </Card>
  );
}
