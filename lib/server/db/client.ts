import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

export function assertPrivateAppDbPath(root: string, target: string): void {
  const sourceDir = resolve(root, "data/banidb");
  const withinSource = relative(sourceDir, resolve(target));
  if (withinSource === "" || (!withinSource.startsWith(`..${sep}`) && withinSource !== ".." && !isAbsolute(withinSource))) {
    throw new Error("Refusing to use the private BaniDB source directory as the app database target.");
  }
  const withinRepo = relative(resolve(root), resolve(target));
  if (withinRepo === ".." || withinRepo.startsWith(`..${sep}`) || isAbsolute(withinRepo)) return;
  // WAL mode also writes <file>-wal and <file>-shm. Permit a local database only when all
  // three paths are ignored or the user has explicitly committed all three to this repository.
  for (const suffix of ["", "-wal", "-shm"]) {
    const path = withinRepo + suffix;
    try {
      execFileSync("git", ["check-ignore", "-q", "--", path], { cwd: root, stdio: "ignore" });
      continue;
    } catch {
      try {
        execFileSync("git", ["ls-files", "--error-unmatch", "--", path], { cwd: root, stdio: "ignore" });
      } catch {
        throw new Error("Refusing to create an unignored app database inside the repository unless its main file and WAL sidecars are all committed.");
      }
    }
  }
}

export function openAppDb(path: string) {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle({ client: sqlite, schema });
  return { sqlite, db };
}

export type AppDb = ReturnType<typeof openAppDb>["db"];

/**
 * Finds the drizzle migrations folder at call time (never via `new URL(literal, import.meta.url)`, which
 * webpack would try to bundle). Order: explicit argument, EKO_MIGRATIONS_DIR, <cwd>/lib/server/db/migrations
 * (Next dev/build/start, scripts and vitest all run from the repo root), then next to this source file.
 */
export function resolveMigrationsFolder(explicit?: string): string {
  const candidates: string[] = [];
  if (explicit) candidates.push(resolve(explicit));
  else {
    if (process.env.EKO_MIGRATIONS_DIR) candidates.push(resolve(process.env.EKO_MIGRATIONS_DIR));
    candidates.push(resolve(process.cwd(), "lib/server/db/migrations"));
    try { candidates.push(join(dirname(fileURLToPath(import.meta.url)), "migrations")); } catch { /* bundled: no file URL */ }
  }
  const found = candidates.find((candidate) => existsSync(join(candidate, "meta", "_journal.json")));
  if (!found) throw new Error(`Cannot find the database migrations folder; expected ${candidates[0] ?? "lib/server/db/migrations"}. Set EKO_MIGRATIONS_DIR to override.`);
  return found;
}

export function migrateAppDb(db: AppDb, migrationsFolder?: string): void {
  migrate(db, { migrationsFolder: resolveMigrationsFolder(migrationsFolder) });
}
