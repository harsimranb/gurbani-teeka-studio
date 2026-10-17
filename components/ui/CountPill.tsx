import { cn } from "@/lib/utils";
import type { Severity } from "./SeverityBadge";

const NOUN: Record<Severity, [string, string]> = { error: ["error", "errors"], flag: ["flag", "flags"], warning: ["warning", "warnings"], hint: ["hint", "hints"] };
const FILLED: Record<Severity, string> = { error: "bg-error-bg text-error", flag: "bg-flag-bg text-flag", warning: "bg-warning-bg text-warning", hint: "bg-hint-bg text-hint" };
const OUTLINE: Record<Severity, string> = { error: "border-error text-error", flag: "border-accent text-flag", warning: "border-warning text-warning", hint: "border-dashed border-hint text-hint" };

/** Header count such as "2 errors" or "1 flag". size md = filled pill, sm = small mono outline. */
export function CountPill({ severity, count, size = "md", className }: { severity: Severity; count: number; size?: "md" | "sm"; className?: string }) {
  const label = `${count} ${NOUN[severity][count === 1 ? 0 : 1]}`;
  return size === "sm"
    ? <span className={cn("inline-flex items-center rounded-full border px-2 py-px font-mono text-[11px] font-semibold", OUTLINE[severity], className)}>{label}</span>
    : <span className={cn("inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold", FILLED[severity], className)}>{label}</span>;
}
