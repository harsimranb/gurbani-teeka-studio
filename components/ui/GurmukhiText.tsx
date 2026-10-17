import { cn } from "@/lib/utils";

const SIZES = { md: "text-[18px] leading-8", lg: "text-[24px] leading-10", xl: "text-[30px] leading-[3rem]" } as const;

export interface GurmukhiTextProps {
  /** Text from `Sabad.lines[].gurmukhi` only. Display only; never put it in an editable control. */
  text: string;
  size?: keyof typeof SIZES;
  as?: "div" | "span" | "p";
  className?: string;
  /** Gurmukhi is never highlighted or annotated here. */
  highlights?: never;
}

/** Read-only Gurmukhi (BaniDB source) in Noto Sans Gurmukhi with lang="pa". */
export function GurmukhiText({ text, size = "md", as: Tag = "div", className }: GurmukhiTextProps) {
  return <Tag lang="pa" className={cn("font-gurmukhi text-ink", SIZES[size], className)}>{text}</Tag>;
}
