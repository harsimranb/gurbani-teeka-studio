"use client";

import { Check } from "lucide-react";
import { GurmukhiText, HighlightedText, Mono } from "@/components/ui";
import { lineLabel, type FindingEntry, type UnitData } from "./data";

export function UnitCard({ unit, entries }: { unit: UnitData; entries: FindingEntry[] }) {
  const numbers = unit.lines.map((l) => l.number);
  const grouped = unit.lines.length > 1;
  const clear = unit.findings.length === 0 && unit.codeRun?.status === "succeeded" && unit.llmRun?.status === "succeeded";
  const spans = entries.filter((e) => e.unit.draft.id === unit.draft.id).map((e) => ({ start: e.finding.start, end: e.finding.end, tone: e.finding.severity, label: e.number }));
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-card" aria-label={lineLabel(numbers)}>
      <div className="flex items-center justify-between gap-3 border-b border-divider px-[18px] py-3 text-xs text-muted">
        <span className="text-sm font-semibold text-ink">{grouped ? `${lineLabel(numbers)} · one transcreation` : lineLabel(numbers)}</span>
        <span className="flex items-center gap-3">
          {clear ? <span className="inline-flex items-center gap-1 text-ok"><Check className="size-3.5" aria-hidden="true" />Clear</span> : null}
          <Mono>{unit.lines.map((l) => l.line.line_id).join(" · ")}</Mono>
        </span>
      </div>
      <div className="flex flex-col gap-2 px-[18px] py-3.5">
        {unit.lines.map(({ line, number }) => (
          <div key={line.line_id} className="flex flex-col">
            {grouped ? <Mono className="text-[11px]">Line {number}</Mono> : null}
            <GurmukhiText text={line.gurmukhi} as="p" className="m-0 text-[20px] leading-[1.6]" />
          </div>
        ))}
        {unit.draft.text.trim().length === 0
          ? <p className="m-0 text-sm text-muted">No transcreation text has been saved for this unit.</p>
          : <HighlightedText text={unit.draft.text} spans={spans} className="block text-[17px] leading-[1.9]" />}
      </div>
    </section>
  );
}
