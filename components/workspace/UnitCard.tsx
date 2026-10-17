"use client";

import { useEffect, useId, useRef } from "react";
import { Button, Mono, StatusPill } from "@/components/ui";
import type { Line } from "@/lib/contracts/domain";
import { lineLabel, type Report, type Unit } from "./model";
import { SelectableGurmukhi } from "./SelectableGurmukhi";
import { UnitStatus, type Inflight } from "./UnitStatus";

export interface UnitCardProps {
  unit: Unit;
  lines: Line[];
  lineNumber: (lineId: string) => number;
  dirty: boolean;
  report: Report | undefined;
  inflight: Inflight;
  shabadId: string;
  /** Focus and scroll to this unit's textarea on arrival (`?focus=<draftId>`). */
  autoFocus: boolean;
  onText: (text: string) => void;
  /** Absent for the last unit. */
  onGroupNext?: () => void;
  onUngroup: () => void;
  onRetry: (phase: "code" | "llm") => void;
}

export function UnitCard({ unit, lines, lineNumber, dirty, report, inflight, shabadId, autoFocus, onText, onGroupNext, onUngroup, onRetry }: UnitCardProps) {
  const textareaId = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const grouped = lines.length > 1;

  useEffect(() => {
    if (!autoFocus) return;
    area.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    area.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-card" aria-label={lineLabel(unit.lineIds, lineNumber)}>
      {grouped ? (
        <div className="flex items-center justify-between gap-2 border-b border-divider bg-subtle px-5 py-2.5 text-xs text-body">
          <span className="font-semibold">One transcreation for {lineLabel(unit.lineIds, lineNumber).toLowerCase()}</span>
          <Button size="sm" className="min-h-8 rounded-md px-2.5 text-xs" onClick={onUngroup}>Ungroup</Button>
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5 px-5 pt-4">
        {lines.map((line) => (
          <div key={line.line_id}>
            <div className="flex items-center justify-between gap-2 text-xs text-muted">
              <span className="flex items-center gap-2">Line {lineNumber(line.line_id)}{line.is_rahao ? <StatusPill tone="accent">Rahao</StatusPill> : null}</span>
              <Mono>{line.line_id}</Mono>
            </div>
            <SelectableGurmukhi lineId={line.line_id} text={line.gurmukhi} />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 px-5 pt-3 pb-4">
        <label htmlFor={textareaId} className="text-xs font-semibold tracking-wider text-muted uppercase">Transcreation</label>
        <textarea
          ref={area}
          id={textareaId}
          rows={grouped ? 3 : 2}
          value={unit.text}
          onChange={(event) => onText(event.target.value)}
          placeholder={grouped ? "Write the transcreation for these lines in your own words." : "Write the transcreation for this line in your own words."}
          className="field-sizing-content w-full resize-y rounded-lg border border-faint bg-card px-3 py-2.5 font-serif text-[17px] leading-[1.55] text-ink placeholder:text-faint focus:border-navy"
        />
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <UnitStatus unit={unit} dirty={dirty} report={report} inflight={inflight} shabadId={shabadId} onRetry={onRetry} />
          {onGroupNext ? <Button size="sm" className="ml-auto min-h-9" onClick={onGroupNext}>Group with next line</Button> : null}
        </div>
      </div>
    </article>
  );
}
