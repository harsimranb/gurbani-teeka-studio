import { describe, expect, it } from "vitest";
import seed from "../../../_docs/rules/rules.resolved.json";
import source from "../../../_docs/rules/rules.seed.json";
import { createRepository } from "../db/repo";
import { migrateAppDb, openAppDb } from "../db/client";
import { buildResolvedRules } from "./rules";

describe("resolved rules seed", () => {
  it("upgrades an old rule decision snapshot to a new version without changing its text", async () => {
    const { reconcileResolvedRules } = await import("./rules") as typeof import("./rules") & { reconcileResolvedRules: (repo: ReturnType<typeof createRepository>) => number };
    const { db, sqlite } = openAppDb(":memory:");
    try {
      migrateAppDb(db);
      const repo = createRepository(db);
      const previous = buildResolvedRules().map((rule) => ({ ...rule, resolution: { ...rule.resolution, active: false, mode: undefined, implemented_layers: undefined } }));
      repo.saveRuleset(1, previous);
      expect(reconcileResolvedRules(repo)).toBe(2);
      expect(reconcileResolvedRules(repo)).toBe(2);
      const current = repo.getRuleset(2);
      expect(current).toHaveLength(66);
      expect(current.every((rule) => rule.resolution.active)).toBe(true);
      expect(current.map((rule) => [rule.id, rule.text]).sort()).toEqual(previous.map((rule) => [rule.id, rule.text]).sort());
      expect(repo.getRuleset(1).every((rule) => !rule.resolution.active)).toBe(true);
    } finally { sqlite.close(); }
  });
  it("accounts for all 66 rules across their source layers, including the three reinstated rules", () => {
    expect(seed.rules).toHaveLength(66);
    expect(new Set(seed.rules.map((rule) => rule.id)).size).toBe(66);
    expect(seed.rules.every((rule) => rule.resolution.active)).toBe(true);
    for (const id of ["PRIN-03", "TERM-04", "TERM-05"]) {
      expect(seed.rules.find((rule) => rule.id === id)?.resolution.active).toBe(true);
    }
    expect(seed.rules.map(({ id, text }) => [id, text])).toEqual(source.map(({ id, text }) => [id, text]));
  });
  it("records structural layer separation and literal italics as design-enforced rules", () => {
    for (const id of ["PRIN-05", "LAYER-02"]) {
      const rule = seed.rules.find((entry) => entry.id === id);
      expect(rule?.resolution.scope).toBe("p0_by_design");
      expect(rule?.resolution.implemented_layers).toContain("literal");
    }
  });
  it("restores the publication humility principle as visible publication behavior", () => {
    const rule = seed.rules.find((entry) => entry.id === "PRIN-03");
    expect(rule?.resolution.scope).toBe("p0_by_design");
    expect(rule?.resolution.implemented_layers).toContain("publication");
  });
  it("records source-first evidence and Sabad organization as design-enforced rules", () => {
    for (const id of ["PRIN-02", "FLOW-02"]) {
      const rule = seed.rules.find((entry) => entry.id === id);
      expect(rule?.resolution.scope).toBe("p0_process");
      expect(rule?.resolution.implemented_layers?.length).toBeGreaterThan(0);
    }
    const order = seed.rules.find((entry) => entry.id === "LAYER-04");
    expect(order?.resolution.scope).toBe("p0_suppressor");
    expect(order?.resolution.implemented_layers).toContain("literal");
  });
  it("stores all 66 verbatim rules with explicit implementation coverage once at version 1", async () => {
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
      expect(stored.filter((rule) => rule.resolution.active)).toHaveLength(66);
      expect(stored.filter((rule) => rule.resolution.implemented_layers?.length)).toHaveLength(42);
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
