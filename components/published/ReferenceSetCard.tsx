import type { Reference, Sabad } from "@/lib/contracts/domain";
import { GurmukhiText, Mono, StatusPill } from "@/components/ui";
import { cn } from "@/lib/utils";
import { lineRangeLabel, linePositions } from "./derive";

const EXCEPTION_STYLE = {
  override: { suffix: "overridden", className: "bg-flag-bg text-flag" },
  waive: { suffix: "waived", className: "bg-warning-bg text-warning" },
  context_reason: { suffix: "departure, with reason", className: "bg-info-bg text-info" },
} as const;

function ExceptionTags({ reference }: { reference: Reference }) {
  const seen = new Set<string>();
  const tags = reference.exceptions.filter((e) => { const k = `${e.rule_id}:${e.action}`; if (seen.has(k)) return false; seen.add(k); return true; });
  if (tags.length === 0) return null;
  return (
    <span className="ml-auto flex flex-wrap gap-1.5">
      {tags.map((e) => (
        <span key={`${e.rule_id}:${e.action}`} className={cn("rounded-md px-2 py-px text-xs font-medium", EXCEPTION_STYLE[e.action].className)}>
          {e.rule_id} {EXCEPTION_STYLE[e.action].suffix}
        </span>
      ))}
    </span>
  );
}

export function ReferenceSetCard({ sabad, references }: { sabad: Sabad; references: Reference[] }) {
  return (
    <section aria-label="Added to the reference set" className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-xl border border-line bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-divider px-5 py-4">
        <h2 className="m-0 text-[17px] font-semibold text-ink">Added to the reference set</h2>
        <StatusPill tone="neutral" className="text-[13px]">Index update pending (LLM-07)</StatusPill>
      </div>
      {references.length === 0 ? (
        <p className="m-0 px-5 py-4 text-sm text-muted">The reference record for these lines is unavailable.</p>
      ) : (
        <ol className="m-0 list-none p-0">
          {references.map((reference) => {
            const lines = reference.line_ids.map((id) => sabad.lines.find((l) => l.line_id === id)).filter((l) => l !== undefined);
            const positions = linePositions(sabad, reference.line_ids);
            return (
              <li key={reference.id} className="flex flex-col gap-1.5 border-b border-hint-bg px-5 py-4 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px] font-semibold text-ink">{reference.id}</span>
                  <span className="text-xs text-muted">
                    {lineRangeLabel(positions).toLowerCase()} · {reference.line_ids.map((id, i) => <span key={id}>{i > 0 ? ", " : ""}<Mono>{id}</Mono></span>)}
                  </span>
                  <ExceptionTags reference={reference} />
                </div>
                {lines.map((line) => <GurmukhiText key={line.line_id} as="p" text={line.gurmukhi} className="m-0 text-[19px] leading-[1.6]" />)}
                <p className="m-0 whitespace-pre-wrap font-serif text-base text-ink">{reference.english}</p>
              </li>
            );
          })}
        </ol>
      )}
      <p className="m-0 border-t border-divider bg-subtle px-5 py-3.5 text-[13px] text-body">
        The next style check can cite these lines with equal weight to SikhRI-supplied references. Lines published with an override, waiver or departure carry that mark, so a one-off exception isn&apos;t learned as the norm.
      </p>
    </section>
  );
}
