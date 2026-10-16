// Explicit one-time fallback for the partial development database, not DATA-03 ingest.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { assertCompleteSabad, toDemoSabad } from "./export-banidb-demo";

const payloadSchema = z.object({
  count: z.number().int().positive(),
  shabadInfo: z.object({
    shabadId: z.number().int().positive(),
    source: z.object({ sourceId: z.literal("G") }),
    raag: z.object({ english: z.string().min(1) }),
    writer: z.object({ english: z.string().min(1) }),
  }),
  verses: z.array(z.object({
    verseId: z.number().int().positive(),
    shabadId: z.number().int().positive(),
    pageNo: z.number().int().min(1).max(1430),
    verse: z.object({ gurmukhi: z.string().min(1), unicode: z.string().min(1) }),
  })).min(1),
});

async function main() {
  const id = process.argv[2] || "55";
  if (process.argv.length > 3 || !/^[1-9][0-9]*$/.test(id)) {
    throw new Error("Usage: export-banidb-api-demo.ts [BaniDB Sabad ID]");
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const fixturePath = "lib/contracts/fixtures/sabad.demo.json";
  const metadataPath = "data/banidb/export-metadata.json";
  const rawPath = `data/banidb/api-sabad-${id}.json`;
  for (const path of [fixturePath, metadataPath, rawPath]) {
    execFileSync("git", ["check-ignore", "-q", "--", path], { cwd: root });
  }
  const endpoint = `https://api.banidb.com/v2/shabads/${id}`;
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`BaniDB returned HTTP ${response.status}.`);
  const raw = await response.text();
  const api = payloadSchema.parse(JSON.parse(raw));
  if (String(api.shabadInfo.shabadId) !== id) throw new Error("BaniDB returned a different Sabad.");
  assertCompleteSabad(api.count, api.verses.length);
  const sabad = toDemoSabad(api.verses.map((verse) => ({
    ID: verse.verseId, ShabadID: verse.shabadId,
    SourceID: api.shabadInfo.source.sourceId, PageNo: verse.pageNo,
    Gurmukhi: verse.verse.gurmukhi, GurmukhiUni: verse.verse.unicode,
    RaagEnglish: api.shabadInfo.raag.english, WriterEnglish: api.shabadInfo.writer.english,
  } as Parameters<typeof toDemoSabad>[0][number])), api.shabadInfo.shabadId);
  const json = JSON.stringify(sabad, null, 2) + "\n";
  const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
  const metadata = {
    exported_at: new Date().toISOString(), source: "BaniDB hosted API; explicit one-time fallback",
    source_id: "G", endpoint, shabad_id: sabad.shabad_id,
    line_ids: sabad.lines.map((line) => line.line_id), line_count: sabad.lines.length,
    rahao_line_ids: sabad.lines.filter((line) => line.is_rahao).map((line) => line.line_id),
    normalization: "NFC", fixture_path: fixturePath, fixture_sha256: sha256(json),
    raw_response_path: rawPath, raw_response_sha256: sha256(raw),
    metadata_mapping: "Raag and writer from BaniDB shabadInfo; refrain from the legacy source marker",
    terms: "https://www.banidb.com/tos/",
    limitation: "Complete API Sabad only; does not establish full local database acceptance or current corpus completeness.",
  };
  await mkdir(dirname(resolve(root, fixturePath)), { recursive: true });
  await mkdir(resolve(root, "data/banidb"), { recursive: true });
  await writeFile(resolve(root, rawPath), raw, { mode: 0o600 });
  await writeFile(resolve(root, fixturePath), json, { mode: 0o600 });
  await writeFile(resolve(root, metadataPath), JSON.stringify(metadata, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify(metadata, null, 2));
}

main().catch((error: unknown) => {
  // Validation details can include private source text; keep output limited to the error kind.
  console.error(error instanceof z.ZodError ? "Invalid BaniDB API payload." :
    error instanceof Error ? error.message : "BaniDB API export failed.");
  process.exitCode = 1;
});
