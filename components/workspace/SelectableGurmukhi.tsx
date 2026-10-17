"use client";

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { splitWords, useWordSelection } from "./word-selection";

/**
 * A BaniDB source line, read-only, whose words can be picked for lookup. Each word is a button (keyboard and screen-reader
 * reachable); the text itself is never editable and the word shown is exactly the source text.
 */
export function SelectableGurmukhi({ lineId, text }: { lineId: string; text: string }) {
  const { selected, select } = useWordSelection();
  return (
    <div lang="pa" className="font-gurmukhi text-[24px] leading-10 text-ink">
      {splitWords(text).map((part) => {
        if (!part.word) return <Fragment key={part.start}>{part.text}</Fragment>;
        const on = selected?.lineId === lineId && selected.start === part.start;
        return (
          <button
            key={part.start}
            type="button"
            aria-pressed={on}
            title="Look up this word"
            onClick={() => select(on ? null : { lineId, start: part.start })}
            className={cn("cursor-pointer rounded-sm border-0 bg-transparent p-0 font-[inherit] text-[length:inherit] leading-[inherit] text-ink hover:bg-accent-bg", on && "bg-accent-bg shadow-[inset_0_-2px_0_var(--color-accent)]")}
          >
            {part.text}
          </button>
        );
      })}
    </div>
  );
}
