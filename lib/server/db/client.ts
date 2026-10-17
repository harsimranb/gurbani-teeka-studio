import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { execFileSync } from "node:child_process";
import { isAbsolute, relative, resolve, sep } from "node:path";
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
  try {
    execFileSync("git", ["check-ignore", "-q", "--", withinRepo], { cwd: root, stdio: "ignore" });
  } catch {
    throw new Error("Refusing to create a trackable app database inside the repository.");
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

export function migrateAppDb(db: AppDb): void {
  migrate(db, { migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)) });
}
