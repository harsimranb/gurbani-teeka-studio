import {
  CheckRunSchema, DecisionSchema, DraftSchema, DriftResultSchema, FindingSchema, LineSchema,
  ProposalSchema, PublicationSchema, ReferenceSchema, RuleSchema, SabadSchema, VersionSchema,
  type CheckRun, type Decision, type Draft, type DriftResult, type Finding, type Line,
  type Proposal, type Publication, type Reference, type Rule, type Sabad,
} from "../../contracts/domain";
import type { Repository } from "../db/repo";

/**
 * Repository plus published records. SQLite has no `publications` table yet
 * (DATA follow-up: add one keyed by reference id with the Sabad id alongside), so only the
 * in-memory store offers these two methods for now.
 */
export type AppStore = Repository & {
  savePublication(publication: Publication): void;
  listPublicationsForSabad(shabadId: string): Publication[];
};

// Everything is stored as JSON text (like the SQLite payload columns), so callers can never
// mutate stored state and every read is re-validated against the contract schema.
const encode = (value: unknown) => JSON.stringify(value);
const decode = (value: string) => JSON.parse(value) as unknown;

/** In-memory implementation of the SQLite repository interface, with the same semantics. */
export function createMemoryRepository(): AppStore {
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
  const publicationRows = new Map<string, { shabad_id: string; payload: string }>();

  const readAll = <T>(rows: Iterable<string>, schema: { parse(value: unknown): T }, keep: (value: T) => boolean = () => true): T[] =>
    [...rows].map((payload) => schema.parse(decode(payload))).filter(keep);
  const readOne = <T>(payload: string | undefined, schema: { parse(value: unknown): T }): T | undefined =>
    payload === undefined ? undefined : schema.parse(decode(payload));
  const readLine = (id: string): Line => LineSchema.parse(decode(lineRows.get(id) as string));
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
      const lineSnapshot = new Map(lineRows);
      const idsSnapshot = new Map(sabadLineIds);
      try {
        for (const sabad of sabads) saveSabadIn(sabad);
      } catch (error) {
        lineRows.clear(); for (const [key, value] of lineSnapshot) lineRows.set(key, value);
        sabadLineIds.clear(); for (const [key, value] of idsSnapshot) sabadLineIds.set(key, value);
        throw error;
      }
    },
    getSabad(shabadId: string): Sabad | undefined {
      const ids = sabadLineIds.get(shabadId);
      if (!ids?.length) return undefined;
      return SabadSchema.parse({ shabad_id: shabadId, lines: ids.map(readLine) });
    },
    listSabads(): { shabad_id: string; ang: number; raag: string; writer: string }[] {
      return [...sabadLineIds.entries()].filter(([, ids]) => ids.length).map(([shabadId, ids]) => {
        const first = readLine(ids[0]);
        return { shabad_id: shabadId, ang: first.ang, raag: first.raag, writer: first.writer };
      });
    },
    saveDraft(raw: Draft): void {
      const draft = DraftSchema.parse(raw);
      draftRows.set(draft.id, encode(draft));
    },
    getDraft(id: string): Draft | undefined {
      return readOne(draftRows.get(id), DraftSchema);
    },
    listDraftsForSabad(shabadId: string): Draft[] {
      return readAll(draftRows.values(), DraftSchema, (draft) => draft.shabad_id === shabadId);
    },
    deleteDraft(id: string): void {
      for (const [key, payload] of findingRows) if (FindingSchema.parse(decode(payload)).draft_id === id) findingRows.delete(key);
      for (const [key, payload] of checkRunRows) if (CheckRunSchema.parse(decode(payload)).draft_id === id) checkRunRows.delete(key);
      for (const [key, payload] of decisionRows) if (DecisionSchema.parse(decode(payload)).draft_id === id) decisionRows.delete(key);
      draftRows.delete(id);
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
  };

  return {
    ...repo,
    savePublication(raw: Publication): void {
      const publication = PublicationSchema.parse(raw);
      // Keyed by the published draft's Sabad; fall back to the first covered source line.
      const draft = repo.getDraft(publication.draft_id);
      const fallbackLine = lineRows.get(publication.reference.line_ids[0]);
      const shabadId = draft?.shabad_id ?? (fallbackLine ? LineSchema.parse(decode(fallbackLine)).shabad_id : undefined);
      if (!shabadId) throw new Error(`Cannot file publication ${publication.reference.id}: its draft and source lines are unknown.`);
      publicationRows.set(publication.reference.id, { shabad_id: shabadId, payload: encode(publication) });
    },
    listPublicationsForSabad(shabadId: string): Publication[] {
      return [...publicationRows.values()].filter((row) => row.shabad_id === shabadId)
        .map((row) => PublicationSchema.parse(decode(row.payload)));
    },
  };
}
