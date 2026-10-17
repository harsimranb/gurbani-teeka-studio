import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Default true: adds 20px padding. Use false when children manage their own sections. */
  padded?: boolean;
}

/** White card, 1px border, 12px radius. */
export function Card({ padded = true, className, children, ...rest }: CardProps) {
  return (
    <div className={cn("rounded-xl border border-line bg-card", padded && "p-5", className)} {...rest}>
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  /** Right-aligned slot for counts, tags or actions. */
  right?: ReactNode;
  className?: string;
  /** Heading level for the title (default h2). */
  as?: "h1" | "h2" | "h3";
}

export function CardHeader({ title, right, className, as: Heading = "h2" }: CardHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <Heading className="m-0 text-[15px] font-semibold text-ink">{title}</Heading>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}
