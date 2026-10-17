import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Dashed, non-interactive card for features deferred to P1. */
export function P1Placeholder({ title, children, className }: { title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-dashed border-line-strong bg-transparent p-5 text-muted", className)} aria-label={`${title}, deferred to P1`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-[15px] font-semibold text-muted">{title}</h2>
        <span className="font-mono text-[11px] text-muted">P1 · deferred</span>
      </div>
      {children ? <div className="mt-2 text-[13px] text-muted">{children}</div> : null}
    </div>
  );
}
