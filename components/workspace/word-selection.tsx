"use client";

import { createContext, useContext } from "react";

/** The word picked for lookup: a source line and the UTF-16 offset where the word starts in it. */
export interface SelectedWord { lineId: string; start: number }

export interface WordSelection {
  selected: SelectedWord | null;
  select: (word: SelectedWord | null) => void;
}

const WordSelectionContext = createContext<WordSelection>({ selected: null, select: () => {} });

export const WordSelectionProvider = WordSelectionContext.Provider;
export const useWordSelection = () => useContext(WordSelectionContext);

// Mirrors the engine tokenizer: whitespace-separated, skipping tokens made only of punctuation, symbols or digits.
const NOT_A_WORD = /^[\p{P}\p{S}\p{N}\u0964\u0965]+$/u;

export interface WordPart { text: string; start: number; word: boolean }

/** Splits a source line into words and the spaces between them, keeping each word's start offset. Joined `text` equals the input. */
export function splitWords(text: string): WordPart[] {
  const parts: WordPart[] = [];
  let at = 0;
  for (const match of text.matchAll(/\S+/gu)) {
    if (match.index > at) parts.push({ text: text.slice(at, match.index), start: at, word: false });
    parts.push({ text: match[0], start: match.index, word: !NOT_A_WORD.test(match[0]) });
    at = match.index + match[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), start: at, word: false });
  return parts;
}
