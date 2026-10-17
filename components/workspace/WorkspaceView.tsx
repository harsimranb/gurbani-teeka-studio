"use client";

import { Lock } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { P1Placeholder, PageHeader, StatusPill, Unavailable } from "@/components/ui";
import { useApi } from "@/lib/client/hooks";
import type { Draft, Sabad } from "@/lib/contracts/domain";
import { SabadEditor } from "./SabadEditor";
import { SabadList } from "./SabadList";
import { WordLookup } from "./WordLookup";
import { WordLayerEditor } from "./WordLayerEditor";
import { WordSelectionProvider, type SelectedWord } from "./word-selection";

const unique = (values: string[]) => [...new Set(values)].join(" / ");

function eyebrow(sabad: Sabad): string {
  const angs = sabad.lines.map((l) => l.ang);
  const first = Math.min(...angs);
  const last = Math.max(...angs);
  const rahao = sabad.lines.flatMap((line, i) => (line.is_rahao ? [i + 1] : []));
  return [
    first === last ? `Ang ${first}` : `Ang ${first}–${last}`,
    unique(sabad.lines.map((l) => l.writer)),
    `Raag: ${unique(sabad.lines.map((l) => l.raag))}`,
    rahao.length > 0 ? `Rahao: line ${rahao.join(", ")}` : "Rahao: none in this Sabad",
  ].join(" · ");
}

function Center({ shabadId, focus }: { shabadId: string; focus: string | null }) {
  const { data, error, refetch } = useApi("getSabad", { shabad_id: shabadId });
  if (error) return <Unavailable title="The Sabad could not be loaded" reason={error.message} />;
  if (!data) return <p className="m-0 text-sm text-muted" role="status">Loading Sabad {shabadId}…</p>;
  if (data.status === "unavailable") return <Unavailable title="Sabad unavailable" reason={data.reason} />;
  const { sabad, drafts } = data;
  return <CenterAvailable sabad={sabad} drafts={drafts} focus={focus} refetch={refetch} />;
}

function CenterAvailable({ sabad, drafts, focus, refetch }: { sabad: Sabad; drafts: Draft[]; focus: string | null; refetch: () => void }) {
  const [layer, setLayer] = useState<Draft["layer"]>("transcreation");
  const layerDrafts = drafts.filter((draft) => draft.layer === layer);
  const maxVersion = layerDrafts.reduce((max, d) => Math.max(max, d.version), 0);
  const label = { transcreation: "Transcreation", literal: "Literal translation", annotation: "Word annotation", transcription: "Transcription", publication: "Publication notes" }[layer];
  return (
    <>
      <PageHeader
        eyebrow={eyebrow(sabad)}
        title={`Sabad ${sabad.shabad_id}`}
        badge={<StatusPill className="px-2.5 py-0.5 text-[13px] text-body">{maxVersion > 0 ? `${label} · draft v${maxVersion}` : `${label} · no draft yet`}</StatusPill>}
        actions={
          <span className="flex items-center gap-2 rounded-lg bg-ok-bg px-3 py-1.5 text-[13px] text-ok">
            <Lock className="size-[15px]" aria-hidden="true" />Gurmukhi from BaniDB · read-only
          </span>
        }
      />
      <div role="group" aria-label="Authored layer" className="flex flex-wrap gap-2">
        {(["transcreation", "literal", "annotation", "transcription", "publication"] as const).map((item) => (
          <button key={item} type="button" aria-pressed={layer === item} onClick={() => setLayer(item)}
            className={layer === item ? "rounded-full border border-navy bg-navy px-3 py-1.5 text-sm text-white" : "rounded-full border border-line bg-card px-3 py-1.5 text-sm text-body"}>
            {{ transcreation: "Transcreation", literal: "Literal", annotation: "Annotation", transcription: "Transcription", publication: "Publication notes" }[item]}
          </button>
        ))}
      </div>
      {layer === "annotation" || layer === "transcription"
        ? <WordLayerEditor key={layer} layer={layer} sabad={sabad} drafts={layerDrafts} refetch={refetch} />
        : <SabadEditor key={layer} layer={layer} sabad={sabad} drafts={layerDrafts} focusDraftId={focus} refetch={refetch} />}
    </>
  );
}

export function WorkspaceView() {
  const params = useSearchParams();
  const { data, error } = useApi("listSabads", {});
  const sabads = data?.sabads ?? [];
  // Any Sabad can be opened by ID (browse results are not limited to the demo list); with none requested, the first demo Sabad.
  const selectedId = params.get("sabad") ?? sabads[0]?.shabad_id ?? null;
  // The word picked for lookup belongs to the Sabad it was picked in; opening another Sabad drops it.
  const [picked, setPicked] = useState<{ sabad: string | null; word: SelectedWord | null }>({ sabad: null, word: null });
  const wordSelection = useMemo(() => ({
    selected: picked.sabad === selectedId ? picked.word : null,
    select: (word: SelectedWord | null) => setPicked({ sabad: selectedId, word }),
  }), [picked, selectedId]);

  return (
    <WordSelectionProvider value={wordSelection}>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        <aside aria-label="Browse the Guru Granth Sahib" className="min-w-0">
          <SabadList sabads={sabads} selectedId={selectedId} />
        </aside>
        <section aria-label="Authored layers" className="flex min-w-0 flex-col gap-3.5">
          {error ? <Unavailable title="Sabads could not be loaded" reason={error.message} />
            : !data ? <p className="m-0 text-sm text-muted" role="status">Loading…</p>
            : !selectedId ? <Unavailable title="No Sabad available" reason="No Sabad has been exported from BaniDB yet." />
            : <Center key={selectedId} shabadId={selectedId} focus={params.get("focus")} />}
        </section>
        <aside aria-label="Translator utilities" className="flex min-w-0 flex-col gap-3.5 lg:col-span-2 xl:col-span-1">
          <WordLookup />
          <P1Placeholder title="Grammar hints">A free transcreation doesn&apos;t map word for word onto the line, so hints from the ending matra wait.</P1Placeholder>
        </aside>
      </div>
    </WordSelectionProvider>
  );
}
