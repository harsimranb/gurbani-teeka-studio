import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertPrivateAppDbPath, openAppDb, migrateAppDb } from "../../lib/server/db/client";
import { createRepository } from "../../lib/server/db/repo";
import { seedResolvedRules } from "../../lib/server/ingest/rules";
import { ingestBanidb } from "../../lib/server/ingest/banidb-source";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const target = resolve(root, process.env.DATABASE_URL || "eko.db");
assertPrivateAppDbPath(root, target);
const { sqlite, db } = openAppDb(target);
try {
  migrateAppDb(db);
  const source = ingestBanidb(db, root);
  const rules = seedResolvedRules(createRepository(db));
  console.log(JSON.stringify({ source, rules }));
} finally {
  sqlite.close();
}
