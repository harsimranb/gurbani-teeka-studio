import { Ban, Check, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BannerTone = "error" | "ok" | "info" | "warning";
const STYLES: Record<BannerTone, string> = {
  error: "border-error/40 bg-error-bg text-error",
  ok: "border-ok/40 bg-ok-bg text-ok",
  info: "border-info/30 bg-info-bg text-info",
  warning: "border-warning/40 bg-warning-bg text-warning",
};
const ICONS: Record<BannerTone, ReactNode> = {
  error: <Ban className="size-4" aria-hidden="true" />,
  ok: <Check className="size-4" aria-hidden="true" />,
  info: <Info className="size-4" aria-hidden="true" />,
  warning: <TriangleAlert className="size-4" aria-hidden="true" />,
};

/** Full-width notice strip, like "Publishing is blocked…" (error) or "Published" (ok). Pass `icon={null}` for none. */
export function Banner({ tone, icon, children, className }: { tone: BannerTone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", STYLES[tone], className)}>
      {icon === null ? null : <span className="mt-0.5 shrink-0">{icon ?? ICONS[tone]}</span>}
      <div className="min-w-0 flex-1 text-body [&_b]:text-ink">{children}</div>
    </div>
  );
}
