"use client";

import { useEffect, useMemo, useState } from "react";
import { callApi, useUserName } from "@/lib/client/hooks";
import type { Draft, Sabad } from "@/lib/contracts/domain";
import { checkDraft, errorReason, isConflict, retryPhase, type PhaseHooks } from "./actions";
import { buildUnits, isDirty, lineLabel, mergeWithNext, runOf, sabadStatus, syncUnits, ungroup, type Report, type Unit } from "./model";
import { SaveBar } from "./SaveBar";
import { UnitCard } from "./UnitCard";
import type { Inflight } from "./UnitStatus";
import { useReports } from "./useReports";

const clock = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** The editable center column for one Sabad: unit cards in source order plus the save bar. Local edits live here until saved. */
export function SabadEditor({ sabad, drafts, focusDraftId, refetch }: { sabad: Sabad; drafts: Draft[]; focusDraftId: string | null; refetch: () => void }) {
  const { name, ready } = useUserName();
  const draftsKey = JSON.stringify(drafts.map((d) => [d.id, d.version, d.text, d.line_ids]));
  const [units, setUnits] = useState<Unit[]>(() => buildUnits(sabad.lines, drafts));
  const [inflight, setInflight] = useState<Record<string, Inflight>>({});
  const [saving, setSaving] = useState(false);
  const [marking, setMarking] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reports = useReports(drafts);

  useEffect(() => {
    setUnits((prev) => syncUnits(prev, buildUnits(sabad.lines, drafts)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftsKey]);

  const order = useMemo(() => new Map(sabad.lines.map((line, i) => [line.line_id, i + 1])), [sabad.lines]);
  const lineNumber = (id: string) => order.get(id) ?? 0;
  const linesById = useMemo(() => new Map(sabad.lines.map((line) => [line.line_id, line])), [sabad.lines]);
  const needsName = ready && !name;
  const anyDirty = units.some(isDirty);

  const hooks: PhaseHooks = {
    setRunning: (id, phase, running) => setInflight((prev) => ({ ...prev, [id]: { ...prev[id], [phase]: running } })),
    onError: setError,
  };
  const reportFor = (unit: Unit): Report | undefined => {
    const report = unit.draftId ? reports[unit.draftId] : undefined;
    return report && report.draft.version === unit.version ? report : undefined;
  };
  const patchUnit = (index: number, text: string) => setUnits((prev) => prev.map((u, i) => (i === index ? { ...u, text } : u)));

  async function save() {
    if (!name) return;
    const todo = units.filter((u) => isDirty(u) && u.text.trim() !== "");
    setError(null);
    if (todo.length === 0) { setError("Units with no text are not saved. Write something first."); return; }
    setSaving(true);
    const saved: Array<{ key: string; draft: Draft }> = [];
    let failure: unknown = null;
    for (const unit of todo) {
      try {
        const { draft } = await callApi("saveDraft", { draft_id: unit.draftId, expected_version: unit.version, shabad_id: sabad.shabad_id, line_ids: unit.lineIds, text: unit.text, author: name });
        saved.push({ key: unit.key, draft });
      } catch (caught) { failure = caught; break; }
    }
    setInflight((prev) => ({ ...prev, ...Object.fromEntries(saved.map(({ draft }) => [draft.id, { ...prev[draft.id], code: true }])) }));
    setUnits((prev) => prev.map((u) => {
      const hit = saved.find((s) => s.key === u.key);
      return hit ? { ...u, draftId: hit.draft.id, version: hit.draft.version, base: { text: hit.draft.text, lineIds: hit.draft.line_ids } } : u;
    }));
    if (failure) { setError(errorReason(failure)); if (isConflict(failure)) refetch(); }
    if (saved.length > 0) {
      setSavedMessage(`Saved ${clock()} by ${name} · only the changed lines (${saved.map(({ draft }) => lineLabel(draft.line_ids, lineNumber)).join(", ")}) were re-checked`);
    }
    setSaving(false);
    for (const { draft } of saved) await checkDraft(draft, hooks);
  }

  async function markReady() {
    if (!name) return;
    setMarking(true);
    setError(null);
    try {
      for (const draft of drafts.filter((d) => d.status === "draft" || d.status === "changes_requested")) {
        await callApi("markReady", { draft_id: draft.id, draft_version: draft.version, actor: name });
      }
    } catch (caught) {
      setError(errorReason(caught));
      if (isConflict(caught)) refetch();
    }
    setMarking(false);
  }

  const missingRuns = drafts.filter((d) => {
    const report = reports[d.id];
    return report && report.draft.version === d.version && (!runOf(report, "code") || !runOf(report, "llm"));
  });
  async function rerun() {
    setRerunning(true);
    setError(null);
    for (const draft of missingRuns) await checkDraft(draft, hooks);
    setRerunning(false);
  }

  const markable = drafts.filter((d) => d.status === "draft" || d.status === "changes_requested").length;
  return (
    <>
      {units.map((unit, i) => {
        const draft = unit.draftId ? drafts.find((d) => d.id === unit.draftId) : undefined;
        return (
          <UnitCard
            key={unit.key}
            unit={unit}
            lines={unit.lineIds.flatMap((id) => linesById.get(id) ?? [])}
            lineNumber={lineNumber}
            dirty={isDirty(unit)}
            report={reportFor(unit)}
            inflight={(unit.draftId && inflight[unit.draftId]) || {}}
            shabadId={sabad.shabad_id}
            autoFocus={focusDraftId !== null && unit.draftId === focusDraftId}
            onText={(text) => patchUnit(i, text)}
            onGroupNext={unit.lineIds.length === 1 && i < units.length - 1 ? () => setUnits((prev) => mergeWithNext(prev, i)) : undefined}
            onUngroup={() => setUnits((prev) => ungroup(prev, i))}
            onRetry={(phase) => draft && void retryPhase(draft, phase, hooks)}
          />
        );
      })}
      <SaveBar
        shabadId={sabad.shabad_id}
        anyDirty={anyDirty}
        saving={saving}
        hasDrafts={drafts.length > 0}
        needsName={needsName}
        needsRerun={missingRuns.length > 0}
        rerunning={rerunning}
        markableCount={markable}
        marking={marking}
        statusLabel={drafts.length > 0 && markable === 0 && !anyDirty ? sabadStatus(drafts) : null}
        savedMessage={savedMessage}
        error={error}
        onSave={() => void save()}
        onMarkReady={() => void markReady()}
        onRerun={() => void rerun()}
      />
    </>
  );
}
