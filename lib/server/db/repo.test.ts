import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CheckRunSchema, DecisionSchema, ReferenceSchema, SabadSchema } from "../../contracts/domain";
import { checkResultFixture, draftFixture, driftFixtures, mockResponses, proposalFixture, rulesFixture } from "../../contracts/fixtures";
import { migrateAppDb, openAppDb, type AppDb } from "./client";

async function withTempDb(run: (db: AppDb) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "eko-repo-test-"));
  const { db, sqlite } = openAppDb(join(dir, "app.sqlite"));
  try {
    migrateAppDb(db);
    await run(db);
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("app repository", () => {
  it("round-trips grouped drafts, versioned findings, check runs and reasoned decisions", async () => withTempDb(async (db) => {
    const { createRepository } = await import("./repo");
    const repo = createRepository(db);
    const finding = checkResultFixture.findings[0];
    const run = CheckRunSchema.parse((mockResponses.runCodeChecks as { check_runs: unknown[] }).check_runs[0]);
    const decision = DecisionSchema.parse((mockResponses.decide as { decision: unknown }).decision);

    repo.saveDraft(draftFixture);
    repo.saveFinding(finding);
    repo.saveCheckRun(run);
    repo.saveDecision(decision);
    expect(repo.getDraft(draftFixture.id)).toEqual(draftFixture);
    expect(repo.getDraft(draftFixture.id)?.line_ids).toEqual(["synthetic-line-1", "synthetic-line-2"]);
    expect(repo.getFinding(finding.id)).toEqual(finding);
    expect(repo.getCheckRun(run.id)).toEqual(run);
    expect(repo.getDecision(decision.id)).toEqual(decision);
    expect(repo.listFindingsForDraft(draftFixture.id)).toEqual([finding]);
    expect(repo.listCheckRunsForDraft(draftFixture.id)).toEqual([run]);
    expect(repo.listDecisionsForDraft(draftFixture.id)).toEqual([decision]);
    expect(() => repo.saveDecision({ ...decision, id: "bad-decision", reason: " " })).toThrow();
    expect(repo.getDecision("bad-decision")).toBeUndefined();
  }));

  it("keeps rule snapshots, references, proposals and drift evidence across writes", async () => withTempDb(async (db) => {
    const { createRepository } = await import("./repo");
    const repo = createRepository(db);
    const reference = ReferenceSchema.parse({
      id: "synthetic-reference-1", line_ids: ["synthetic-line-1"],
      english: "SYNTHETIC REFERENCE MARKER", source: "published",
      exceptions: [{ rule_id: "LAYER-07", decision_id: "synthetic-decision-1", action: "waive",
        reason: "Synthetic test exception", reviewer: "Synthetic reviewer", at: draftFixture.updated_at }],
    });
    repo.saveRuleset(1, rulesFixture);
    repo.saveRuleset(1, rulesFixture);
    repo.saveRuleset(2, rulesFixture);
    repo.saveReference(reference);
    repo.saveProposal(proposalFixture);
    repo.saveDriftResult(driftFixtures[0]);

    expect(repo.getRuleset(1)).toHaveLength(66);
    expect(repo.getRuleset(2).find((rule) => rule.id === rulesFixture[0].id)).toEqual(rulesFixture[0]);
    expect(repo.getLatestRulesetVersion()).toBe(2);
    expect(repo.getReference(reference.id)).toEqual(reference);
    expect(repo.listReferences()).toEqual([reference]);
    expect(repo.getProposal(proposalFixture.id)).toEqual(proposalFixture);
    expect(repo.getDriftResult(driftFixtures[0].id)).toEqual(driftFixtures[0]);
    expect(repo.listDriftResultsForProposal(proposalFixture.id)).toEqual([driftFixtures[0]]);
  }));

  it("bulk-saves Sabads all-or-nothing and idempotently", async () => withTempDb(async (db) => {
    const { createRepository } = await import("./repo");
    const repo = createRepository(db);
    const sabad = (id: string, text: string) => SabadSchema.parse({ shabad_id: id, lines: [{
      line_id: `${id}01`, shabad_id: id, ang: 1, raag: "Synthetic raag", writer: "Synthetic writer", is_rahao: false, gurmukhi: text }] });
    repo.saveSabads([sabad("1", "SYNTHETIC ONE"), sabad("2", "SYNTHETIC TWO")]);
    repo.saveSabads([sabad("1", "SYNTHETIC ONE"), sabad("2", "SYNTHETIC TWO")]);
    expect(repo.listSabads().map((entry) => entry.shabad_id)).toEqual(["1", "2"]);
    expect(() => repo.saveSabads([sabad("3", "SYNTHETIC THREE"), sabad("2", "SYNTHETIC CHANGED")])).toThrow("silent replacement");
    expect(repo.getSabad("3")).toBeUndefined();
  }));

  let privateSabad: ReturnType<typeof SabadSchema.parse> | undefined;
  try {
    privateSabad = SabadSchema.parse(JSON.parse(readFileSync(new URL("../../contracts/fixtures/sabad.demo.json", import.meta.url), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  (privateSabad ? it : it.skip)("round-trips BaniDB source lines without changing text or duplicating IDs", async () => withTempDb(async (db) => {
    const { createRepository } = await import("./repo");
    const repo = createRepository(db);
    repo.saveSabad(privateSabad!);
    repo.saveSabad(privateSabad!);
    expect(repo.getSabad(privateSabad!.shabad_id)).toEqual(privateSabad);
    expect(() => repo.saveSabad({ ...privateSabad!, lines: privateSabad!.lines.slice(0, -1) })).toThrow("source line set");
    expect(repo.getSabad(privateSabad!.shabad_id)).toEqual(privateSabad);
    expect(repo.listSabads()).toEqual([{ shabad_id: privateSabad!.shabad_id,
      ang: privateSabad!.lines[0].ang, raag: privateSabad!.lines[0].raag, writer: privateSabad!.lines[0].writer }]);
  }));
});
