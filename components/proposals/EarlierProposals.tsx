import Link from "next/link";
import { Card, StatusPill, Tag, type Tone } from "@/components/ui";
import type { Proposal } from "@/lib/contracts/domain";
import { cn } from "@/lib/utils";
import { firstLine, formatTime, STATUS_LABEL } from "./format";

const TONE: Record<Proposal["status"], Tone> = { pending: "warning", approved: "ok", rejected: "error" };

/** "Earlier proposals": newest first; selecting one sets `?proposal=`. */
export function EarlierProposals({ proposals, selectedId }: { proposals: Proposal[]; selectedId: string | null }) {
  const sorted = [...proposals].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="border-b border-divider px-5 py-3.5">
        <h2 className="m-0 text-[15px] font-semibold text-ink">Earlier proposals</h2>
      </div>
      {sorted.length === 0 ? (
        <p className="m-0 px-5 py-4 text-[13px] text-muted">No proposals yet.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {sorted.map((p) => {
            const selected = p.id === selectedId;
            return (
              <li key={p.id} className="border-b border-divider last:border-b-0">
                <Link
                  href={`/rules/proposals?proposal=${encodeURIComponent(p.id)}`}
                  aria-current={selected ? "true" : undefined}
                  className={cn("flex flex-col gap-1 px-5 py-3 no-underline hover:bg-subtle", selected && "bg-accent-bg hover:bg-accent-bg")}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-medium text-ink">{p.id}</span>
                    <StatusPill tone={TONE[p.status]}>{STATUS_LABEL[p.status]}</StatusPill>
                    {p.source === "overrides" ? <Tag tone="info">Drafted from overrides</Tag> : null}
                    <span className="ml-auto text-xs text-muted">{p.author} · {formatTime(p.at)}</span>
                  </span>
                  <span className="truncate text-[13px] text-body">{firstLine(p.rule_text)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
