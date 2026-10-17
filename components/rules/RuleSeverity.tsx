import type { Rule } from "@/lib/contracts/domain";
import { SeverityBadge } from "@/components/ui";
import { cn } from "@/lib/utils";

const OUTLINE = "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-px font-mono text-[11px] font-semibold";

/** Severity for a catalog row: By design / Suppressor pills, the shared severity badge, or a muted Lens / None. */
export function RuleSeverity({ rule, className }: { rule: Rule; className?: string }) {
  const { scope, severity } = rule.resolution;
  if (scope === "p0_by_design") return <span className={cn(OUTLINE, "border-link-dark text-link-dark", className)}>By design</span>;
  if (scope === "p0_suppressor") return <span className={cn(OUTLINE, "border-link-dark text-link-dark", className)}>Suppressor</span>;
  if (severity === "lens") return <span className={cn(OUTLINE, "border-line-strong text-muted", className)}>Lens</span>;
  if (severity === "none") return <span className={cn(OUTLINE, "border-line-strong text-muted", className)}>None</span>;
  return <SeverityBadge severity={severity} className={className} />;
}
