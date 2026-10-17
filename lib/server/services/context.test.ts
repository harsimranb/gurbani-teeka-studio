import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __setSourceForTests, __setStoreForTests, getSourceStatus, getStore, nextId, nowIso, resetStore, seedSyntheticDrafts } from "./context";
import { createMemoryRepository } from "./memory-repo";
import { makeDraft, testSabad } from "./testing";

beforeEach(() => { __setSourceForTests(testSabad()); });
afterEach(() => { vi.restoreAllMocks(); __setSourceForTests(undefined); __setStoreForTests(null); });

describe("store singleton", () => {
  it("seeds ruleset v1 and the injected Sabad on first use, and returns one instance", () => {
    const store = getStore();
    expect(getStore()).toBe(store);
    expect((globalThis as Record<string, unknown>).__ekoStore).toBeDefined();
    expect(store.getLatestRulesetVersion()).toBe(1);
    expect(store.getRuleset(1)).toHaveLength(66);
    expect(store.getSabad("TEST-SABAD")?.lines).toHaveLength(5);
    expect(getSourceStatus()).toEqual({ available: true });
  });
  it("resetStore rebuilds a clean store with ruleset v1 and the source reloaded", () => {
    const first = getStore();
    first.saveDraft(makeDraft());
    first.saveRuleset(2, first.getRuleset(1));
    nextId("draft");
    const fresh = resetStore();
    expect(fresh).not.toBe(first);
    expect(getStore()).toBe(fresh);
    expect(fresh.getDraft("draft-t1")).toBeUndefined();
    expect(fresh.getLatestRulesetVersion()).toBe(1);
    expect(fresh.getSabad("TEST-SABAD")).toBeDefined();
    expect(nextId("draft")).toBe("draft-1");
  });
  it("reports a missing source and still works with no Sabads", () => {
    __setSourceForTests(null);
    const store = getStore();
    expect(getSourceStatus()).toMatchObject({ available: false });
    expect(store.listSabads()).toEqual([]);
    expect(store.getLatestRulesetVersion()).toBe(1);
    expect(seedSyntheticDrafts()).toEqual([]);
  });
  it("reads the private fixture from the working directory and explains absence or invalidity", () => {
    const dir = mkdtempSync(join(tmpdir(), "eko-ctx-test-"));
    try {
      vi.spyOn(process, "cwd").mockReturnValue(dir);
      __setSourceForTests(undefined);
      expect(getSourceStatus()).toEqual({ available: false, reason: expect.stringContaining("not provisioned") });
      mkdirSync(join(dir, "lib/contracts/fixtures"), { recursive: true });
      const file = join(dir, "lib/contracts/fixtures/sabad.demo.json");
      writeFileSync(file, JSON.stringify({ shabad_id: "x", lines: [] }));
      __setSourceForTests(undefined);
      expect(getSourceStatus()).toEqual({ available: false, reason: expect.stringContaining("schema") });
      writeFileSync(file, JSON.stringify(testSabad("FILE-SABAD", 2)));
      __setSourceForTests(undefined);
      expect(getSourceStatus()).toEqual({ available: true });
      expect(getStore().getSabad("FILE-SABAD")?.lines).toHaveLength(2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("lets tests install a custom store", () => {
    const custom = createMemoryRepository();
    __setStoreForTests(custom);
    expect(getStore()).toBe(custom);
    expect(getSourceStatus()).toMatchObject({ available: false });
    custom.saveSabad(testSabad());
    __setStoreForTests(custom);
    expect(getSourceStatus()).toEqual({ available: true });
  });
});

describe("nextId and nowIso", () => {
  it("issues monotonic per-kind IDs", () => {
    expect([nextId("draft"), nextId("draft"), nextId("run"), nextId("decision")]).toEqual(["draft-1", "draft-2", "run-1", "dec-1"]);
    expect([nextId("reference"), nextId("reference"), nextId("proposal"), nextId("rule"), nextId("drift")]).toEqual(["PUB-0001", "PUB-0002", "PR-001", "PROP-001", "drift-1"]);
  });
  it("returns an ISO timestamp", () => {
    expect(nowIso()).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/);
  });
});

describe("seedSyntheticDrafts", () => {
  it("creates the three labelled units on the first Sabad without running checks", () => {
    const drafts = seedSyntheticDrafts();
    expect(drafts.map((d) => d.line_ids)).toEqual([["TEST-SABAD-L1"], ["TEST-SABAD-L2", "TEST-SABAD-L3"], ["TEST-SABAD-L4"]]);
    expect(drafts.map((d) => d.id)).toEqual(["draft-1", "draft-2", "draft-3"]);
    for (const draft of drafts) {
      expect(draft).toMatchObject({ status: "draft", author: "Demo writer", version: 1, layer: "transcreation", shabad_id: "TEST-SABAD" });
      expect(draft.text.startsWith("SYNTHETIC:")).toBe(true);
      expect(getStore().getDraft(draft.id)).toEqual(draft);
      expect(getStore().listCheckRunsForDraft(draft.id)).toEqual([]);
      expect(getStore().listFindingsForDraft(draft.id)).toEqual([]);
    }
  });
  it("does nothing for lines already covered", () => {
    expect(seedSyntheticDrafts()).toHaveLength(3);
    expect(seedSyntheticDrafts()).toEqual([]);
    expect(getStore().listDraftsForSabad("TEST-SABAD")).toHaveLength(3);
  });
  it("skips only the units that overlap an existing draft", () => {
    getStore().saveDraft(makeDraft({ id: "mine", line_ids: ["TEST-SABAD-L3"] }));
    expect(seedSyntheticDrafts().map((d) => d.line_ids)).toEqual([["TEST-SABAD-L1"], ["TEST-SABAD-L4"]]);
  });
});
