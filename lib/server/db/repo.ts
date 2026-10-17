import { and, eq, max } from "drizzle-orm";
import {
  CheckRunSchema, DecisionSchema, DraftSchema, DriftResultSchema, FindingSchema,
  LineSchema, ProposalSchema, ReferenceSchema, RuleSchema, SabadSchema, VersionSchema,
  type CheckRun, type Decision, type Draft, type DriftResult, type Finding,
  type Proposal, type Reference, type Rule, type Sabad,
} from "../../contracts/domain";
import type { AppDb } from "./client";
import { checkRuns, decisions, drafts, driftResults, findings, lines, proposals, references, rules } from "./schema";

const encode = (value: unknown) => JSON.stringify(value);
const decode = (value: string) => JSON.parse(value) as unknown;

/** App-owned storage. Contract schemas validate both writes and reads. */
export function createRepository(db: AppDb) {
  return {
    saveSabad(raw: Sabad): void {
      const sabad = SabadSchema.parse(raw);
      db.transaction((tx) => {
        const existingIds = tx.select({ id: lines.id }).from(lines).where(eq(lines.shabadId, sabad.shabad_id)).all();
        const incomingIds = new Set(sabad.lines.map((line) => line.line_id));
        if (existingIds.length && (existingIds.length !== incomingIds.size || existingIds.some((row) => !incomingIds.has(row.id)))) {
          throw new Error(`BaniDB source line set changed for Sabad ${sabad.shabad_id}; refusing a mixed export.`);
        }
        for (const line of sabad.lines) {
          const existing = tx.select().from(lines).where(eq(lines.id, line.line_id)).get();
          const row = {
            id: line.line_id, shabadId: line.shabad_id, ang: line.ang,
            raag: line.raag, writer: line.writer, isRahao: line.is_rahao, gurmukhi: line.gurmukhi,
          };
          if (existing) {
            if (JSON.stringify(existing) !== JSON.stringify(row)) throw new Error(`BaniDB source line ${line.line_id} changed; refusing silent replacement.`);
          } else tx.insert(lines).values(row).run();
        }
      });
    },
    getSabad(shabadId: string): Sabad | undefined {
      const stored = db.select().from(lines).where(eq(lines.shabadId, shabadId)).all();
      if (!stored.length) return undefined;
      const sourceLines = stored.map((row) => LineSchema.parse({
        line_id: row.id, shabad_id: row.shabadId, ang: row.ang, raag: row.raag,
        writer: row.writer, is_rahao: row.isRahao, gurmukhi: row.gurmukhi,
      })).sort((a, b) => Number(a.line_id) - Number(b.line_id));
      return SabadSchema.parse({ shabad_id: shabadId, lines: sourceLines });
    },
    listSabads(): { shabad_id: string; ang: number; raag: string; writer: string }[] {
      const groups = new Map<string, { shabad_id: string; ang: number; raag: string; writer: string }>();
      for (const line of db.select().from(lines).all()) {
        if (!groups.has(line.shabadId)) groups.set(line.shabadId, {
          shabad_id: line.shabadId, ang: line.ang, raag: line.raag, writer: line.writer,
        });
      }
      return [...groups.values()];
    },
    saveDraft(raw: Draft): void {
      const draft = DraftSchema.parse(raw);
      const row = { id: draft.id, shabadId: draft.shabad_id, version: draft.version,
        status: draft.status, payload: encode(draft) };
      db.insert(drafts).values(row).onConflictDoUpdate({ target: drafts.id, set: row }).run();
    },
    getDraft(id: string): Draft | undefined {
      const row = db.select().from(drafts).where(eq(drafts.id, id)).get();
      return row ? DraftSchema.parse(decode(row.payload)) : undefined;
    },
    listDraftsForSabad(shabadId: string): Draft[] {
      return db.select().from(drafts).where(eq(drafts.shabadId, shabadId)).all()
        .map((row) => DraftSchema.parse(decode(row.payload)));
    },
    /** Removes the draft row and its findings, check runs and decisions (no foreign keys, so children go explicitly). */
    deleteDraft(id: string): void {
      db.transaction((tx) => {
        tx.delete(findings).where(eq(findings.draftId, id)).run();
        tx.delete(checkRuns).where(eq(checkRuns.draftId, id)).run();
        tx.delete(decisions).where(eq(decisions.draftId, id)).run();
        tx.delete(drafts).where(eq(drafts.id, id)).run();
      });
    },
    saveFinding(raw: Finding): void {
      const finding = FindingSchema.parse(raw);
      const row = { id: finding.id, draftId: finding.draft_id, draftVersion: finding.draft_version,
        rulesetVersion: finding.ruleset_version, state: finding.state, payload: encode(finding) };
      db.insert(findings).values(row).onConflictDoUpdate({ target: findings.id, set: row }).run();
    },
    getFinding(id: string): Finding | undefined {
      const row = db.select().from(findings).where(eq(findings.id, id)).get();
      return row ? FindingSchema.parse(decode(row.payload)) : undefined;
    },
    listFindingsForDraft(draftId: string): Finding[] {
      return db.select().from(findings).where(eq(findings.draftId, draftId)).all()
        .map((row) => FindingSchema.parse(decode(row.payload)));
    },
    saveCheckRun(raw: CheckRun): void {
      const run = CheckRunSchema.parse(raw);
      const row = { id: run.id, draftId: run.draft_id, draftVersion: run.draft_version,
        rulesetVersion: run.ruleset_version, phase: run.phase, status: run.status, payload: encode(run) };
      db.insert(checkRuns).values(row).onConflictDoUpdate({
        target: [checkRuns.draftId, checkRuns.draftVersion, checkRuns.rulesetVersion, checkRuns.phase], set: row,
      }).run();
    },
    getCheckRun(id: string): CheckRun | undefined {
      const row = db.select().from(checkRuns).where(eq(checkRuns.id, id)).get();
      return row ? CheckRunSchema.parse(decode(row.payload)) : undefined;
    },
    listCheckRunsForDraft(draftId: string): CheckRun[] {
      return db.select().from(checkRuns).where(eq(checkRuns.draftId, draftId)).all()
        .map((row) => CheckRunSchema.parse(decode(row.payload)));
    },
    saveDecision(raw: Decision): void {
      const decision = DecisionSchema.parse(raw);
      const row = { id: decision.id, findingId: decision.finding_id, draftId: decision.draft_id,
        payload: encode(decision) };
      db.insert(decisions).values(row).onConflictDoUpdate({ target: decisions.id, set: row }).run();
    },
    getDecision(id: string): Decision | undefined {
      const row = db.select().from(decisions).where(eq(decisions.id, id)).get();
      return row ? DecisionSchema.parse(decode(row.payload)) : undefined;
    },
    listDecisionsForDraft(draftId: string): Decision[] {
      return db.select().from(decisions).where(eq(decisions.draftId, draftId)).all()
        .map((row) => DecisionSchema.parse(decode(row.payload)));
    },
    saveRuleset(rawVersion: number, rawRules: Rule[]): void {
      const version = VersionSchema.parse(rawVersion);
      const catalog = rawRules.map((rule) => RuleSchema.parse(rule));
      if (new Set(catalog.map((rule) => rule.id)).size !== catalog.length) throw new Error("Duplicate rule IDs in ruleset.");
      db.transaction((tx) => {
        const existing = tx.select().from(rules).where(eq(rules.rulesetVersion, version)).all();
        if (existing.length) {
          const byId = new Map(existing.map((row) => [row.id, row.payload]));
          if (existing.length !== catalog.length || catalog.some((rule) => byId.get(rule.id) !== encode(rule))) {
            throw new Error(`Ruleset ${version} differs from its stored snapshot.`);
          }
          return;
        }
        if (catalog.length) tx.insert(rules).values(catalog.map((rule) => ({
          rulesetVersion: version, id: rule.id, ruleVersion: rule.version, payload: encode(rule),
        }))).run();
      });
    },
    getRuleset(version: number): Rule[] {
      return db.select().from(rules).where(eq(rules.rulesetVersion, VersionSchema.parse(version))).all()
        .map((row) => RuleSchema.parse(decode(row.payload)));
    },
    getLatestRulesetVersion(): number | undefined {
      return db.select({ version: max(rules.rulesetVersion) }).from(rules).get()?.version ?? undefined;
    },
    saveProposal(raw: Proposal): void {
      const proposal = ProposalSchema.parse(raw);
      db.insert(proposals).values({ id: proposal.id, payload: encode(proposal) })
        .onConflictDoUpdate({ target: proposals.id, set: { payload: encode(proposal) } }).run();
    },
    getProposal(id: string): Proposal | undefined {
      const row = db.select().from(proposals).where(eq(proposals.id, id)).get();
      return row ? ProposalSchema.parse(decode(row.payload)) : undefined;
    },
    listProposals(): Proposal[] {
      return db.select().from(proposals).all().map((row) => ProposalSchema.parse(decode(row.payload)));
    },
    saveDriftResult(raw: DriftResult): void {
      const result = DriftResultSchema.parse(raw);
      const row = { id: result.id, proposalId: result.proposal_id, payload: encode(result) };
      db.insert(driftResults).values(row).onConflictDoUpdate({ target: driftResults.id, set: row }).run();
    },
    getDriftResult(id: string): DriftResult | undefined {
      const row = db.select().from(driftResults).where(eq(driftResults.id, id)).get();
      return row ? DriftResultSchema.parse(decode(row.payload)) : undefined;
    },
    listDriftResultsForProposal(proposalId: string): DriftResult[] {
      return db.select().from(driftResults).where(eq(driftResults.proposalId, proposalId)).all()
        .map((row) => DriftResultSchema.parse(decode(row.payload)));
    },
    saveReference(raw: Reference): void {
      const reference = ReferenceSchema.parse(raw);
      const row = { id: reference.id, source: reference.source, payload: encode(reference) };
      db.insert(references).values(row).onConflictDoUpdate({ target: references.id, set: row }).run();
    },
    getReference(id: string): Reference | undefined {
      const row = db.select().from(references).where(eq(references.id, id)).get();
      return row ? ReferenceSchema.parse(decode(row.payload)) : undefined;
    },
    listReferences(): Reference[] {
      return db.select().from(references).all().map((row) => ReferenceSchema.parse(decode(row.payload)));
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;
