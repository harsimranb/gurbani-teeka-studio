import { Fragment } from "react";
import { cn } from "@/lib/utils";

// Escapes only: this file never contains Gurmukhi characters itself.
const GURMUKHI_RUN = /([\u0A00-\u0A7F]+(?:[ \u00A0\u200C\u200D]+[\u0A00-\u0A7F]+)*)/;

/**
 * Renders API-supplied rule text exactly as received. Gurmukhi runs found inside it are only tagged
 * (lang="pa", Gurmukhi font) so they render correctly; no character is changed.
 */
export function VerbatimText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(GURMUKHI_RUN);
  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {parts.map((part, index) => (index % 2 === 1
        ? <span key={index} lang="pa" className="font-gurmukhi">{part}</span>
        : <Fragment key={index}>{part}</Fragment>))}
    </span>
  );
}
