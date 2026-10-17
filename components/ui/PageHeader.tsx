import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Page title block: small muted eyebrow, h1 with an optional badge, actions on the right. */
export function PageHeader({ eyebrow, title, badge, actions, className }: { eyebrow?: ReactNode; title: ReactNode; badge?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow ? <div className="text-[13px] text-muted">{eyebrow}</div> : null}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 text-[28px] font-semibold tracking-tight text-ink">{title}</h1>
          {badge}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
