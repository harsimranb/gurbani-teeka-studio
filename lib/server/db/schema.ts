import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const lines = sqliteTable("lines", {
  id: text("id").primaryKey(),
  shabadId: text("shabad_id").notNull(),
  ang: integer("ang").notNull(),
  raag: text("raag").notNull(),
  writer: text("writer").notNull(),
  isRahao: integer("is_rahao", { mode: "boolean" }).notNull(),
  gurmukhi: text("gurmukhi").notNull(),
}, (table) => [index("lines_shabad_idx").on(table.shabadId)]);

export const drafts = sqliteTable("drafts", {
  id: text("id").primaryKey(),
  shabadId: text("shabad_id").notNull(),
  version: integer("version").notNull(),
  status: text("status").notNull(),
  payload: text("payload").notNull(),
}, (table) => [index("drafts_shabad_idx").on(table.shabadId)]);

export const findings = sqliteTable("findings", {
  id: text("id").primaryKey(),
  draftId: text("draft_id").notNull(),
  draftVersion: integer("draft_version").notNull(),
  rulesetVersion: integer("ruleset_version").notNull(),
  state: text("state").notNull(),
  payload: text("payload").notNull(),
}, (table) => [index("findings_draft_idx").on(table.draftId, table.draftVersion)]);

export const checkRuns = sqliteTable("check_runs", {
  id: text("id").primaryKey(),
  draftId: text("draft_id").notNull(),
  draftVersion: integer("draft_version").notNull(),
  rulesetVersion: integer("ruleset_version").notNull(),
  phase: text("phase").notNull(),
  status: text("status").notNull(),
  payload: text("payload").notNull(),
}, (table) => [uniqueIndex("check_runs_phase_idx").on(table.draftId, table.draftVersion, table.rulesetVersion, table.phase)]);

export const decisions = sqliteTable("decisions", {
  id: text("id").primaryKey(),
  findingId: text("finding_id").notNull(),
  draftId: text("draft_id").notNull(),
  payload: text("payload").notNull(),
}, (table) => [index("decisions_draft_idx").on(table.draftId)]);

export const rules = sqliteTable("rules", {
  rulesetVersion: integer("ruleset_version").notNull(),
  id: text("id").notNull(),
  ruleVersion: integer("rule_version").notNull(),
  payload: text("payload").notNull(),
}, (table) => [primaryKey({ columns: [table.rulesetVersion, table.id] })]);

export const proposals = sqliteTable("proposals", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
});

export const driftResults = sqliteTable("drift_results", {
  id: text("id").primaryKey(),
  proposalId: text("proposal_id").notNull(),
  payload: text("payload").notNull(),
}, (table) => [index("drift_results_proposal_idx").on(table.proposalId)]);

export const references = sqliteTable("references", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  payload: text("payload").notNull(),
});

/** Published records, filed under the published draft's Sabad. `payload` is the JSON of a `Publication`. */
export const publications = sqliteTable("publications", {
  referenceId: text("reference_id").primaryKey(),
  shabadId: text("shabad_id").notNull(),
  draftId: text("draft_id").notNull(),
  at: text("at").notNull(),
  payload: text("payload").notNull(),
}, (table) => [index("publications_shabad_idx").on(table.shabadId)]);

/** Persistent counters behind the visible IDs (draft-N, run-N, PUB-0001, ...). */
export const sequences = sqliteTable("sequences", {
  kind: text("kind").primaryKey(),
  value: integer("value").notNull(),
});
