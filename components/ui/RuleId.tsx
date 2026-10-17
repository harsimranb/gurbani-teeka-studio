import Link from "next/link";
import { cn } from "@/lib/utils";

/** Mono rule ID. With `link`, it links to /rules?rule=ID. */
export function RuleId({ id, link = false, className }: { id: string; link?: boolean; className?: string }) {
  const base = "font-mono text-[12px] font-medium";
  if (!link) return <span className={cn(base, "text-ink", className)}>{id}</span>;
  return <Link href={`/rules?rule=${encodeURIComponent(id)}`} className={cn(base, "text-link underline underline-offset-2 hover:text-link-dark", className)}>{id}</Link>;
}
