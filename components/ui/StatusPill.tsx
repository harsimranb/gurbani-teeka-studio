import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "accent" | "ok" | "error" | "warning" | "info";
const TONES: Record<Tone, string> = {
  neutral: "bg-hint-bg text-muted",
  accent: "bg-accent-bg text-accent-dark",
  ok: "bg-ok-bg text-ok",
  error: "bg-error-bg text-error",
  warning: "bg-warning-bg text-warning",
  info: "bg-info-bg text-info",
};

/** Generic small pill. Always put the status in the text; colour is only reinforcement. */
export function StatusPill({ tone = "neutral", mono, className, children }: { tone?: Tone; mono?: boolean; className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-px text-xs font-medium", mono && "font-mono", TONES[tone], className)}>{children}</span>;
}
/** Alias of StatusPill. */
export const Tag = StatusPill;
