import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

export function openAppDb(path: string) {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle({ client: sqlite, schema });
  return { sqlite, db };
}

export type AppDb = ReturnType<typeof openAppDb>["db"];

export function migrateAppDb(db: AppDb): void {
  migrate(db, { migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)) });
}
