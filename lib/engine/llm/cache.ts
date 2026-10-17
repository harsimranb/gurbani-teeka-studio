import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface LlmCache { get(key: string): unknown | undefined; set(key: string, value: unknown): void; close?(): void }

export const DEFAULT_CACHE_PATH = "data/cache/llm.sqlite";

/** Engine-private SQLite cache of schema-valid model outputs; the file opens on first use. */
export function createLlmCache(path = DEFAULT_CACHE_PATH): LlmCache {
  let db: Database.Database | undefined;
  const open = () => {
    if (!db) {
      mkdirSync(dirname(path), { recursive: true });
      db = new Database(path);
      db.pragma("journal_mode = WAL");
      db.pragma("busy_timeout = 5000");
      db.exec("CREATE TABLE IF NOT EXISTS llm_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    }
    return db;
  };
  return {
    get(key) {
      const row = open().prepare("SELECT value FROM llm_cache WHERE key = ?").get(key) as { value: string } | undefined;
      return row ? JSON.parse(row.value) : undefined;
    },
    set(key, value) {
      open().prepare("INSERT OR REPLACE INTO llm_cache (key, value) VALUES (?, ?)").run(key, JSON.stringify(value));
    },
    /** Releases the file handle (Windows cannot delete an open SQLite file); a later call reopens it. */
    close() {
      db?.close();
      db = undefined;
    },
  };
}
