# F0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish F0's Mac-verifiable foundation: contract fixtures, private-data guardrails, durable app storage, BaniDB-backed source ingest and source-only demo seed, and contract-valid P0 route skeletons.

**Architecture:** Keep the existing contracts as the source of truth. The app owns one SQLite database and imports source text only through the ingest script; route handlers never query BaniDB. The engine remains a synthetic stub for F0. The user-provided, ignored `data/banidb/banidb.sqlite` has a partial `Verse` table but a full-looking `tmp_Verse` staging table. Validate that table and export a complete local Sabad from it, preserving the older private API fixture and its provenance until replacement passes all checks.

**Tech Stack:** Node 22, pnpm 11.25.0, Next.js 16 App Router, TypeScript strict, Zod 4, better-sqlite3, Drizzle ORM/Kit, Vitest. The existing mysql2 exporter remains available for the Docker development image.

**Spec:** `_docs/10-feature-breakdown.md` F0, `_docs/02-requirements.md` FR-01/08, `_docs/03-architecture.md` core records, `_docs/11-execution-readiness.md`, `WORKING_LOG.md`, and `_docs/c03-banidb.md`.

## Global Constraints

- Never generate or edit English transcreation text or Gurmukhi. Use only BaniDB-exported NFC source. The user asked for a source-only demo seed now; human-authored drafts are deferred.
- Keep SikhRI samples, BaniDB exports, credentials, caches, eval output, and local databases out of Git.
- Preserve the exact C-02 contracts and verbatim rule text; record any necessary contract decision before an additive change. Breaking changes need a checkpoint.
- No app route queries BaniDB at request time. Code outside `lib/engine/` imports the engine only through `lib/engine/index.ts`.
- Windows runtime validation is outside this request. Keep scripts portable and record Mac-only evidence accurately.
- Work through the listed task IDs sequentially, with focused checks and a review gate for each independently reviewable deliverable. The user's F0 request supersedes the repository's usual one-ID-per-session convention.

## Review Focus

1. A private fixture or local database becomes trackable: C-05 checks every documented path with `git check-ignore` and `git status`.
2. `tmp_Verse` is mistaken for a current or certified full corpus: C-03/DATA-03 check mapped IDs, source text, metadata, and provenance, while labelling corpus-wide/currentness claims as unverified.
3. Re-running ingest or seed duplicates lines or rules: DATA-03/04/05 tests verify idempotence in a temporary SQLite database.
4. Stored grouped drafts lose source IDs or versions: DATA-02 round-trip tests compare the full contract record.
5. A route returns plausible but invalid data: API-01 tests parse every handler response or explicit error using `lib/contracts/api.ts`.

---

### Task 1: C-04 — labelled contract fixtures

**Files:** Add `lib/contracts/fixtures/findings.json`, `references.json`, and `corrections.json`; update `check-result.json`, `eval-run.json`, `fixtures/README.md`, `fixtures/index.ts`, and `fixtures.test.ts` only as needed.

**Interfaces:** Consume `FindingSchema`, `ReferenceSchema`, `ReviewCorrectionSchema`, `CheckResultSchema`, and `EvalRunSchema` from `lib/contracts/domain.ts`. Produce synthetic English evidence that existing mocks and later tests can import.

- [x] Add focused tests for schema validity, exact draft spans, valid rule/reference IDs, and explicit synthetic/unavailable labels; run them to observe the missing fixtures.
- [x] Add the smallest fixture set using English synthetic cases from `_docs/rules/RULES_NOTES.md` §10. No private Gurmukhi or invented SikhRI evidence enters Git.
- [x] Run the focused fixture tests and typecheck; review the diff and record C-04 status.

### Task 2: C-05 — Mac private-data checks

**Files:** Update `.gitignore` only if a documented private path is uncovered; add a portable check under `scripts/dev/` only if needed; update `WORKING_LOG.md` and `_docs/c03-banidb.md` with Mac evidence and explicit Windows remainder.

**Interfaces:** Consume the private path inventory in `_docs/c03-banidb.md` and `CLAUDE.md`; produce a repeatable ignore/status check.

- [x] Check ignored paths for source exports, raw API response, credentials, SikhRI samples, caches, eval output, and SQLite files, including nested files.
- [x] Verify `git status` does not offer existing private files; test any newly discovered ignore gap without exposing file contents.
- [x] Record C-05 as Mac-verified with Windows validation open, rather than claiming cross-platform acceptance.

### Task 3: DATA-01 — SQLite schema and first migration

**Files:** Add `lib/server/db/schema.ts`, `lib/server/db/client.ts`, `drizzle.config.ts`, and a generated migration under `lib/server/db/migrations/`; add `lib/server/db/schema.test.ts`.

**Interfaces:** Tables persist the contract records named in `_docs/03-architecture.md#core-records`: lines, drafts, findings, check runs, decisions, versioned rules, proposals, drift results, and references. Eval output remains a file.

- [x] Write a migration test that opens an empty temporary SQLite database, applies the first migration, and checks all expected tables and keys; additionally apply through the client to a temporary file.
- [x] Define the narrow Drizzle schema and generate the migration; keep JSON-backed arrays/objects behind contract validation rather than duplicating engine structures.
- [x] Run the migration test and typecheck.

### Task 4: DATA-02 — repository round trips

**Files:** Add `lib/server/db/repo.ts` and `repo.test.ts`; modify the DB client only if transaction access is needed.

**Interfaces:** Export a repository factory for a supplied SQLite connection; expose typed save/load operations for Sabads, drafts, findings, check runs, decisions, rules, proposals, drift results, and references. Parse records through the C-02 schemas at the boundary.

- [x] Write temporary-database tests for each record family, including grouped line IDs, versioned rules, reasoned decisions, and reference exceptions.
- [x] Implement only the operations needed by F0 and the declared API seams; use transactions for multi-record writes that must be atomic.
- [x] Run focused repository tests and typecheck.

### Task 5: C-03 and DATA-03 — validate local SQLite source and ingest

**Files:** Add `scripts/app/export-banidb-sqlite-demo.ts`, `lib/server/ingest/banidb.ts`, `scripts/app/ingest.ts`, and focused tests; update `_docs/c03-banidb.md` and `WORKING_LOG.md` with actual source/provenance evidence.

**Interfaces:** Read only the user-provided, ignored BaniDB SQLite copy with `better-sqlite3`; map `tmp_Verse` + `Shabad` + `Raag` + `Writer` to `SabadSchema` and write lines through DATA-02. Keep the existing MariaDB exporter and API fallback separate.

- [x] Test that the SQLite exporter rejects missing mapped lines, mixed source IDs, absent metadata, and invalid source text. Verify Rahao extraction against the raw legacy marker syntax in the selected Sabad.
- [x] Verify the `tmp_Verse` ID range and G-source mapping coverage, and compare its Unicode to `Verse` on all shared G-source IDs. Record that matching overlap and mapping coverage do not establish currentness or a textual audit.
- [x] Export one complete 3–10 line Sabad with source IDs, NFC text, raag, writer, and Rahao from local SQLite. Validate the private canonical `SabadSchema` fixture and write separate provenance. Do not commit the export.
- [x] Test and implement idempotent ingest from that local export into the app database; never store BaniDB translation fields. Keep a clear error for attempts to export from the incomplete Docker `Verse` table.

### Task 6: DATA-04 — seed resolved rules

**Files:** Add `lib/server/ingest/rules.ts` and tests; wire `scripts/app/ingest.ts` if appropriate.

**Interfaces:** Read `_docs/rules/rules.resolved.json` in place, map its 66 entries to `RuleSchema` at version 1, and save through DATA-02 without rewording rule text.

- [x] Test 66 IDs, 10 active resolutions, verbatim text, and no duplicate version after a second seed.
- [x] Implement the seed and run the focused test and typecheck.

### Task 7: DATA-05 — source-only demo seed now

**Files:** Add `scripts/app/seed-demo.ts` and focused tests; update setup docs.

**Interfaces:** Read the ignored locally exported BaniDB demo Sabad and save its source lines through DATA-02. A later human-authored draft can extend the seed under P-09/F1.

- [x] Test that the seed preserves source IDs/text exactly and does not duplicate lines on repeat; it creates no English draft or decision.
- [x] Implement the source-only seed. Record the user-directed deferral of the original DATA-05 authored-draft criterion in `WORKING_LOG.md` and the feature plan before marking F0 complete.

### Task 8: API-01 — P0 route skeletons

**Files:** Add route handlers under `app/api/` matching all 18 entries in `lib/contracts/api.ts`; add route contract tests. Use shared response helpers in `lib/server/services/` only when they reduce repeated validation.

**Interfaces:** Each route accepts the declared request shape and returns a schema-valid fixture response or `ApiErrorSchema` error. Real draft/check/review behavior remains assigned to API-02 onward.

- [x] Test the 18 method/path handlers and parse every response or error against its declared schema.
- [x] Implement the minimal handlers. Return explicit unavailable responses where the synthetic stub lacks real evidence; do not imply persistence or review occurred.
- [x] Run route tests and typecheck.

### Task 9: F0/M0 verification and status

**Files:** Update `WORKING_LOG.md`, `README.md`, and relevant setup docs with measured results and remaining gates.

- [ ] Follow the Mac setup from a clean app database, apply migration, export and ingest the local SQLite Sabad, seed source lines and rules, then repeat ingest/seed to prove idempotence.
- [ ] Run `pnpm typecheck`, `pnpm test`, and a bounded `pnpm dev` smoke check. Repair the current pnpm runtime wrapper issue before accepting these checks; do not treat the failed baseline attempt as a test result.
- [ ] Verify private paths remain ignored and no route queries BaniDB. Ask a fresh reviewer agent for correctness review, fix substantiated findings, and rerun affected checks.
- [ ] Mark individual tasks complete only where their acceptance passes. Record the user-directed source-only DATA-05 scope and Windows validation exception. Mark F0/M0 complete only after local export, Mac guardrails, fixtures, storage, ingest, route skeletons, and setup checks pass. Commit and push task-scoped changes without private artifacts.

## External gates and current evidence

- The user supplied an ignored 756 MB BaniDB SQLite copy. Its `Verse` table matches the partial Docker image (20,134 G-source rows; 39,977 missing mapped verses). `tmp_Verse` has 60,403 G-source rows, IDs 1–60,403, zero missing Unicode, all 60,111 checked G-Sabad mappings present, and source Unicode equal on all 20,134 overlapping `Verse` rows. A complete metadata-valid compact Sabad is available for a local export. The staging table's provenance/currentness is not independently verified.
- Published [BaniDB terms](https://www.banidb.com/tos/) include data-use, refresh, attribution, and contribution conditions that need clarification before redistribution. No BaniDB data or export will be committed.
- The user requested source lines only for the demo seed. The original authored-draft part of DATA-05 moves to a later human-input task; the assistant cannot write or suggest a transcreation under `CLAUDE.md` hard rule 1.
- The first baseline `pnpm typecheck` and `pnpm test` attempts stopped before running because this environment's pnpm wrapper attempted a non-interactive dependency reinstall. Direct project binaries passed 34 Vitest tests, Next route-type generation, and `tsc --noEmit`. Docker status was inaccessible through the sandbox socket. Resolve these execution-environment checks during implementation.
