"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button, Card } from "@/components/ui";
import type { Proposal } from "@/lib/contracts/domain";
import { formatTime } from "./format";

export interface ProposalDraft { rule_text: string; example: string; reason: string }
export const EMPTY_DRAFT: ProposalDraft = { rule_text: "", example: "", reason: "" };

const FIELD = "w-full resize-y rounded-lg border border-faint bg-card px-3 py-2.5 text-[15px] font-normal leading-normal text-ink focus:border-navy";
const READONLY = "m-0 whitespace-pre-wrap rounded-lg bg-subtle px-3 py-2.5 text-[15px] leading-normal text-ink";

export interface ProposalFormProps {
  draft: ProposalDraft;
  onChange: (next: ProposalDraft) => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
  /** False when there is no saved name. */
  canAct: boolean;
  /** When set, the card shows this proposal read-only instead of the form. */
  selected: Proposal | null;
  onNew: () => void;
  /** Increment to move focus to the first field (after "Revise proposal"). */
  focusSignal: number;
}

/** Left card: the submission form, or the selected proposal's own text, read-only. */
export function ProposalForm({ draft, onChange, onSubmit, busy, error, canAct, selected, onNew, focusSignal }: ProposalFormProps) {
  const firstRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (focusSignal > 0) firstRef.current?.focus(); }, [focusSignal]);

  if (selected) {
    return (
      <Card className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="m-0 text-[22px] font-semibold text-ink">Propose a rule</h1>
          <span className="font-mono text-xs text-muted">{selected.id} · {selected.author} · {formatTime(selected.at)}</span>
        </div>
        <ReadOnlyField label="Rule, in your own words" text={selected.rule_text} />
        <ReadOnlyField label="Example" text={selected.example} />
        <ReadOnlyField label="Reason" text={selected.reason} />
        <div className="flex flex-wrap items-center gap-2.5">
          <Button size="sm" onClick={onNew}>Start a new proposal</Button>
          <span className="text-xs text-muted">Read-only. “Revise proposal” copies this text into a new submission.</span>
        </div>
      </Card>
    );
  }

  const ready = draft.rule_text.trim() !== "" && draft.example.trim() !== "" && draft.reason.trim() !== "";
  const submit = (event: FormEvent) => { event.preventDefault(); if (ready && canAct && !busy) onSubmit(); };
  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <h1 className="m-0 text-[22px] font-semibold text-ink">Propose a rule</h1>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
          Rule, in your own words
          <textarea ref={firstRef} rows={3} value={draft.rule_text} onChange={(e) => onChange({ ...draft, rule_text: e.target.value })} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
          Example
          <textarea rows={2} value={draft.example} onChange={(e) => onChange({ ...draft, example: e.target.value })} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
          Reason
          <textarea rows={2} value={draft.reason} onChange={(e) => onChange({ ...draft, reason: e.target.value })} className={FIELD} />
        </label>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button type="submit" variant="primary" className="min-h-11 px-[18px]" disabled={!ready || !canAct || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Submit to drift check
          </Button>
          <span className="text-xs text-muted">Every proposal goes straight to the drift check.</span>
        </div>
        {!canAct ? <p className="m-0 text-xs text-muted">Enter your name first; submissions are saved under it.</p> : null}
        {error ? <p role="alert" className="m-0 text-sm text-error">{error}</p> : null}
      </form>
    </Card>
  );
}

function ReadOnlyField({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <p className={READONLY}>{text}</p>
    </div>
  );
}
