import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { SabadSchema } from "../../contracts/domain";
import { createRepository } from "../db/repo";

const metadataSchema = z.object({
  source: z.literal("user-provided local BaniDB SQLite copy"),
  source_path: z.literal("data/banidb/banidb.sqlite"),
  source_table: z.literal("tmp_Verse"),
  shabad_id: z.string(), line_ids: z.array(z.string()), line_count: z.number().int().positive(),
  rahao_line_ids: z.array(z.string()), normalization: z.literal("NFC"),
  fixture_sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

type SourceIdentity = { shabad_id: string; lines: { line_id: string; is_rahao: boolean }[] };

export function verifyDemoProvenance(fixtureBytes: string, metadata: unknown, sabad: SourceIdentity): void {
  const record = metadataSchema.parse(metadata);
  if (createHash("sha256").update(fixtureBytes).digest("hex") !== record.fixture_sha256) {
    throw new Error("BaniDB fixture hash does not match local-export provenance.");
  }
  if (record.shabad_id !== sabad.shabad_id || record.line_count !== sabad.lines.length ||
      JSON.stringify(record.line_ids) !== JSON.stringify(sabad.lines.map((line) => line.line_id)) ||
      JSON.stringify(record.rahao_line_ids) !== JSON.stringify(sabad.lines.filter((line) => line.is_rahao).map((line) => line.line_id))) {
    throw new Error("BaniDB fixture source line IDs or Rahao markers do not match provenance.");
  }
}

export function ingestDemoSabad(repo: ReturnType<typeof createRepository>, fixturePath: string, metadataPath: string) {
  const fixtureBytes = readFileSync(fixturePath, "utf8");
  const sabad = SabadSchema.parse(JSON.parse(fixtureBytes));
  const metadata: unknown = JSON.parse(readFileSync(metadataPath, "utf8"));
  verifyDemoProvenance(fixtureBytes, metadata, sabad);
  repo.saveSabad(sabad);
  return { shabad_id: sabad.shabad_id, line_count: sabad.lines.length };
}
