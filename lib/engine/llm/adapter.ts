import { createAnthropic } from "@ai-sdk/anthropic";
import { createHash } from "node:crypto";
import { generateText, JSONParseError, NoObjectGeneratedError, Output, TypeValidationError } from "ai";
import type { LanguageModel } from "ai";
import pLimit from "p-limit";
import type { z } from "zod";
import { createLlmCache } from "./cache";
import type { LlmCache } from "./cache";

// LLM-02 bake-off (2026-10-16): fastest model that passed every minimal pair.
export const DEFAULT_MODEL = "claude-sonnet-5-5";

const TIMEOUT_MS = 60_000;

export interface LlmRequest<T> { schemaName: string; schema: z.ZodType<T>; system: string; prompt: string; promptVersion: string; evidence: unknown }
export interface LlmClient { model: string; generate<T>(request: LlmRequest<T>): Promise<{ output: T; cached: boolean }> }
export interface LlmClientOptions { model?: string; languageModel?: LanguageModel; cache?: LlmCache | null; concurrency?: number; env?: Record<string, string | undefined> }

/** The model answered, but not in the review schema. Network and auth errors are not wrapped. */
export class LlmSchemaError extends Error {}

/** Null when no model is injected and `ANTHROPIC_API_KEY` is absent; callers then report notEvaluable. */
export function createLlmClient(options: LlmClientOptions = {}): LlmClient | null {
  const env = options.env ?? process.env;
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!options.languageModel && !apiKey) return null;
  const model = options.model || env.EKO_LLM_MODEL || DEFAULT_MODEL;
  const languageModel = options.languageModel ?? createAnthropic({ apiKey })(model);
  const cache = options.cache === undefined ? createLlmCache() : options.cache;
  const limit = pLimit(options.concurrency ?? 4);
  return {
    model,
    async generate<T>(request: LlmRequest<T>) {
      const key = createHash("sha256").update(JSON.stringify([model, request.promptVersion, request.schemaName, request.evidence])).digest("hex");
      const hit = cache?.get(key);
      if (hit !== undefined) {
        const parsed = request.schema.safeParse(hit);
        if (parsed.success) return { output: parsed.data, cached: true };
      }
      const output = await limit(async () => {
        try {
          const result = await generateText({ model: languageModel, system: request.system, prompt: request.prompt, output: Output.object({ schema: request.schema }), abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
          return request.schema.parse(result.output);
        } catch (error) {
          if (NoObjectGeneratedError.isInstance(error) || TypeValidationError.isInstance(error) || JSONParseError.isInstance(error) || isZodError(error)) {
            throw new LlmSchemaError("Model response did not match the review schema", { cause: error });
          }
          throw error;
        }
      });
      cache?.set(key, output);
      return { output, cached: false };
    },
  };
}

function isZodError(error: unknown): boolean {
  return error instanceof Error && error.name === "ZodError";
}
