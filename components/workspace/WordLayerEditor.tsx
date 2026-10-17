"use client";

import { useState } from "react";
import { GurmukhiText } from "@/components/ui";
import { callApi, useUserName } from "@/lib/client/hooks";
import { isGurmukhiNumericToken, type Draft, type Sabad } from "@/lib/contracts/domain";
import { splitWords } from "./word-selection";
import { checkDraft, errorReason } from "./actions";

type WordLayer = "annotation" | "transcription";

/** Human-authored text tied to an exact BaniDB word position; source words remain read-only. */
export function WordLayerEditor({ layer, sabad, drafts, refetch }: { layer: WordLayer; sabad: Sabad; drafts: Draft[]; refetch: () => void }) {
  const { name } = useUserName();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = layer === "annotation" ? "Annotation" : "Transcription";

  async function saveWord(lineId: string, start: number, key: string, text: string, draft: Draft | undefined) {
    if (!name || !text.trim()) return;
    setSaving(key);
    setError(null);
    try {
      const result = await callApi("saveDraft", {
        draft_id: draft?.id ?? null, expected_version: draft?.version ?? null,
        shabad_id: sabad.shabad_id, line_ids: [lineId], source_word_start: start,
        layer, text, author: name,
      });
      setEdits((previous) => { const next = { ...previous }; delete next[key]; return next; });
      refetch();
      await checkDraft(result.draft, { setRunning: () => {}, onError: (message) => setError(message) });
    } catch (caught) { setError(errorReason(caught)); }
    finally { setSaving(null); }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm text-muted">Select a source word below and write your own {label.toLowerCase()}. Gurmukhi is read-only from BaniDB. Rules without enough evidence remain marked as unevaluable.</p>
      {!name ? <p className="m-0 text-sm text-warning">Enter your name in the top bar before saving.</p> : null}
      {error ? <p role="alert" className="m-0 text-sm text-error">{error}</p> : null}
      {sabad.lines.map((line, lineIndex) => (
        <section key={line.line_id} className="rounded-xl border border-line bg-card p-4" aria-label={`Line ${lineIndex + 1} ${label.toLowerCase()}`}>
          <div className="mb-3 text-xs font-semibold text-muted">Line {lineIndex + 1} · {line.line_id}</div>
          <div className="flex flex-col gap-3">
            {splitWords(line.gurmukhi).filter((part) => part.word || (layer === "transcription" && isGurmukhiNumericToken(part.text))).map((word) => {
              const key = `${line.line_id}:${word.start}`;
              const draft = drafts.find((item) => item.line_ids.length === 1 && item.line_ids[0] === line.line_id && item.source_word_start === word.start);
              const text = edits[key] ?? draft?.text ?? "";
              const dirty = text !== (draft?.text ?? "");
              return (
                <div key={key} className="grid items-center gap-2 border-t border-divider pt-3 sm:grid-cols-[minmax(120px,180px)_1fr_auto]">
                  <GurmukhiText text={word.text} as="span" className="text-xl" />
                  <label className="sr-only" htmlFor={`${layer}-${key}`}>{label} for source word</label>
                  {layer === "annotation" ? (
                    <textarea id={`${layer}-${key}`} rows={3} value={text} onChange={(event) => setEdits((previous) => ({ ...previous, [key]: event.target.value }))}
                      placeholder="Literal meanings; implied meaning\nPart of speech; grammar features\nLanguage: form/form; other language: form"
                      className="w-full resize-y rounded-lg border border-faint bg-card px-3 py-2 text-sm text-ink" />
                  ) : (
                    <input id={`${layer}-${key}`} value={text} onChange={(event) => setEdits((previous) => ({ ...previous, [key]: event.target.value }))}
                      placeholder="Write the Roman transcription in your own words"
                      className="min-h-10 w-full rounded-lg border border-faint bg-card px-3 text-sm text-ink" />
                  )}
                  <button type="button" disabled={!name || !dirty || !text.trim() || saving !== null}
                    onClick={() => void saveWord(line.line_id, word.start, key, text, draft)}
                    className="min-h-10 rounded-lg border border-navy bg-navy px-3 text-sm text-white disabled:opacity-50">
                    {saving === key ? "Saving…" : "Save"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
