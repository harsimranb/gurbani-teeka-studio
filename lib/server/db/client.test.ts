import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

describe("app database privacy boundary", () => {
  it("rejects an unignored repository-local database unless its full WAL set is committed", async () => {
    const { assertPrivateAppDbPath } = await import("./client");
    const root = process.cwd();
    expect(() => assertPrivateAppDbPath(root, resolve(root, "data/app.db"))).toThrow("committed");
    expect(() => assertPrivateAppDbPath(root, resolve(root, "data/banidb/banidb-upload.sqlite"))).toThrow("BaniDB source");
    expect(() => assertPrivateAppDbPath(root, resolve(root, "eko.db"))).not.toThrow();
    expect(() => assertPrivateAppDbPath(root, resolve(tmpdir(), "eko-test.db"))).not.toThrow();
  });

  it("resolves the migrations folder at call time and fails clearly when it is missing", async () => {
    const { resolveMigrationsFolder } = await import("./client");
    expect(resolveMigrationsFolder()).toBe(resolve(process.cwd(), "lib/server/db/migrations"));
    expect(resolveMigrationsFolder(resolve(process.cwd(), "lib/server/db/migrations"))).toContain("migrations");
    expect(() => resolveMigrationsFolder(resolve(tmpdir(), "eko-no-such-migrations"))).toThrow("expected");
  });

  it("requires every WAL sidecar to be ignored or explicitly committed", async () => {
    const { assertPrivateAppDbPath } = await import("./client");
    const root = mkdtempSync(join(tmpdir(), "eko-guard-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: root });
      writeFileSync(join(root, ".gitignore"), ["app.seed", "both.db", "both.db-wal", "both.db-shm", "wal-only.db", "wal-only.db-wal", ""].join("\n"));
      for (const file of ["tracked.db", "tracked.db-wal", "tracked.db-shm"]) writeFileSync(join(root, file), "synthetic database marker");
      execFileSync("git", ["add", "--", "tracked.db", "tracked.db-wal", "tracked.db-shm"], { cwd: root });
      expect(() => assertPrivateAppDbPath(root, join(root, "app.seed"))).toThrow("committed");
      expect(() => assertPrivateAppDbPath(root, join(root, "wal-only.db"))).toThrow("committed");
      expect(() => assertPrivateAppDbPath(root, join(root, "both.db"))).not.toThrow();
      expect(() => assertPrivateAppDbPath(root, join(root, "tracked.db"))).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
