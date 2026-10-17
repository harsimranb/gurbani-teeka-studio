import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertPrivateAppDbPath, openAppDb, migrateAppDb } from "../../lib/server/db/client";
import { ingestBanidb } from "../../lib/server/ingest/banidb-source";

// Source lines only (full corpus when the private SQLite copy exists, else the demo fixture).
// Human-authored English drafts arrive later.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const target = resolve(root, process.env.DATABASE_URL || "eko.db");
assertPrivateAppDbPath(root, target);
const { sqlite, db } = openAppDb(target);
try {
  migrateAppDb(db);
  console.log(JSON.stringify(ingestBanidb(db, root)));
} finally {
  sqlite.close();
}
