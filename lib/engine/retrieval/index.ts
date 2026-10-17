import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Reference } from "../../contracts/domain";
import { tokenize } from "../gurmukhi";
import type { Embedder, RankedReference, ReferenceIndex, ReferenceLookupResult, ReferenceQuery, RetrievalMethod } from "./types";

export type { Embedder, RankedReference, ReferenceIndex, ReferenceLookupResult, ReferenceQuery, RetrievalMethod } from "./types";

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
const DEFAULT_CACHE_DIR = "data/cache/transformers";
const DEFAULT_K = 5;
// MiniLM cosine: paraphrases of one idea usually land at 0.5+, unrelated sentences stay near 0-0.3.
const DEFAULT_MIN_SCORE = 0.5;
// Jaccard over content words is much lower for the same pairs; 0.2 means about one shared word in five.
const LEXICAL_MIN_SCORE = 0.2;
const STEM_CAP = 0.99;
// A stem match this weak is one shared common word in a long line; it is not evidence of the same idea.
const DEFAULT_MIN_STEM_SCORE = 0.25;
const STOPWORDS = new Set("a an and are as at be been but by for from has have he her him his i in is it its me my of on or our she so than that the their them then there these they this those to us was we were what when which who will with you your".split(" "));

export function lexicalTokens(text: string): Set<string> {
  const words = text.toLowerCase().replace(/['’]/gu, "").split(/[^\p{L}\p{N}]+/u);
  return new Set(words.filter((word) => word.length > 1 && !STOPWORDS.has(word)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared / (a.size + b.size - shared);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

function defaultEmbedder(cacheDir: string): Embedder {
  let extractor: Promise<(texts: string[], options: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>> | undefined;
  return async (texts) => {
    // Lazy import keeps the model runtime out of module load; a failed load is remembered so later calls fail fast.
    extractor ??= import("@huggingface/transformers").then(({ pipeline, env }) => {
      env.cacheDir = cacheDir;
      return pipeline("feature-extraction", EMBEDDING_MODEL) as never;
    });
    const run = await extractor;
    return (await run(texts, { pooling: "mean", normalize: true })).tolist();
  };
}

// Vectors from the default model persist next to the model cache (data/cache/embeddings.json, git-ignored).
// Custom embedders (tests) stay in memory only. Writes are atomic-by-rename; any I/O failure is ignored.
function vectorStore(path: string | null) {
  const vectors = new Map<string, number[]>();
  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    if (!path) return;
    try {
      const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, number[]>;
      for (const [key, vector] of Object.entries(data)) if (Array.isArray(vector)) vectors.set(key, vector);
    } catch { /* missing or unreadable cache: start empty */ }
  };
  return {
    get(key: string) { load(); return vectors.get(key); },
    set(key: string, vector: number[]) { load(); vectors.set(key, vector); },
    save() {
      if (!path) return;
      try {
        mkdirSync(dirname(path), { recursive: true });
        const temp = `${path}.${process.pid}.tmp`;
        writeFileSync(temp, JSON.stringify(Object.fromEntries(vectors)));
        renameSync(temp, path);
      } catch { /* persistence is an optimization only */ }
    },
  };
}

export function createReferenceIndex(options: { embedder?: Embedder | null; cacheDir?: string; minScore?: number; minStemScore?: number } = {}): ReferenceIndex {
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const minStemScore = options.minStemScore ?? DEFAULT_MIN_STEM_SCORE;
  const isDefault = options.embedder === undefined;
  const embedder: Embedder | null = isDefault ? defaultEmbedder(cacheDir) : options.embedder ?? null;
  const modelId = isDefault ? EMBEDDING_MODEL : "custom";
  const store = vectorStore(isDefault ? join(cacheDir, "..", "embeddings.json") : null);
  const keyOf = (text: string) => createHash("sha256").update(`${modelId}\n${text}`).digest("hex");
  let unavailable = false;

  // Returns text -> vector for every requested text, or null when embeddings cannot run (never partial).
  async function embed(texts: string[]): Promise<Map<string, number[]> | null> {
    if (!embedder || unavailable) return null;
    const missing = [...new Set(texts)].filter((text) => !store.get(keyOf(text)));
    try {
      if (missing.length > 0) {
        const vectors = await embedder(missing);
        if (!Array.isArray(vectors) || vectors.length !== missing.length || vectors.some((v) => !Array.isArray(v) || v.length === 0)) throw new Error("embedder returned malformed vectors");
        missing.forEach((text, i) => store.set(keyOf(text), vectors[i]));
        store.save();
      }
    } catch {
      if (isDefault) unavailable = true;
      return null;
    }
    return new Map(texts.map((text) => [text, store.get(keyOf(text))!]));
  }

  return {
    async warm(references) { await embed(references.map((reference) => reference.english)); },

    async lookup({ draft, lines, sabad, references, k = DEFAULT_K }: ReferenceQuery): Promise<ReferenceLookupResult> {
      const best = new Map<string, RankedReference>();
      const consider = (reference: Reference, score: number, method: RetrievalMethod) => {
        const current = best.get(reference.id);
        if (!current || score > current.score) best.set(reference.id, { reference, score, method, exception: reference.exceptions.length > 0 });
      };
      const draftLineIds = new Set(draft.line_ids);

      // Line: the reference covers a source line this draft covers.
      for (const reference of references) if (reference.line_ids.some((id) => draftLineIds.has(id))) consider(reference, 1, "line");

      // Stem: other tukks of the current Sabad sharing words with the draft's lines. Reference carries no Gurmukhi, so a
      // reference can only be matched this way through lines we hold (this Sabad); cross-Sabad stem lookup is impossible.
      const draftStems = new Set(lines.flatMap((line) => tokenize(line.gurmukhi).map((token) => token.stem_key)));
      if (draftStems.size > 0) {
        const lineStems = new Map(sabad.lines.map((line) => [line.line_id, tokenize(line.gurmukhi).map((token) => token.stem_key)]));
        for (const reference of references) {
          if (reference.line_ids.some((id) => draftLineIds.has(id))) continue;
          const shared = new Set(reference.line_ids.flatMap((id) => lineStems.get(id) ?? []).filter((stem) => draftStems.has(stem)));
          const score = Math.min(shared.size / draftStems.size, STEM_CAP);
          if (shared.size > 0 && score >= minStemScore) consider(reference, score, "stem");
        }
      }

      // English similarity: embeddings when they run, otherwise a lexical fallback. Blank drafts have nothing to compare.
      let mode: ReferenceLookupResult["mode"] = "lexical";
      if (references.length > 0 && draft.text.trim().length > 0) {
        const vectors = await embed([draft.text, ...references.map((reference) => reference.english)]);
        if (vectors) {
          mode = "embedding";
          const query = vectors.get(draft.text)!;
          for (const reference of references) {
            const score = cosine(query, vectors.get(reference.english)!);
            if (score >= minScore) consider(reference, score, "embedding");
          }
        } else {
          const query = lexicalTokens(draft.text);
          for (const reference of references) {
            const score = jaccard(query, lexicalTokens(reference.english));
            if (score >= LEXICAL_MIN_SCORE) consider(reference, score, "lexical");
          }
        }
      }

      const ranked = [...best.values()].sort((a, b) => b.score - a.score || (a.reference.id < b.reference.id ? -1 : a.reference.id > b.reference.id ? 1 : 0));
      // k applies to each group, so a run of exception-marked references cannot crowd out ordinary ones.
      return { ordinary: ranked.filter((entry) => !entry.exception).slice(0, k), exceptions: ranked.filter((entry) => entry.exception).slice(0, k), mode };
    },
  };
}
