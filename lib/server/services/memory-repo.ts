import {
  CheckRunSchema, DecisionSchema, DraftSchema, DriftResultSchema, FindingSchema, LineSchema,
  ProposalSchema, PublicationSchema, ReferenceSchema, RuleSchema, SabadSchema, VersionSchema,
  type CheckRun, type Decision, type Draft, type DriftResult, type Finding, type Line,
  type Proposal, type Publication, type Reference, type Rule, type Sabad,
} from "../../contracts/domain";
import { assertSyncTransactionResult, castInteger, compareShabadIds, type BrowseFilters, type BrowseRow, type Repository, type SabadSummary } from "../db/repo";

/** The store type the services use: just the repository (it owns publications, sequences and transactions). */
export type AppStore = Repository;

// Everything is stored as JSON text (like the SQLite payload columns), so callers can never
// mutate stored state and every read is re-validated against the contract schema.
const encode = (value: unknown) => JSON.stringify(value);
const decode = (value: string) => JSON.parse(value) as unknown;

/** In-memory implementation of the SQLite repository interface, with the same semantics. */
export function createMemoryRepository(): Repository {
  const lineRows = new Map<string, string>();            // line_id -> Line JSON
  const sabadLineIds = new Map<string, string[]>();      // shabad_id -> line IDs in source order
  const draftRows = new Map<string, string>();
  const findingRows = new Map<string, string>();
  const checkRunRows = new Map<string, string>();
  const decisionRows = new Map<string, string>();
  const rulesetRows = new Map<number, Map<string, string>>(); // version -> rule id -> Rule JSON
  const proposalRows = new Map<string, string>();
  const driftRows = new Map<string, string>();
  const referenceRows = new Map<string, string>();
  const publicationRows = new Map<string, { shabad_id: string; at: string; payload: string }>();
  const sequenceRows = new Map<string, number>();

  // Transactions snapshot every table and restore on throw (nested calls snapshot again, like a SAVEPOINT).
  // Row values are immutable strings/objects that are replaced, never mutated, so shallow map copies suffice.
  const snapshot = () => ({
    lines: new Map(lineRows), sabadIds: new Map(sabadLineIds), drafts: new Map(draftRows), findings: new Map(findingRows),
    checkRuns: new Map(checkRunRows), decisions: new Map(decisionRows),
    rulesets: new Map([...rulesetRows].map(([version, rows]) => [version, new Map(rows)] as const)),
    proposals: new Map(proposalRows), drift: new Map(driftRows), references: new Map(referenceRows),
    publications: new Map(publicationRows), sequences: new Map(sequenceRows),
  });
  const restore = (snap: ReturnType<typeof snapshot>) => {
    const replace = <K, V>(target: Map<K, V>, source: Map<K, V>) => { target.clear(); for (const [key, value] of source) target.set(key, value); };
    replace(lineRows, snap.lines); replace(sabadLineIds, snap.sabadIds); replace(draftRows, snap.drafts);
    replace(findingRows, snap.findings); replace(checkRunRows, snap.checkRuns); replace(decisionRows, snap.decisions);
    replace(rulesetRows, snap.rulesets); replace(proposalRows, snap.proposals); replace(driftRows, snap.drift);
    replace(referenceRows, snap.references); replace(publicationRows, snap.publications); replace(sequenceRows, snap.sequences);
  };

  const readAll = <T>(rows: Iterable<string>, schema: { parse(value: unknown): T }, keep: (value: T) => boolean = () => true): T[] =>
    [...rows].map((payload) => schema.parse(decode(payload))).filter(keep);
  const readOne = <T>(payload: string | undefined, schema: { parse(value: unknown): T }): T | undefined =>
    payload === undefined ? undefined : schema.parse(decode(payload));
  const readLine = (id: string): Line => LineSchema.parse(decode(lineRows.get(id) as string));
  // Numeric line ID order; the sort is stable, so ties keep first-save order (SQLite: rowid).
  const sortedLines = (ids: string[]): Line[] => ids.map(readLine).sort((a, b) => castInteger(a.line_id) - castInteger(b.line_id));
  const checkRunKey = (run: CheckRun) => `${run.draft_id}\u0000${run.draft_version}\u0000${run.ruleset_version}\u0000${run.phase}`;

  // Checks first, then writes, so a refused Sabad leaves nothing behind.
  function saveSabadIn(sabad: Sabad): void {
    const existingIds = sabadLineIds.get(sabad.shabad_id) ?? [];
    const incomingIds = new Set(sabad.lines.map((line) => line.line_id));
    if (existingIds.length && (existingIds.length !== incomingIds.size || existingIds.some((id) => !incomingIds.has(id)))) {
      throw new Error(`BaniDB source line set changed for Sabad ${sabad.shabad_id}; refusing a mixed export.`);
    }
    for (const line of sabad.lines) {
      const existing = lineRows.get(line.line_id);
      if (existing !== undefined && existing !== encode(line)) throw new Error(`BaniDB source line ${line.line_id} changed; refusing silent replacement.`);
    }
    for (const line of sabad.lines) lineRows.set(line.line_id, encode(line));
    sabadLineIds.set(sabad.shabad_id, sabad.lines.map((line) => line.line_id));
  }

  const repo: Repository = {
    saveSabad(raw: Sabad): void {
      saveSabadIn(SabadSchema.parse(raw));
    },
    /** All-or-nothing bulk load; each Sabad keeps the same refuse-silent-replacement checks as saveSabad. */
    saveSabads(raws: Sabad[]): void {
      const sabads = raws.map((raw) => SabadSchema.parse(raw));
      repo.transaction(() => { for (const sabad of sabads) saveSabadIn(sabad); });
    },
    getSabad(shabadId: string): Sabad | undefined {
      const ids = sabadLineIds.get(shabadId);
      if (!ids?.length) return undefined;
      return SabadSchema.parse({ shabad_id: shabadId, lines: sortedLines(ids) });
    },
    listSabads(): SabadSummary[] {
      return [...sabadLineIds.keys()].filter((shabadId) => sabadLineIds.get(shabadId)?.length).sort(compareShabadIds)
        .map((shabadId) => repo.getSabadSummary(shabadId) as SabadSummary);
    },
    getSabadSummary(shabadId: string): SabadSummary | undefined {
      const ids = sabadLineIds.get(shabadId);
      if (!ids?.length) return undefined;
      const first = sortedLines(ids)[0];
      return { shabad_id: shabadId, ang: first.ang, raag: first.raag, writer: first.writer };
    },
    browseSabads(filters: BrowseFilters): { total: number; rows: BrowseRow[] } {
      const every = (line: Line) => (filters.ang === undefined || line.ang === filters.ang)
        && (filters.raag === undefined || line.raag === filters.raag) && (filters.writer === undefined || line.writer === filters.writer);
      const sabads = [...sabadLineIds.entries()].filter(([, ids]) => ids.length > 0).map(([shabadId, ids]) => ({ shabadId, lines: sortedLines(ids) }))
        .filter(({ lines }) => lines.some(every));
      const order = sabads.map(({ shabadId, lines }) => ({ shabadId, lines, firstAng: Math.min(...lines.map((line) => line.ang)), firstId: Math.min(...lines.map((line) => castInteger(line.line_id))) }))
        .sort((a, b) => a.firstAng - b.firstAng || a.firstId - b.firstId || (a.shabadId < b.shabadId ? -1 : a.shabadId > b.shabadId ? 1 : 0));
      const rows = order.slice(filters.offset, filters.offset + filters.limit).map(({ shabadId, lines, firstAng }) => ({
        shabad_id: shabadId, ang: firstAng, last_ang: Math.max(...lines.map((line) => line.ang)), raag: lines[0].raag, writer: lines[0].writer,
        line_count: lines.length, first_line_gurmukhi: lines[0].gurmukhi,
      }));
      return { total: order.length, rows };
    },
    listSourceFacets(): { raags: string[]; writers: string[] } {
      const lines = [...lineRows.keys()].map(readLine);
      const distinct = (values: string[]) => [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      return { raags: distinct(lines.map((line) => line.raag)), writers: distinct(lines.map((line) => line.writer)) };
    },
    findLinesContaining(fragment: string) {
      if (!fragment) return [];
      return [...lineRows.keys()].map(readLine).filter((line) => line.gurmukhi.includes(fragment))
        .sort((a, b) => a.ang - b.ang || castInteger(a.line_id) - castInteger(b.line_id))
        .map((line) => ({ line_id: line.line_id, shabad_id: line.shabad_id, ang: line.ang, gurmukhi: line.gurmukhi }));
    },
    getLine(lineId: string) {
      const stored = lineRows.get(lineId);
      if (stored === undefined) return undefined;
      const line = LineSchema.parse(decode(stored));
      return { line_id: line.line_id, shabad_id: line.shabad_id, ang: line.ang, gurmukhi: line.gurmukhi };
    },
    hasSourceLines(): boolean {
      return lineRows.size > 0;
    },
    saveDraft(raw: Draft): void {
      const draft = DraftSchema.parse(raw);
      draftRows.set(draft.id, encode(draft));
    },
    getDraft(id: string): Draft | undefined {
      return readOne(draftRows.get(id), DraftSchema);
    },
    listDrafts(): Draft[] {
      return readAll(draftRows.values(), DraftSchema);
    },
    listDraftsForSabad(shabadId: string): Draft[] {
      return readAll(draftRows.values(), DraftSchema, (draft) => draft.shabad_id === shabadId);
    },
    deleteDraft(id: string): void {
      repo.transaction(() => {
        for (const [key, payload] of findingRows) if (FindingSchema.parse(decode(payload)).draft_id === id) findingRows.delete(key);
        for (const [key, payload] of checkRunRows) if (CheckRunSchema.parse(decode(payload)).draft_id === id) checkRunRows.delete(key);
        for (const [key, payload] of decisionRows) if (DecisionSchema.parse(decode(payload)).draft_id === id) decisionRows.delete(key);
        draftRows.delete(id);
      });
    },
    saveFinding(raw: Finding): void {
      const finding = FindingSchema.parse(raw);
      findingRows.set(finding.id, encode(finding));
    },
    getFinding(id: string): Finding | undefined {
      return readOne(findingRows.get(id), FindingSchema);
    },
    listFindingsForDraft(draftId: string): Finding[] {
      return readAll(findingRows.values(), FindingSchema, (finding) => finding.draft_id === draftId);
    },
    saveCheckRun(raw: CheckRun): void {
      const run = CheckRunSchema.parse(raw);
      // Upsert on (draft_id, draft_version, ruleset_version, phase), like the SQLite unique index.
      const key = checkRunKey(run);
      const sameKey = [...checkRunRows.entries()].find(([, payload]) => checkRunKey(CheckRunSchema.parse(decode(payload))) === key);
      if (!sameKey && checkRunRows.has(run.id)) throw new Error(`Check run ID ${run.id} already belongs to a different draft/version/phase.`);
      if (sameKey && sameKey[0] !== run.id) {
        if (checkRunRows.has(run.id)) throw new Error(`Check run ID ${run.id} already belongs to a different draft/version/phase.`);
        checkRunRows.delete(sameKey[0]);
      }
      checkRunRows.set(run.id, encode(run));
    },
    getCheckRun(id: string): CheckRun | undefined {
      return readOne(checkRunRows.get(id), CheckRunSchema);
    },
    listCheckRunsForDraft(draftId: string): CheckRun[] {
      return readAll(checkRunRows.values(), CheckRunSchema, (run) => run.draft_id === draftId);
    },
    saveDecision(raw: Decision): void {
      const decision = DecisionSchema.parse(raw);
      decisionRows.set(decision.id, encode(decision));
    },
    getDecision(id: string): Decision | undefined {
      return readOne(decisionRows.get(id), DecisionSchema);
    },
    listDecisionsForDraft(draftId: string): Decision[] {
      return readAll(decisionRows.values(), DecisionSchema, (decision) => decision.draft_id === draftId);
    },
    saveRuleset(rawVersion: number, rawRules: Rule[]): void {
      const version = VersionSchema.parse(rawVersion);
      const catalog = rawRules.map((rule) => RuleSchema.parse(rule));
      if (new Set(catalog.map((rule) => rule.id)).size !== catalog.length) throw new Error("Duplicate rule IDs in ruleset.");
      const existing = rulesetRows.get(version);
      if (existing?.size) {
        if (existing.size !== catalog.length || catalog.some((rule) => existing.get(rule.id) !== encode(rule))) {
          throw new Error(`Ruleset ${version} differs from its stored snapshot.`);
        }
        return;
      }
      if (catalog.length) rulesetRows.set(version, new Map(catalog.map((rule) => [rule.id, encode(rule)])));
    },
    getRuleset(version: number): Rule[] {
      return readAll(rulesetRows.get(VersionSchema.parse(version))?.values() ?? [], RuleSchema);
    },
    getLatestRulesetVersion(): number | undefined {
      const versions = [...rulesetRows.keys()];
      return versions.length ? Math.max(...versions) : undefined;
    },
    saveProposal(raw: Proposal): void {
      const proposal = ProposalSchema.parse(raw);
      proposalRows.set(proposal.id, encode(proposal));
    },
    getProposal(id: string): Proposal | undefined {
      return readOne(proposalRows.get(id), ProposalSchema);
    },
    listProposals(): Proposal[] {
      return readAll(proposalRows.values(), ProposalSchema);
    },
    saveDriftResult(raw: DriftResult): void {
      const result = DriftResultSchema.parse(raw);
      driftRows.set(result.id, encode(result));
    },
    getDriftResult(id: string): DriftResult | undefined {
      return readOne(driftRows.get(id), DriftResultSchema);
    },
    listDriftResultsForProposal(proposalId: string): DriftResult[] {
      return readAll(driftRows.values(), DriftResultSchema, (result) => result.proposal_id === proposalId);
    },
    saveReference(raw: Reference): void {
      const reference = ReferenceSchema.parse(raw);
      referenceRows.set(reference.id, encode(reference));
    },
    getReference(id: string): Reference | undefined {
      return readOne(referenceRows.get(id), ReferenceSchema);
    },
    listReferences(): Reference[] {
      return readAll(referenceRows.values(), ReferenceSchema);
    },
    savePublication(raw: Publication, shabadId?: string): void {
      const publication = PublicationSchema.parse(raw);
      const fallbackLine = lineRows.get(publication.reference.line_ids[0]);
      const resolved = shabadId ?? repo.getDraft(publication.draft_id)?.shabad_id
        ?? (fallbackLine ? LineSchema.parse(decode(fallbackLine)).shabad_id : undefined);
      if (!resolved) throw new Error(`Cannot file publication ${publication.reference.id}: its draft and source lines are unknown.`);
      publicationRows.set(publication.reference.id, { shabad_id: resolved, at: publication.at, payload: encode(publication) });
    },
    listPublicationsForSabad(shabadId: string): Publication[] {
      return [...publicationRows.entries()].filter(([, row]) => row.shabad_id === shabadId)
        .sort(([idA, a], [idB, b]) => (a.at < b.at ? -1 : a.at > b.at ? 1 : idA < idB ? -1 : idA > idB ? 1 : 0))
        .map(([, row]) => PublicationSchema.parse(decode(row.payload)));
    },
    nextSequence(kind: string): number {
      if (typeof kind !== "string" || !kind.trim()) throw new Error("Sequence kind must be a non-blank string.");
      const value = (sequenceRows.get(kind) ?? 0) + 1;
      sequenceRows.set(kind, value);
      return value;
    },
    transaction<T>(fn: (store: Repository) => T): T {
      const snap = snapshot();
      try {
        const result = fn(repo);
        assertSyncTransactionResult(result);
        return result;
      } catch (error) {
        restore(snap);
        throw error;
      }
    },
    resetAppData(): void {
      repo.transaction(() => {
        for (const rows of [findingRows, checkRunRows, decisionRows, draftRows, referenceRows, publicationRows, proposalRows, driftRows, sequenceRows]) rows.clear();
        for (const version of [...rulesetRows.keys()]) if (version > 1) rulesetRows.delete(version);
      });
    },
  };

  return repo;
}
