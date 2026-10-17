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
];

describe.each(backends)("repository behaviour: $name", (backend) => {
  it.each(cases)("%s", async (_name, body) => backend.run(body));
});

describe("memory repository publications", () => {
  const gate = { draft_id: "draft-t1", draft_version: 1, ruleset_version: 1, can_publish: true, blockers: [], warning_ids: [] };
  const publication = (id: string, draftId: string): Publication => ({
    reference: { ...reference, id }, draft_id: draftId, approver: "Approver", at: TEST_AT, gate: { ...gate, draft_id: draftId },
  });

  it("files publications by the draft's Sabad and returns independent copies", () => {
    const repo = createMemoryRepository();
    repo.saveDraft(makeDraft());
    repo.saveDraft(makeDraft({ id: "draft-b", shabad_id: "OTHER" }));
    repo.savePublication(publication("PUB-0001", "draft-t1"));
    repo.savePublication(publication("PUB-0002", "draft-b"));
    repo.savePublication(publication("PUB-0001", "draft-t1"));
    expect(repo.listPublicationsForSabad("TEST-SABAD").map((p) => p.reference.id)).toEqual(["PUB-0001"]);
    expect(repo.listPublicationsForSabad("OTHER").map((p) => p.reference.id)).toEqual(["PUB-0002"]);
    expect(repo.listPublicationsForSabad("none")).toEqual([]);
    repo.listPublicationsForSabad("TEST-SABAD")[0].approver = "MUTATED";
    expect(repo.listPublicationsForSabad("TEST-SABAD")[0].approver).toBe("Approver");
  });
  it("validates publications and keeps them when their draft is deleted", () => {
    const repo = createMemoryRepository();
    repo.saveDraft(makeDraft());
    expect(() => repo.savePublication({ ...publication("PUB-0001", "draft-t1"), approver: " " })).toThrow();
    expect(() => repo.savePublication(publication("PUB-0009", "unknown-draft"))).toThrow("unknown");
    repo.savePublication(publication("PUB-0001", "draft-t1"));
    repo.deleteDraft("draft-t1");
    expect(repo.listPublicationsForSabad("TEST-SABAD")).toHaveLength(1);
  });
});
