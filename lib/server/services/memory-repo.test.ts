import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Publication, Sabad } from "../../contracts/domain";
import { driftFixtures, proposalFixture, rulesFixture } from "../../contracts/fixtures";
import { migrateAppDb, openAppDb } from "../db/client";
import { createRepository, type Repository } from "../db/repo";
import { createMemoryRepository } from "./memory-repo";
import { makeDraft, makeFinding, makeRun, TEST_AT } from "./testing";

type Backend = { name: string; run: (body: (repo: Repository) => void) => Promise<void> };

const backends: Backend[] = [
  { name: "memory", run: async (body) => body(createMemoryRepository()) },
  {
    name: "sqlite",
    run: async (body) => {
      const dir = mkdtempSync(join(tmpdir(), "eko-contract-test-"));
      const { db, sqlite } = openAppDb(join(dir, "app.sqlite"));
      try { migrateAppDb(db); body(createRepository(db)); } finally { sqlite.close(); rmSync(dir, { recursive: true, force: true }); }
    },
  },
];

// Numeric line IDs: the SQLite repository orders source lines numerically.
const sabad: Sabad = {
  shabad_id: "9001",
  lines: [101, 102, 103].map((n) => ({ line_id: String(n), shabad_id: "9001", ang: 7, raag: "TEST-RAAG", writer: "TEST-WRITER", is_rahao: n === 102, gurmukhi: `TEST-SOURCE-${n}` })),
};
const reference = { id: "PUB-0001", line_ids: ["101"], english: "SYNTHETIC REFERENCE MARKER", source: "published" as const, exceptions: [] };

/** One behavioural table, run against BOTH implementations so the interfaces cannot drift. */
const cases: Array<[string, (repo: Repository) => void]> = [
  ["round-trips drafts and returns independent copies", (repo) => {
    const draft = makeDraft({ line_ids: ["101", "102"] });
    repo.saveDraft(draft);
    expect(repo.getDraft(draft.id)).toEqual(draft);
    const fetched = repo.getDraft(draft.id)!;
    fetched.text = "MUTATED";
    fetched.line_ids.push("999");
    expect(repo.getDraft(draft.id)).toEqual(draft);
    draft.text = "MUTATED-INPUT";
    expect(repo.getDraft(draft.id)?.text).toBe("SYNTHETIC TEST: [sample]");
    repo.saveDraft({ ...draft, text: "v2", version: 2 });
    expect(repo.getDraft(draft.id)).toMatchObject({ text: "v2", version: 2 });
    expect(repo.listDraftsForSabad("TEST-SABAD")).toHaveLength(1);
    expect(repo.listDraftsForSabad("other")).toEqual([]);
    expect(repo.getDraft("missing")).toBeUndefined();
  }],
  ["rejects invalid writes without storing them", (repo) => {
    expect(() => repo.saveDraft({ ...makeDraft(), id: "bad", author: " " })).toThrow();
    expect(() => repo.saveDraft({ ...makeDraft(), id: "bad", line_ids: [] })).toThrow();
    expect(repo.getDraft("bad")).toBeUndefined();
    expect(() => repo.saveFinding({ ...makeFinding(), id: "bad", end: 99 })).toThrow();
    expect(repo.getFinding("bad")).toBeUndefined();
    expect(() => repo.saveDecision({ id: "bad", finding_id: "f", draft_id: "d", draft_version: 1, ruleset_version: 1, action: "waive", reason: " ", reviewer: "R", at: TEST_AT })).toThrow();
    expect(repo.getDecision("bad")).toBeUndefined();
  }],
  ["upserts findings by ID and lists them per draft", (repo) => {
    repo.saveFinding(makeFinding());
    repo.saveFinding(makeFinding({ id: "other", draft_id: "draft-other" }));
    repo.saveFinding(makeFinding({ state: "cleared", cleared_at: TEST_AT }));
    expect(repo.getFinding("finding-t1")?.state).toBe("cleared");
    expect(repo.listFindingsForDraft("draft-t1")).toHaveLength(1);
    expect(repo.listFindingsForDraft("draft-other")).toHaveLength(1);
  }],
  ["upserts check runs on (draft, draft version, ruleset version, phase)", (repo) => {
    repo.saveCheckRun(makeRun({ status: "pending", completed_at: null }));
    repo.saveCheckRun(makeRun({ id: "run-t2" }));
    expect(repo.listCheckRunsForDraft("draft-t1")).toHaveLength(1);
    expect(repo.getCheckRun("run-t1")).toBeUndefined();
    expect(repo.getCheckRun("run-t2")?.status).toBe("succeeded");
    repo.saveCheckRun(makeRun({ id: "run-llm", phase: "llm" }));
    repo.saveCheckRun(makeRun({ id: "run-v2", draft_version: 2 }));
    repo.saveCheckRun(makeRun({ id: "run-rules2", ruleset_version: 2 }));
    expect(repo.listCheckRunsForDraft("draft-t1")).toHaveLength(4);
    // Same ID, same key: plain update.
    repo.saveCheckRun(makeRun({ id: "run-t2", cached: true }));
    expect(repo.getCheckRun("run-t2")?.cached).toBe(true);
    expect(repo.listCheckRunsForDraft("draft-t1")).toHaveLength(4);
  }],
  ["stores decisions per draft", (repo) => {
    const decision = { id: "dec-1", finding_id: "finding-t1", draft_id: "draft-t1", draft_version: 1, ruleset_version: 1, action: "override" as const, reason: "Because.", reviewer: "R", at: TEST_AT };
    repo.saveDecision(decision);
    repo.saveDecision({ ...decision, id: "dec-2", draft_id: "draft-other" });
    expect(repo.getDecision("dec-1")).toEqual(decision);
    expect(repo.listDecisionsForDraft("draft-t1")).toEqual([decision]);
  }],
  ["keeps ruleset snapshots idempotent and immutable", (repo) => {
    expect(repo.getLatestRulesetVersion()).toBeUndefined();
    expect(repo.getRuleset(1)).toEqual([]);
    repo.saveRuleset(1, rulesFixture);
    repo.saveRuleset(1, rulesFixture);
    expect(repo.getRuleset(1)).toHaveLength(rulesFixture.length);
    expect(repo.getLatestRulesetVersion()).toBe(1);
    expect(() => repo.saveRuleset(1, rulesFixture.slice(1))).toThrow("differs");
    expect(() => repo.saveRuleset(1, [{ ...rulesFixture[0], plan: "changed" }, ...rulesFixture.slice(1)])).toThrow("differs");
    expect(() => repo.saveRuleset(2, [rulesFixture[0], rulesFixture[0]])).toThrow("Duplicate");
    expect(() => repo.saveRuleset(0, rulesFixture)).toThrow();
    expect(repo.getLatestRulesetVersion()).toBe(1);
    repo.saveRuleset(3, rulesFixture.slice(0, 2));
    expect(repo.getLatestRulesetVersion()).toBe(3);
    expect(repo.getRuleset(3)).toHaveLength(2);
    expect(repo.getRuleset(2)).toEqual([]);
  }],
  ["round-trips source lines and refuses a changed line set or changed text", (repo) => {
    expect(repo.getSabad("9001")).toBeUndefined();
    repo.saveSabad(sabad);
    repo.saveSabad(sabad);
    expect(repo.getSabad("9001")).toEqual(sabad);
    expect(repo.listSabads()).toEqual([{ shabad_id: "9001", ang: 7, raag: "TEST-RAAG", writer: "TEST-WRITER" }]);
    expect(() => repo.saveSabad({ ...sabad, lines: sabad.lines.slice(0, 2) })).toThrow("source line set");
    expect(() => repo.saveSabad({ ...sabad, lines: sabad.lines.map((line) => (line.line_id === "102" ? { ...line, gurmukhi: "TEST-CHANGED" } : line)) })).toThrow("changed");
    expect(repo.getSabad("9001")).toEqual(sabad);
  }],
  ["saveSabads loads several Sabads all-or-nothing", (repo) => {
    const one = (id: string, text: string): Sabad => ({ shabad_id: id, lines: [{ line_id: `${id}01`, shabad_id: id, ang: 1, raag: "TEST-RAAG", writer: "TEST-WRITER", is_rahao: false, gurmukhi: text }] });
    repo.saveSabads([one("1", "TEST-ONE"), one("2", "TEST-TWO")]);
    repo.saveSabads([one("1", "TEST-ONE"), one("2", "TEST-TWO")]);
    expect(repo.listSabads().map((entry) => entry.shabad_id)).toEqual(["1", "2"]);
    expect(() => repo.saveSabads([one("3", "TEST-THREE"), one("2", "TEST-CHANGED")])).toThrow("silent replacement");
    expect(repo.getSabad("3")).toBeUndefined();
    expect(repo.getSabad("2")?.lines[0].gurmukhi).toBe("TEST-TWO");
    expect(() => repo.saveSabads([one("4", "TEST-FOUR"), { shabad_id: "5", lines: [] }])).toThrow();
    expect(repo.getSabad("4")).toBeUndefined();
    expect(repo.listSabads()).toHaveLength(2);
  }],
  ["stores references, proposals and drift results", (repo) => {
    expect(repo.listReferences()).toEqual([]);
    expect(repo.listProposals()).toEqual([]);
    repo.saveReference(reference);
    repo.saveReference({ ...reference, id: "PUB-0002" });
    expect(repo.getReference("PUB-0001")).toEqual(reference);
    expect(repo.listReferences().map((r) => r.id)).toEqual(["PUB-0001", "PUB-0002"]);
    repo.saveProposal(proposalFixture);
    repo.saveProposal({ ...proposalFixture, id: "PR-002" });
    repo.saveProposal({ ...proposalFixture, status: "approved" });
    expect(repo.listProposals().map((p) => p.id)).toEqual([proposalFixture.id, "PR-002"]);
    expect(repo.getProposal(proposalFixture.id)?.status).toBe("approved");
    repo.saveDriftResult(driftFixtures[0]);
    repo.saveDriftResult({ ...driftFixtures[1], proposal_id: "PR-002" });
    expect(repo.getDriftResult(driftFixtures[0].id)).toEqual(driftFixtures[0]);
    expect(repo.listDriftResultsForProposal(proposalFixture.id)).toEqual([driftFixtures[0]]);
  }],
  ["deleteDraft removes the draft with its findings, runs and decisions only", (repo) => {
    const decision = { id: "dec-1", finding_id: "finding-t1", draft_id: "draft-t1", draft_version: 1, ruleset_version: 1, action: "accept" as const, reason: "Because.", reviewer: "R", at: TEST_AT };
    repo.saveDraft(makeDraft());
    repo.saveDraft(makeDraft({ id: "draft-keep" }));
    repo.saveFinding(makeFinding());
    repo.saveFinding(makeFinding({ id: "keep-f", draft_id: "draft-keep" }));
    repo.saveCheckRun(makeRun());
    repo.saveCheckRun(makeRun({ id: "keep-r", draft_id: "draft-keep" }));
    repo.saveDecision(decision);
    repo.saveDecision({ ...decision, id: "keep-d", draft_id: "draft-keep" });
    repo.deleteDraft("draft-t1");
    expect(repo.getDraft("draft-t1")).toBeUndefined();
    expect(repo.listFindingsForDraft("draft-t1")).toEqual([]);
    expect(repo.listCheckRunsForDraft("draft-t1")).toEqual([]);
    expect(repo.listDecisionsForDraft("draft-t1")).toEqual([]);
    expect(repo.getFinding("finding-t1")).toBeUndefined();
    expect(repo.getDraft("draft-keep")).toBeDefined();
    expect(repo.listFindingsForDraft("draft-keep")).toHaveLength(1);
    expect(repo.listCheckRunsForDraft("draft-keep")).toHaveLength(1);
    expect(repo.listDecisionsForDraft("draft-keep")).toHaveLength(1);
    expect(() => repo.deleteDraft("never-existed")).not.toThrow();
  }],
  ["files publications by Sabad, oldest first, and returns independent copies", (repo) => {
    const gate = { draft_id: "draft-t1", draft_version: 1, ruleset_version: 1, can_publish: true, blockers: [], warning_ids: [] };
    const publication = (id: string, draftId: string, at = TEST_AT): Publication => ({
      reference: { ...reference, id }, draft_id: draftId, approver: "Approver", at, gate: { ...gate, draft_id: draftId },
    });
    repo.saveDraft(makeDraft());
    repo.saveDraft(makeDraft({ id: "draft-b", shabad_id: "OTHER" }));
    // Explicit Sabad ID, inferred from the draft, and inferred from the first covered source line.
    repo.savePublication(publication("PUB-0002", "draft-t1", "2026-10-16T12:00:05.000Z"), "TEST-SABAD");
    repo.savePublication(publication("PUB-0001", "draft-t1", "2026-10-16T12:00:05.000Z"));
    repo.savePublication(publication("PUB-0003", "draft-b"), "OTHER");
    repo.saveSabad(sabad);
    repo.savePublication(publication("PUB-0004", "no-such-draft", "2026-10-16T12:00:01.000Z"));
    repo.savePublication(publication("PUB-0002", "draft-t1", "2026-10-16T12:00:05.000Z"), "TEST-SABAD"); // upsert
    expect(repo.listPublicationsForSabad("TEST-SABAD").map((p) => p.reference.id)).toEqual(["PUB-0001", "PUB-0002"]);
    expect(repo.listPublicationsForSabad("OTHER").map((p) => p.reference.id)).toEqual(["PUB-0003"]);
    expect(repo.listPublicationsForSabad("9001").map((p) => p.reference.id)).toEqual(["PUB-0004"]);
    expect(repo.listPublicationsForSabad("none")).toEqual([]);
    repo.listPublicationsForSabad("OTHER")[0].approver = "MUTATED";
    expect(repo.listPublicationsForSabad("OTHER")[0].approver).toBe("Approver");
    repo.savePublication(publication("PUB-0000", "draft-t1", "2026-10-16T11:00:00.000Z"));
    expect(repo.listPublicationsForSabad("TEST-SABAD").map((p) => p.reference.id)).toEqual(["PUB-0000", "PUB-0001", "PUB-0002"]);
    // Invalid or unplaceable publications are rejected and not stored; publications outlive their draft.
    expect(() => repo.savePublication({ ...publication("PUB-0009", "draft-t1"), approver: " " })).toThrow();
    expect(() => repo.savePublication({ ...publication("PUB-0009", "unknown-draft"), reference: { ...reference, id: "PUB-0009", line_ids: ["404"] } })).toThrow("unknown");
    expect(repo.listPublicationsForSabad("TEST-SABAD")).toHaveLength(3);
    repo.deleteDraft("draft-t1");
    expect(repo.listPublicationsForSabad("TEST-SABAD")).toHaveLength(3);
  }],
  ["nextSequence counts from 1, per kind, and keeps counting", (repo) => {
    expect([repo.nextSequence("draft"), repo.nextSequence("draft"), repo.nextSequence("draft")]).toEqual([1, 2, 3]);
    expect(repo.nextSequence("run")).toBe(1);
    expect(repo.nextSequence("draft")).toBe(4);
    expect(repo.nextSequence("PUB")).toBe(1);
    expect(() => repo.nextSequence("")).toThrow();
    expect(() => repo.nextSequence("  ")).toThrow();
    expect(repo.nextSequence("draft")).toBe(5);
  }],
  ["listDrafts returns every draft in first-save order", (repo) => {
    expect(repo.listDrafts()).toEqual([]);
    repo.saveDraft(makeDraft({ id: "draft-b", shabad_id: "S2" }));
    repo.saveDraft(makeDraft({ id: "draft-a" }));
    repo.saveDraft(makeDraft({ id: "draft-c", shabad_id: "S2" }));
    repo.saveDraft(makeDraft({ id: "draft-b", shabad_id: "S2", text: "v2", version: 2 }));
    expect(repo.listDrafts().map((d) => d.id)).toEqual(["draft-b", "draft-a", "draft-c"]);
    expect(repo.listDrafts()[0]).toMatchObject({ text: "v2", version: 2 });
    repo.deleteDraft("draft-a");
    expect(repo.listDrafts().map((d) => d.id)).toEqual(["draft-b", "draft-c"]);
  }],
  ["transaction commits what it wrote and returns its result", (repo) => {
    const decision = { id: "dec-1", finding_id: "finding-t1", draft_id: "draft-t1", draft_version: 1, ruleset_version: 1, action: "accept" as const, reason: "Because.", reviewer: "R", at: TEST_AT };
    const result = repo.transaction((store) => {
      store.saveDraft(makeDraft());
      store.saveFinding(makeFinding());
      store.saveDecision(decision);
      expect(store.getDraft("draft-t1")).toBeDefined(); // reads inside see the writes
      return store.nextSequence("draft");
    });
    expect(result).toBe(1);
    expect(repo.getDraft("draft-t1")).toBeDefined();
    expect(repo.getFinding("finding-t1")).toBeDefined();
    expect(repo.getDecision("dec-1")).toEqual(decision);
    expect(repo.nextSequence("draft")).toBe(2);
  }],
  ["transaction rolls back every write when the callback throws", (repo) => {
    repo.saveSabad(sabad);
    repo.saveRuleset(1, rulesFixture);
    repo.saveDraft(makeDraft({ id: "draft-before" }));
    repo.nextSequence("draft");
    expect(() => repo.transaction((store) => {
      store.saveDraft(makeDraft());
      store.deleteDraft("draft-before");
      store.saveFinding(makeFinding());
      store.saveCheckRun(makeRun());
      store.saveProposal(proposalFixture);
      store.saveReference(reference);
      store.saveRuleset(2, rulesFixture.slice(0, 2));
      store.nextSequence("draft");
      store.nextSequence("run");
      throw new Error("boom");
    })).toThrow("boom");
    expect(repo.listDrafts().map((d) => d.id)).toEqual(["draft-before"]);
    expect(repo.getFinding("finding-t1")).toBeUndefined();
    expect(repo.listCheckRunsForDraft("draft-t1")).toEqual([]);
    expect(repo.listProposals()).toEqual([]);
    expect(repo.listReferences()).toEqual([]);
    expect(repo.getLatestRulesetVersion()).toBe(1);
    expect(repo.nextSequence("draft")).toBe(2);
    expect(repo.nextSequence("run")).toBe(1);
    expect(repo.getSabad("9001")).toEqual(sabad);
    // A validation error thrown by a write inside the transaction also undoes the earlier writes.
    expect(() => repo.transaction((store) => {
      store.saveDraft(makeDraft());
      store.saveDraft({ ...makeDraft({ id: "draft-bad" }), author: " " });
    })).toThrow();
    expect(repo.getDraft("draft-t1")).toBeUndefined();
  }],
  ["nested transactions roll back only the inner work unless the error escapes", (repo) => {
    // Inner throw caught by the outer callback: the outer work survives.
    repo.transaction((outer) => {
      outer.saveDraft(makeDraft({ id: "draft-outer" }));
      expect(() => outer.transaction((inner) => {
        inner.saveDraft(makeDraft({ id: "draft-inner" }));
        inner.nextSequence("draft");
        throw new Error("inner boom");
      })).toThrow("inner boom");
      outer.transaction((inner) => inner.saveDraft(makeDraft({ id: "draft-inner-ok" })));
    });
    expect(repo.listDrafts().map((d) => d.id)).toEqual(["draft-outer", "draft-inner-ok"]);
    expect(repo.nextSequence("draft")).toBe(1);
    // An inner error that escapes the outer callback undoes everything, including a committed inner block.
    expect(() => repo.transaction((outer) => {
      outer.transaction((inner) => inner.saveDraft(makeDraft({ id: "draft-committed-inner" })));
      outer.transaction(() => { throw new Error("escapes"); });
    })).toThrow("escapes");
    expect(repo.getDraft("draft-committed-inner")).toBeUndefined();
    expect(repo.listDrafts()).toHaveLength(2);
  }],
  ["transaction rejects an async callback and rolls it back", (repo) => {
    expect(() => repo.transaction(async (store) => { store.saveDraft(makeDraft()); })).toThrow("synchronous");
    expect(repo.getDraft("draft-t1")).toBeUndefined();
  }],
  ["resetAppData clears app data but keeps source lines and ruleset v1", (repo) => {
    repo.saveSabad(sabad);
    repo.saveRuleset(1, rulesFixture);
    repo.saveRuleset(2, rulesFixture.slice(0, 2));
    repo.saveDraft(makeDraft());
    repo.saveFinding(makeFinding());
    repo.saveCheckRun(makeRun());
    repo.saveDecision({ id: "dec-1", finding_id: "finding-t1", draft_id: "draft-t1", draft_version: 1, ruleset_version: 1, action: "accept", reason: "Because.", reviewer: "R", at: TEST_AT });
    repo.saveReference(reference);
    repo.saveProposal(proposalFixture);
    repo.saveDriftResult(driftFixtures[0]);
    repo.savePublication({ reference, draft_id: "draft-t1", approver: "Approver", at: TEST_AT,
      gate: { draft_id: "draft-t1", draft_version: 1, ruleset_version: 1, can_publish: true, blockers: [], warning_ids: [] } }, "TEST-SABAD");
    repo.nextSequence("draft"); repo.nextSequence("draft");
    repo.resetAppData();
    expect(repo.getSabad("9001")).toEqual(sabad);
    expect(repo.getRuleset(1)).toHaveLength(rulesFixture.length);
    expect(repo.getRuleset(2)).toEqual([]);
    expect(repo.getLatestRulesetVersion()).toBe(1);
    expect(repo.listDrafts()).toEqual([]);
    expect(repo.getFinding("finding-t1")).toBeUndefined();
    expect(repo.listCheckRunsForDraft("draft-t1")).toEqual([]);
    expect(repo.listDecisionsForDraft("draft-t1")).toEqual([]);
    expect(repo.listReferences()).toEqual([]);
    expect(repo.listProposals()).toEqual([]);
    expect(repo.listDriftResultsForProposal(proposalFixture.id)).toEqual([]);
    expect(repo.listPublicationsForSabad("TEST-SABAD")).toEqual([]);
    expect(repo.nextSequence("draft")).toBe(1);
    expect(() => repo.resetAppData()).not.toThrow();
  }],
];

describe.each(backends)("repository behaviour: $name", (backend) => {
  it.each(cases)("%s", async (_name, body) => backend.run(body));
});
