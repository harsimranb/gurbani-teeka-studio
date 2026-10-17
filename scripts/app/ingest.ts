import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertPrivateAppDbPath, openAppDb, migrateAppDb } from "../../lib/server/db/client";
import { createRepository } from "../../lib/server/db/repo";
import { ingestDemoSabad } from "../../lib/server/ingest/banidb";
import { seedResolvedRules } from "../../lib/server/ingest/rules";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const target = resolve(root, process.env.DATABASE_URL || "eko.db");
const fixture = resolve(root, "lib/contracts/fixtures/sabad.demo.json");
const metadata = resolve(root, "data/banidb/export-metadata.json");
assertPrivateAppDbPath(root, target);
const { sqlite, db } = openAppDb(target);
try {
  migrateAppDb(db);
  const repo = createRepository(db);
  const source = ingestDemoSabad(repo, fixture, metadata);
  const rules = seedResolvedRules(repo);
  console.log(JSON.stringify({ source, rules }));
} finally {
  sqlite.close();
}
