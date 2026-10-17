import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { SabadSchema } from "../../contracts/domain";
import { createRepository } from "../db/repo";

const LOCAL_SOURCE = "user-provided local BaniDB SQLite copy";
const API_SOURCE = "BaniDB hosted API; explicit one-time fallback";
const identityFields = {
  shabad_id: z.string(), line_ids: z.array(z.string()), line_count: z.number().int().positive(),
  rahao_line_ids: z.array(z.string()), normalization: z.literal("NFC"),
  fixture_sha256: z.string().regex(/^[0-9a-f]{64}$/),
};

const localSchema = z.object({
  source: z.literal(LOCAL_SOURCE),
  source_path: z.literal("data/banidb/banidb-upload.sqlite"),
  source_table: z.literal("tmp_Verse"),
  ...identityFields,
});

// Written by scripts/app/export-banidb-api-demo.ts (D-70).
const apiSchema = z.object({
  source: z.literal(API_SOURCE),
  source_id: z.literal("G"),
  endpoint: z.string().regex(/^https:\/\/api\.banidb\.com\/v2\/shabads\/[1-9][0-9]*$/),
  fixture_path: z.string().min(1),
  raw_response_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  ...identityFields,
});

export type ProvenanceKind = "local_sqlite" | "banidb_api_fallback";

type SourceIdentity = { shabad_id: string; lines: { line_id: string; is_rahao: boolean }[] };

/** Accepts the local-SQLite record or the hosted-API fallback record and returns which one it was. Errors never echo source text. */
export function verifyDemoProvenance(fixtureBytes: string, metadata: unknown, sabad: SourceIdentity): ProvenanceKind {
  const declared = typeof metadata === "object" && metadata !== null ? (metadata as { source?: unknown }).source : undefined;
  let kind: ProvenanceKind;
  let record: { shabad_id: string; line_ids: string[]; line_count: number; rahao_line_ids: string[]; fixture_sha256: string };
  if (declared === LOCAL_SOURCE) {
    kind = "local_sqlite";
    record = localSchema.parse(metadata);
  } else if (declared === API_SOURCE) {
    kind = "banidb_api_fallback";
    const api = apiSchema.parse(metadata);
    if (api.endpoint !== `https://api.banidb.com/v2/shabads/${api.shabad_id}`) {
      throw new Error("BaniDB API endpoint does not match the provenance Sabad ID.");
    }
    record = api;
  } else {
    throw new Error("BaniDB provenance source is not an accepted export record.");
  }
  if (createHash("sha256").update(fixtureBytes).digest("hex") !== record.fixture_sha256) {
    throw new Error("BaniDB fixture hash does not match export provenance.");
  }
  if (record.shabad_id !== sabad.shabad_id || record.line_count !== sabad.lines.length ||
      JSON.stringify(record.line_ids) !== JSON.stringify(sabad.lines.map((line) => line.line_id)) ||
      JSON.stringify(record.rahao_line_ids) !== JSON.stringify(sabad.lines.filter((line) => line.is_rahao).map((line) => line.line_id))) {
    throw new Error("BaniDB fixture source line IDs or Rahao markers do not match provenance.");
  }
  return kind;
}

export function ingestDemoSabad(repo: ReturnType<typeof createRepository>, fixturePath: string, metadataPath: string) {
  const fixtureBytes = readFileSync(fixturePath, "utf8");
  const sabad = SabadSchema.parse(JSON.parse(fixtureBytes));
  const metadata: unknown = JSON.parse(readFileSync(metadataPath, "utf8"));
  const provenance = verifyDemoProvenance(fixtureBytes, metadata, sabad);
  repo.saveSabad(sabad);
  return { shabad_id: sabad.shabad_id, line_count: sabad.lines.length, provenance };
}
