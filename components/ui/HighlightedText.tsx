import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type HighlightTone = "error" | "flag" | "warning" | "hint" | "accent";
export interface HighlightSpan {
  /** UTF-16 offset, inclusive. */
  start: number;
  /** UTF-16 offset, exclusive. */
  end: number;
  tone: HighlightTone;
  /** Superscript label shown after the span (for example the finding number). */
  label?: string | number;
}

const MARK: Record<HighlightTone, string> = {
  error: "bg-error-bg border-b-2 border-solid border-error",
  flag: "bg-flag-bg border-b-2 border-solid border-accent",
  warning: "bg-warning-bg border-b-2 border-dashed border-warning",
  hint: "bg-hint-bg border-b-2 border-dotted border-hint",
  accent: "bg-accent-bg border-b-2 border-solid border-accent",
};
const SUP: Record<HighlightTone, string> = { error: "text-error", flag: "text-flag", warning: "text-warning", hint: "text-hint", accent: "text-accent-dark" };
const RANK: HighlightTone[] = ["error", "flag", "warning", "hint", "accent"];

/**
 * English text with exact [start, end) UTF-16 ranges highlighted. Overlapping spans are merged per
 * segment (strongest tone wins, every label is kept after the span it belongs to). The rendered text
 * content always equals `text` exactly; out-of-range or empty spans are ignored, never dropping text.
 */
export function HighlightedText({ text, spans, className }: { text: string; spans: HighlightSpan[]; className?: string }) {
  const valid = spans
    .map((span, order) => ({ ...span, start: Math.max(0, span.start), end: Math.min(text.length, span.end), order }))
    .filter((span) => span.start < span.end);
  const points = [...new Set([0, text.length, ...valid.flatMap((s) => [s.start, s.end])])].sort((a, b) => a - b);
  const pieces: ReactNode[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const covering = valid.filter((s) => s.start <= a && s.end >= b);
    const slice = text.slice(a, b);
    if (covering.length === 0) { pieces.push(<Fragment key={a}>{slice}</Fragment>); continue; }
    const tone = RANK.find((t) => covering.some((s) => s.tone === t)) ?? "accent";
    const labels = covering.filter((s) => s.end === b && s.label !== undefined).sort((x, y) => x.order - y.order);
    pieces.push(
      <Fragment key={a}>
        <mark data-tone={tone} className={cn("px-0.5 text-ink", MARK[tone])}>
          {slice}
          {labels.map((s) => (
            <sup key={s.order} className={cn("ml-0.5 font-mono text-[10px] font-semibold", SUP[s.tone])}>{s.label}</sup>
          ))}
        </mark>
      </Fragment>,
    );
  }
  return <span className={cn("whitespace-pre-wrap font-serif", className)}>{pieces}</span>;
}
