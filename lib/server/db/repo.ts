import { asc, eq, gt, max, sql } from "drizzle-orm";
import {
  CheckRunSchema, DecisionSchema, DraftSchema, DriftResultSchema, FindingSchema,
  LineSchema, ProposalSchema, PublicationSchema, ReferenceSchema, RuleSchema, SabadSchema, VersionSchema,
  type CheckRun, type Decision, type Draft, type DriftResult, type Finding,
  type Proposal, type Publication, type Reference, type Rule, type Sabad,
} from "../../contracts/domain";
import type { AppDb } from "./client";
import {
  checkRuns, decisions, drafts, driftResults, findings, lines, proposals, publications, references, rules, sequences,
} from "./schema";

const encode = (value: unknown) => JSON.stringify(value);
const decode = (value: string) => JSON.parse(value) as unknown;

type Tx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];
/** The database itself or an open transaction/savepoint; both expose the same query and `transaction` API. */
type Exec = AppDb | Tx;

export type SabadSummary = { shabad_id: string; ang: number; raag: string; writer: string };

/** SQLite `CAST(text AS INTEGER)` (leading integer prefix, else 0); the memory double uses it to order like SQLite. */
export function castInteger(value: string): number {
  const match = /^\s*[+-]?\d+/.exec(value);
  return match ? Number(match[0]) : 0;
}

/** Order of Sabads in `listSabads`: numeric ID, then string compare. Shared with the memory double. */
export function compareShabadIds(a: string, b: string): number {
  return castInteger(a) - castInteger(b) || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * App-owned storage. The SQLite implementation (`createRepository`) and the in-memory test double
 * (`createMemoryRepository`) both implement this interface with the same semantics.
 */
export interface Repository {
  saveSabad(raw: Sabad): void;
  /** All-or-nothing bulk load; each Sabad keeps the same refuse-silent-replacement checks as saveSabad. */
  saveSabads(raws: Sabad[]): void;
  /** Source lines ordered by numeric line ID (SQLite `CAST(id AS INTEGER)`; ties, e.g. non-numeric IDs, keep first-save order). */
  getSabad(shabadId: string): Sabad | undefined;
  /**
   * One summary per Sabad, taken from its first line (lowest numeric line ID, ties in first-save order), without
   * reading Gurmukhi. Ordered by numeric `shabad_id`, then by string compare (non-numeric IDs cast to 0 and so
   * sort first, alphabetically). Compared by UTF-16 order in memory and bytewise in SQLite: identical for ASCII IDs.
   */
  listSabads(): SabadSummary[];
  /** Summary of one Sabad's first line (same rule as `listSabads`), or undefined if it has no source lines. Indexed. */
  getSabadSummary(shabadId: string): SabadSummary | undefined;
  /** True when at least one source line is stored. */
  hasSourceLines(): boolean;
  saveDraft(raw: Draft): void;
  getDraft(id: string): Draft | undefined;
  /** Every draft, in insertion order (order of first save; re-saving an ID keeps its place). */
  listDrafts(): Draft[];
  listDraftsForSabad(shabadId: string): Draft[];
  /** Removes the draft with its findings, check runs and decisions (all-or-nothing). Publications are kept. */
  deleteDraft(id: string): void;
  saveFinding(raw: Finding): void;
  getFinding(id: string): Finding | undefined;
  listFindingsForDraft(draftId: string): Finding[];
  saveCheckRun(raw: CheckRun): void;
  getCheckRun(id: string): CheckRun | undefined;
  listCheckRunsForDraft(draftId: string): CheckRun[];
  saveDecision(raw: Decision): void;
  getDecision(id: string): Decision | undefined;
  listDecisionsForDraft(draftId: string): Decision[];
  saveRuleset(rawVersion: number, rawRules: Rule[]): void;
  getRuleset(version: number): Rule[];
  getLatestRulesetVersion(): number | undefined;
  saveProposal(raw: Proposal): void;
  getProposal(id: string): Proposal | undefined;
  listProposals(): Proposal[];
  saveDriftResult(raw: DriftResult): void;
  getDriftResult(id: string): DriftResult | undefined;
  listDriftResultsForProposal(proposalId: string): DriftResult[];
  saveReference(raw: Reference): void;
  getReference(id: string): Reference | undefined;
  listReferences(): Reference[];
  /**
   * Files a publication (upsert by `reference.id`) under a Sabad. Pass `shabadId` explicitly; when omitted it
   * is taken from the published draft's Sabad, else from the first covered source line, and the call throws
   * if neither is known. Publications survive `deleteDraft`.
   */
  savePublication(raw: Publication, shabadId?: string): void;
  /** Oldest first by `at`, then `reference.id`. */
  listPublicationsForSabad(shabadId: string): Publication[];
  /**
   * Atomic persistent counter: the first call for a `kind` returns 1, then 2, 3, ... independently per kind.
   * Inside `transaction` the increment commits or rolls back with it (a rolled-back number is handed out again).
   */
  nextSequence(kind: string): number;
  /**
   * Runs `fn` atomically against a repository bound to the transaction: commits when `fn` returns, rolls back
   * every write and rethrows when `fn` throws. `fn` must be synchronous; a returned promise is rejected (and
   * rolled back) because the transaction would end before the promise settled, so do async work first.
   * Nested calls (on the repository passed to `fn`) use a SAVEPOINT: an inner throw undoes only the inner
   * work and the outer function may catch it and carry on; an outer throw still undoes everything.
   */
  transaction<T>(fn: (store: Repository) => T): T;
  /**
   * Dev reset: deletes drafts, findings, check runs, decisions, references, publications, proposals, drift
   * results, rulesets above version 1, and sequences. Keeps source lines and ruleset v1. Atomic.
   */
  resetAppData(): void;
}

/** Shared by both backends so a misused async callback fails identically everywhere. */
export function assertSyncTransactionResult(result: unknown): void {
  if (typeof (result as { then?: unknown } | null | undefined)?.then === "function") {
    throw new Error("Repository.transaction callbacks must be synchronous; do async work before the transaction.");
  }
}

function saveSabadIn(tx: Exec, sabad: Sabad): void {
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
}

/** App-owned storage on SQLite. Contract schemas validate both writes and reads. */
export function createRepository(db: AppDb): Repository {
  return buildRepository(db);
}

function buildRepository(db: Exec): Repository {
  const repo: Repository = {
    saveSabad(raw: Sabad): void {
      const sabad = SabadSchema.parse(raw);
      db.transaction((tx) => saveSabadIn(tx, sabad));
    },
    saveSabads(raws: Sabad[]): void {
      const sabads = raws.map((raw) => SabadSchema.parse(raw));
      db.transaction((tx) => { for (const sabad of sabads) saveSabadIn(tx, sabad); });
    },
    getSabad(shabadId: string): Sabad | undefined {
      const stored = db.select().from(lines).where(eq(lines.shabadId, shabadId))
        .orderBy(sql`CAST(${lines.id} AS INTEGER)`, sql`rowid`).all();
      if (!stored.length) return undefined;
      const sourceLines = stored.map((row) => LineSchema.parse({
        line_id: row.id, shabad_id: row.shabadId, ang: row.ang, raag: row.raag,
        writer: row.writer, is_rahao: row.isRahao, gurmukhi: row.gurmukhi,
      }));
      return SabadSchema.parse({ shabad_id: shabadId, lines: sourceLines });
    },
    listSabads(): SabadSummary[] {
      // Only the summary columns are read (no Gurmukhi): one pass, first line per Sabad by numeric line ID.
      const rows = db.all<SabadSummary>(sql`
        SELECT shabad_id, ang, raag, writer FROM (
          SELECT shabad_id, ang, raag, writer,
            ROW_NUMBER() OVER (PARTITION BY shabad_id ORDER BY CAST(id AS INTEGER), rowid) AS rn
          FROM lines
        ) WHERE rn = 1
        ORDER BY CAST(shabad_id AS INTEGER), shabad_id`);
      return rows.map(({ shabad_id, ang, raag, writer }) => ({ shabad_id, ang, raag, writer }));
    },
    getSabadSummary(shabadId: string): SabadSummary | undefined {
      const row = db.select({ ang: lines.ang, raag: lines.raag, writer: lines.writer }).from(lines)
        .where(eq(lines.shabadId, shabadId)).orderBy(sql`CAST(${lines.id} AS INTEGER)`, sql`rowid`).limit(1).get();
      return row ? { shabad_id: shabadId, ang: row.ang, raag: row.raag, writer: row.writer } : undefined;
    },
    hasSourceLines(): boolean {
      return db.select({ id: lines.id }).from(lines).limit(1).get() !== undefined;
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
    listDrafts(): Draft[] {
      // rowid is assigned on first insert and kept by the upsert, so this is first-save order.
      return db.select().from(drafts).orderBy(asc(sql`rowid`)).all()
        .map((row) => DraftSchema.parse(decode(row.payload)));
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
    savePublication(raw: Publication, shabadId?: string): void {
      const publication = PublicationSchema.parse(raw);
      const resolved = shabadId ?? repo.getDraft(publication.draft_id)?.shabad_id
        ?? db.select({ shabadId: lines.shabadId }).from(lines).where(eq(lines.id, publication.reference.line_ids[0])).get()?.shabadId;
      if (!resolved) throw new Error(`Cannot file publication ${publication.reference.id}: its draft and source lines are unknown.`);
      const row = { referenceId: publication.reference.id, shabadId: resolved, draftId: publication.draft_id,
        at: publication.at, payload: encode(publication) };
      db.insert(publications).values(row).onConflictDoUpdate({ target: publications.referenceId, set: row }).run();
    },
    listPublicationsForSabad(shabadId: string): Publication[] {
      return db.select().from(publications).where(eq(publications.shabadId, shabadId))
        .orderBy(asc(publications.at), asc(publications.referenceId)).all()
        .map((row) => PublicationSchema.parse(decode(row.payload)));
    },
    nextSequence(kind: string): number {
      if (typeof kind !== "string" || !kind.trim()) throw new Error("Sequence kind must be a non-blank string.");
      const row = db.insert(sequences).values({ kind, value: 1 })
        .onConflictDoUpdate({ target: sequences.kind, set: { value: sql`${sequences.value} + 1` } })
        .returning({ value: sequences.value }).get();
      return row.value;
    },
    transaction<T>(fn: (store: Repository) => T): T {
      // Top level: BEGIN/COMMIT. Already inside a transaction: drizzle issues SAVEPOINT / RELEASE / ROLLBACK TO.
      return db.transaction((tx) => {
        const result = fn(buildRepository(tx));
        assertSyncTransactionResult(result);
        return result;
      });
    },
    resetAppData(): void {
      db.transaction((tx) => {
        tx.delete(findings).run();
        tx.delete(checkRuns).run();
        tx.delete(decisions).run();
        tx.delete(drafts).run();
        tx.delete(references).run();
        tx.delete(publications).run();
        tx.delete(proposals).run();
        tx.delete(driftResults).run();
        tx.delete(rules).where(gt(rules.rulesetVersion, 1)).run();
        tx.delete(sequences).run();
      });
    },
  };
  return repo;
}
