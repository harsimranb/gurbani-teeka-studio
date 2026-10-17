import type { Draft, Line, Reference, Sabad } from "../../contracts/domain";

export type RetrievalMethod = "line" | "stem" | "embedding" | "lexical";
export interface RankedReference { reference: Reference; score: number; method: RetrievalMethod; exception: boolean }
/** Ordinary references and exception-marked ones stay apart; both sources weigh the same. */
export interface ReferenceLookupResult { ordinary: RankedReference[]; exceptions: RankedReference[]; mode: "embedding" | "lexical" }
export interface ReferenceQuery { draft: Draft; lines: Line[]; sabad: Sabad; references: Reference[]; k?: number }
export type Embedder = (texts: string[]) => Promise<number[][]>;
export interface ReferenceIndex { lookup(query: ReferenceQuery): Promise<ReferenceLookupResult>; warm(references: Reference[]): Promise<void> }
