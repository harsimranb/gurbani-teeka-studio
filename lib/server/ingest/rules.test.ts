import { describe, expect, it } from "vitest";
import seed from "../../../_docs/rules/rules.resolved.json";
import { createRepository } from "../db/repo";
import { migrateAppDb, openAppDb } from "../db/client";

describe("resolved rules seed", () => {
  it("stores all 66 verbatim rules with 10 active resolutions once at version 1", async () => {
    const { seedResolvedRules } = await import("./rules");
    const { db, sqlite } = openAppDb(":memory:");
    try {
      migrateAppDb(db);
      const repo = createRepository(db);
      seedResolvedRules(repo);
      seedResolvedRules(repo);
      const stored = repo.getRuleset(1);
      expect(stored).toHaveLength(66);
      expect(new Set(stored.map((rule) => rule.id)).size).toBe(66);
      expect(stored.filter((rule) => rule.resolution.active)).toHaveLength(10);
      expect(stored.map((rule) => [rule.id, rule.text]).sort()).toEqual(
        seed.rules.map((rule) => [rule.id, rule.text]).sort(),
      );
      expect(repo.getLatestRulesetVersion()).toBe(1);
      expect((sqlite.prepare("SELECT COUNT(*) AS count FROM rules").get() as { count: number }).count).toBe(66);
    } finally {
      sqlite.close();
    }
  });
});
