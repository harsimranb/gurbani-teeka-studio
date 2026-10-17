import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createLlmClient, LlmSchemaError } from "./adapter";
import { createLlmCache } from "./cache";

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
const mockModel = (text: string) => new MockLanguageModelV4({
  doGenerate: async () => ({ content: [{ type: "text", text }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }),
});
const schema = z.object({ verdict: z.enum(["confirm", "reject"]) });
const request = { schemaName: "test", schema, system: "SYNTHETIC SYSTEM", prompt: "SYNTHETIC PROMPT", promptVersion: "test-v1", evidence: { marker: 1 } };

const dirs: string[] = [];
const tempCache = () => { const dir = mkdtempSync(join(tmpdir(), "eko-llm-")); dirs.push(dir); return createLlmCache(join(dir, "nested", "llm.sqlite")); };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("LLM-01 adapter", () => {
  it("returns no client without an injected model or API key", () => {
    expect(createLlmClient({ env: {}, cache: null })).toBeNull();
    expect(createLlmClient({ env: { ANTHROPIC_API_KEY: "synthetic-test-key" }, cache: null })?.model).toBe("claude-sonnet-5-5");
    expect(createLlmClient({ env: { ANTHROPIC_API_KEY: "synthetic-test-key", EKO_LLM_MODEL: "synthetic-model" }, cache: null })?.model).toBe("synthetic-model");
  });

  it("parses a schema-valid answer", async () => {
    const client = createLlmClient({ languageModel: mockModel('{"verdict":"confirm"}'), model: "synthetic-model", cache: null, env: {} })!;
    expect(client.model).toBe("synthetic-model");
    expect(await client.generate(request)).toEqual({ output: { verdict: "confirm" }, cached: false });
  });

  it("serves a repeat question from the cache without calling the model", async () => {
    const model = mockModel('{"verdict":"reject"}');
    const client = createLlmClient({ languageModel: model, cache: tempCache(), env: {} })!;
    expect((await client.generate(request)).cached).toBe(false);
    expect(await client.generate(request)).toEqual({ output: { verdict: "reject" }, cached: true });
    expect(model.doGenerateCalls).toHaveLength(1);
    await client.generate({ ...request, promptVersion: "test-v2" });
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("reports a malformed answer as LlmSchemaError and caches nothing", async () => {
    const cache = tempCache();
    for (const text of ["not json", '{"verdict":"maybe"}']) {
      const client = createLlmClient({ languageModel: mockModel(text), cache, env: {} })!;
      await expect(client.generate(request)).rejects.toBeInstanceOf(LlmSchemaError);
    }
    const good = createLlmClient({ languageModel: mockModel('{"verdict":"confirm"}'), cache, env: {} })!;
    expect((await good.generate(request)).cached).toBe(false);
  });

  it("passes a timeout abort signal to the model call", async () => {
    const model = mockModel('{"verdict":"confirm"}');
    const client = createLlmClient({ languageModel: model, cache: null, env: {} })!;
    await client.generate(request);
    const signal = model.doGenerateCalls[0].abortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });

  it("opens the cache in WAL mode with a busy timeout", () => {
    const dir = mkdtempSync(join(tmpdir(), "eko-llm-"));
    dirs.push(dir);
    const path = join(dir, "llm.sqlite");
    createLlmCache(path).set("k", { v: 1 });
    const db = new Database(path, { readonly: true });
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    db.close();
  });

  it("lets transport errors propagate", async () => {
    const model = new MockLanguageModelV4({ doGenerate: async () => { throw new Error("SYNTHETIC network failure"); } });
    const client = createLlmClient({ languageModel: model, cache: null, env: {} })!;
    await expect(client.generate(request)).rejects.toThrow("SYNTHETIC network failure");
  });
});
