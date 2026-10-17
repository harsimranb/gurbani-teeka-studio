import type { Finding } from "@/lib/contracts/domain";
import { cn } from "@/lib/utils";

export type Severity = Finding["severity"];
export const SEVERITY_LABEL: Record<Severity, string> = { error: "Error", flag: "Flag", warning: "Warning", hint: "Hint" };

const STYLES: Record<Severity, string> = {
  error: "border-error text-error",
  flag: "border-accent text-flag",
  warning: "border-warning text-warning",
  hint: "border-dashed border-hint text-hint bg-hint-bg",
};

/** Mono rounded pill such as "1 · Error". Text always carries the severity, never colour alone. */
export function SeverityBadge({ severity, index, className }: { severity: Severity; index?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-px font-mono text-[11px] font-semibold", STYLES[severity], className)}>
      {index !== undefined ? `${index} · ` : ""}{SEVERITY_LABEL[severity]}
    </span>
  );
}
