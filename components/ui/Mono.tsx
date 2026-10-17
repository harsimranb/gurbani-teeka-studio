import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Inline mono text in the muted colour (IDs, versions, provenance). */
export function Mono({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("font-mono text-xs text-muted", className)} {...rest} />;
}
