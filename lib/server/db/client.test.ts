import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

describe("app database privacy boundary", () => {
  it("rejects an unignored repository-local database path before opening it", async () => {
    const { assertPrivateAppDbPath } = await import("./client");
    const root = process.cwd();
    expect(() => assertPrivateAppDbPath(root, resolve(root, "data/app.db"))).toThrow("trackable");
    expect(() => assertPrivateAppDbPath(root, resolve(root, "data/banidb/banidb.sqlite"))).toThrow("BaniDB source");
    expect(() => assertPrivateAppDbPath(root, resolve(root, "eko.db"))).not.toThrow();
    expect(() => assertPrivateAppDbPath(root, resolve(tmpdir(), "eko-test.db"))).not.toThrow();
  });
});
