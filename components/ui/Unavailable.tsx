import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Neutral notice for data that is missing. Say "unavailable", never show 0 or a placeholder value. */
export function Unavailable({ title, reason, className }: { title: string; reason: string; className?: string }) {
  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-xl border border-line bg-subtle p-4", className)}>
      <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        <p className="m-0 text-sm font-semibold text-ink">{title}</p>
        <p className="m-0 text-[13px] text-muted">{reason}</p>
      </div>
    </div>
  );
}
