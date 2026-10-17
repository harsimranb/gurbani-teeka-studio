import type { ReactNode } from "react";

/** Three columns: queue (240px), decisions (flexible), decision log (280px). Stacks on narrow screens. */
export function ReviewGrid({ left, center, right }: { left: ReactNode; center: ReactNode; right?: ReactNode }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_280px]">
      <div className="min-w-0">{left}</div>
      <section aria-label="Decisions" className="flex min-w-0 flex-col gap-3.5">{center}</section>
      {right ? <div className="min-w-0 lg:col-span-2 xl:col-span-1">{right}</div> : null}
    </div>
  );
}
