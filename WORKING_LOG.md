# Working log

The complete task plan by workstream, plus what's done and what's pending. How the streams fit together, and why: [`_docs/06-team-workflow.md`](_docs/06-team-workflow.md). How to work a task: [`CLAUDE.md`](CLAUDE.md).

The eight supplied UI mockup pages are mapped to tasks and priorities in [`_docs/09-ui-mockups.md`](_docs/09-ui-mockups.md). Use their layout and flow as the FE reference; use the requirements and resolved rules for behavior and counts.

Each feature's ordered tasks and acceptance checks are in [`_docs/10-feature-breakdown.md`](_docs/10-feature-breakdown.md). Use this log for status and ownership, and the breakdown for what proves a task is done.

Before the two builders split, review the decision gates and M0 contract checklist in [`_docs/11-execution-readiness.md`](_docs/11-execution-readiness.md). It records which work can proceed while external data is absent.

- **Edit only your own streams' sections**, so this file never conflicts. *Decisions* is append-only; anyone may add. In *Seams*, only the provider ticks its row.
- Each task: `ID · what · FR · Needs`. *Needs* names the task or seam it depends on, and the stub to use until then.
- Finished a task: tick it and record any follow-ups in the task commit. Report that commit's final hash to the user after pushing; a commit cannot contain its own hash.
- Checkpoints M0–M3 are in [`_docs/06-team-workflow.md`](_docs/06-team-workflow.md#checkpoints).

**Person A** (CHECKS, LLM, EVAL) = _(name)_ · **Person B** (DATA, API, FE, PLATFORM) = _(name)_

---

## Seams

Cross-person dependencies. The provider ticks a row when the real implementation is on `main`.

| Ready | Seam | Provider → consumer | Real by | Stub until then |
|---|---|---|---|---|
| [ ] | **S1** `engine.runChecks` (code phase) | A: CHK-10 → B: API-03 | M1 | engine stub returns fixture `CheckResult` |
| [ ] | **S1** `engine.runChecks` (LLM phase) | A: CHK-11 → B: API-03 | M2 | code phase only |
| [ ] | **S2** `CheckInput` from real data | B: DATA-03, API-03 → A | M1 | `fixtures/sabad.demo.json` |
| [ ] | **S3** SikhRI references (normalized JSON) | B: DATA-06 → A: LLM-07 | M2 | `fixtures/references.json` |
| [ ] | **S3** SikhRI corrections (normalized JSON) | B: DATA-06 → A: EVAL-02 | M3 | `fixtures/corrections.json` |
| [ ] | **S4** `engine.runDriftCheck` | A: LLM-10 → B: API-07 | M3 | stub returns `pass` |
| [ ] | **S5** `data/eval/latest.json` | A: EVAL-02 → B: API-09 | M3 | `fixtures/eval-run.json` |
| [ ] | **S6** `engine.indexReferences` | A: LLM-07 → B: API-05 | M2 | no-op |
| [ ] | **S7** Free-text rules checked | A: LLM-06 ← B: API-08 | M3 | rule listed but not checked |

---

## Decisions

Append-only. Format: `- YYYY-MM-DD HH:MM · name · decision (why)`. Contract changes go here too. Planning decisions: [`_docs/07-decisions.md`](_docs/07-decisions.md).

- _(none yet on build day)_

---

## Pre-build · anyone

### Done
- [x] Problem brief, scope and requirements → `_docs/01`, `_docs/02`
- [x] Logical and technical architecture → `_docs/03`
- [x] Ruleset v0.1 structured (66 rules) and resolved (10 active) → `_docs/rules/`
- [x] Reviewer questions document drafted → `_docs/reviewer-questions.md`
- [x] Data source research → `_docs/05`
- [x] Workstream design and guardrail files → `_docs/06`, `.ownership.json`, `.githooks/`, `.gitignore`
- [x] **P-11** Consolidate the UI mockups, feature acceptance, readiness decisions and end-to-end agent workflow into the planning docs

### Next
- [ ] **P-01** Review the 4 flagged additions in the reviewer doc (Q1 option B, Q10, Q11, TERM-02 split), then send it
- [ ] **P-02** Receive reviewer answers → update `resolve.py`, regenerate, log in `_docs/07`
- [ ] **P-03** Receive SikhRI style guide → fold settled items into `resolve.py`
- [ ] **P-04** Ask SikhRI organizers for the sample: reference transcreations, review history with pre-edit drafts, ID scheme, format
- [ ] **P-05** Verify `khalisfoundation/banidb-dev` holds the full Guru Granth Sahib; if not, request a database copy from Khalis Foundation
- [ ] **P-06** Confirm whether BaniDB's monthly contribution requirement applies to a hackathon prototype
- [ ] **P-07** Pick 1–3 demo Sabads: one with a Kartar/Karta name (TERM-02), one opening with ੴ (TERM-03)
- [ ] **P-08** API keys for 2–3 LLM providers
- [ ] **P-09** Write demo transcreations with planted issues, one per featured rule (TERM-01, TERM-02, LAYER-07, plus one to override)
- [ ] **P-10** Make the eight-page UI PDF available to both builders; keep it outside the public repo and use only BaniDB-exported Gurmukhi in demo fixtures · UI reference: `_docs/09-ui-mockups.md`

### Blocked
- P-04 waits on SikhRI organizers

---

## Hour 0–1 · together (pairing on one machine)

The private-data ignore patterns and executable hook are committed. Verify the ignore rules before C-03 exports source data; configure `core.hooksPath` and `eko.person` in each clone at M0.

- [ ] **C-01** PLATFORM scaffold: Next.js (App Router, TS strict), Tailwind, shadcn (utils alias → `lib/utils.ts`), pnpm, Vitest, tsx. Install the **full package list** from `_docs/06`. Scripts: dev, test, typecheck, ingest, eval, bakeoff. `.env.example`. Empty stream folders with `.gitkeep`
- [ ] **C-02** CONTRACTS v1: `domain.ts`, `api.ts` (every route), `ports.ts` (`Engine`). Include grouped line IDs, draft/check phase versions, exact English span offsets, `FindingBatch`/`DriftAssessment` review schemas, engine `CheckResult`, persisted `CheckRun`, current-vs-cleared findings, decision history, reference snapshot and exception marks, and ruleset version. Plus the `lib/engine/index.ts` stub (returns fixtures) and the `lib/client` mock-mode skeleton
- [ ] **C-03** BaniDB up (`data/banidb/docker-compose.yml`); export the demo Sabads to a local, git-ignored `lib/contracts/fixtures/sabad.demo.json`. **Critical path.** Fallback after 30 min: export from the BaniDB API once. Never hand-type Gurmukhi or commit the export without permission
- [ ] **C-04** Fixtures: `check-result.json` and `findings.json` (spans from the SYNTHETIC cases), `references.json` and `corrections.json` (labelled test data), `eval-run.json`. All validate against `domain.ts`
- [ ] **C-05** Guardrails: map, executable hook and private-data ignores landed in `690f614` and `257c0c3`. Each person still runs the clone setup in `CLAUDE.md`; fill in names above before marking complete
- [ ] **M0** checkpoint: `pnpm dev` and `pnpm test` pass; contracts v1 on `main`

---

## CHECKS · Person A

Owns `lib/engine/checks/`, `lib/engine/gurmukhi/`, `lib/engine/rules/`, `lib/engine/index.ts`.

### In progress
- _(none)_

### Next
- [ ] **CHK-01** Gurmukhi: tokenize NFC lines, stem + ending matra, Divine-name matcher (Kartar/Karta family) · Needs: C-03 fixture
- [ ] **CHK-02** Rules: active rules for the transcreation from `CheckInput.rules`; compile prefilters from the seed · FR-08 · Needs: C-02
- [ ] **CHK-03** Golden test harness: reads `_docs/rules/rules.resolved.json` and the SYNTHETIC cases in `RULES_NOTES.md` §10 · FR-08
- [ ] **CHK-04** TERM-01 capitalized God/Lord and compounds → error
- [ ] **CHK-05** LAYER-07 any ( ) [ ] → error
- [ ] **CHK-06** TERM-03 IkOankar spelling; gloss at first use in the Sabad (comma/dash) → warning
- [ ] **CHK-07** TERM-07 non-preferred spellings; Bani titles exempt → warning
- [ ] **CHK-08** LAYER-06 closed archaism list → flag
- [ ] **CHK-09** Validator: drop findings whose span isn't in the draft or whose rule/reference IDs don't exist · FR-07
- [ ] **CHK-10** Pipeline code phase: changed authored units plus affected Sabad-scoped checks; real `engine.runChecks(input, 'code')` in `index.ts` · FR-06, FR-12 · **Provides S1 for M1**
- [ ] **CHK-11** Pipeline LLM phase: run registered LLM checks with p-limit, then the validator · Needs: LLM-01 · **Provides S1 for M2**
- [ ] **CHK-12** Deterministic CONS-01 → warning with reason before publish only when an applicable reference has explicit term-to-rendering mapping; otherwise stay silent · FR-09 · Needs: LLM-08, OQ-17 (stub: no mapping) · First to cut

### Blocked
- _(none)_

---

## LLM · Person A

Owns `lib/engine/llm/`, `lib/engine/retrieval/`, `lib/engine/drift/`, `data/cache/`, `scripts/engine/bakeoff.ts`.

### In progress
- _(none)_

### Next
- [ ] **LLM-01** Adapter: pinned AI SDK structured output (`generateText` + `Output.object` in current docs) with strict Zod `FindingBatch` and `DriftAssessment` schemas; provider from env; cache in `data/cache/` keyed by hash(model, prompt version, packet); p-limit ≈ 4 · Needs: C-02
- [ ] **LLM-02** Bake-off (`pnpm bakeoff`): minimal pairs for TERM-01/02, PRIN-04, LAYER-06 across 2–3 models; pick the fastest that passes; log under *Decisions* · Needs: P-08
- [ ] **LLM-03** TERM-02: packet with Divine names from the line → flag; collapse detector (3+ names, one English word) → warning · Needs: CHK-01
- [ ] **LLM-04** PRIN-04: prefilter + confirm → flag
- [ ] **LLM-05** Confirmation tiers: TERM-01 lowercase/plural, TERM-07 substitutes ("the Word", "hymn"), LAYER-06 ambiguous words
- [ ] **LLM-06** Generic judge attempts every approved free-text rule (`check_type: "free_text_llm"`); returns valid findings or a visible `not_evaluable` result, never a fabricated span · FR-18 · **Provides S7** (beat 5)
- [ ] **LLM-07** Retrieval index: in-memory by stem key + English embeddings (Transformers.js, cached in `data/cache/`); real `engine.indexReferences`. SikhRI-supplied and Eko-published references rank equally by source, with source and waiver/override/departure marks preserved · Needs: S3 (stub: `fixtures/references.json`) · **Provides S6**
- [ ] **LLM-08** `ReferenceLookup` for CONS-01 and style
- [ ] **LLM-09** English style comparison citing applicable SikhRI-supplied or Eko-published reference IDs, with source labels; no Gurmukhi term alignment inferred · FR-09 · Second to cut if no applicable references exist
- [ ] **LLM-10** Drift check: contradiction (LLM), approved-reference replay across SikhRI-supplied and Eko-published lines with source labels, glossary collision where source exists; real `engine.runDriftCheck` · FR-17 · **Provides S4**

### P1
- [ ] **LLM-11** Drift duplicate and scope-change warnings
- [ ] **LLM-12** Grammar hints from unambiguous ending matra · FR-10

### Blocked
- _(none)_

---

## EVAL · Person A

Owns `lib/engine/eval/`, `scripts/engine/eval.ts`, `data/eval/`.

### Next
- [ ] **EVAL-01** Metrics: catch rate, false-flag rate, sample size, per rule; tag typo and out-of-scope corrections separately · FR-19
- [ ] **EVAL-02** Backtest (`pnpm eval`): read corrections JSON and the rules file, run the pipeline, write `data/eval/latest.json` (`EvalRun`) per ruleset version · Needs: CHK-10, CHK-11, S3 (stub: `fixtures/corrections.json`) · **Provides S5**

---

## DATA · Person B

Owns `lib/server/db/`, `lib/server/ingest/`, `scripts/app/`, `data/banidb/`, `data/sikhri-sample/`.

### In progress
- _(none)_

### Next
- [ ] **DATA-01** Drizzle schema + first migration: lines, drafts, findings, check runs, decisions, rules (versioned), proposals, drift results, references. No engine-private tables · Needs: C-02
- [ ] **DATA-02** Repository functions in `lib/server/db/repo.ts` for the services
- [ ] **DATA-03** BaniDB ingest (`pnpm ingest`): mysql2 → lines with ang, raag, writer, Rahao, NFC Gurmukhi; demo Sabads first, full text if P-05 confirms · FR-01 · Needs: C-03 · **Provides S2**
- [ ] **DATA-04** Rules seed from `_docs/rules/rules.resolved.json` as version 1
- [ ] **DATA-05** Demo seed (`scripts/app/seed-demo.ts`) · Needs: P-09
- [ ] **DATA-06** SikhRI sample import: raw → `data/sikhri-sample/normalized/references.json` and `corrections.json` (contract schemas); map IDs by normalized Gurmukhi if they differ from BaniDB, quarantine ambiguous repeated-line matches, and load only resolved references into the DB · Needs: P-04 · **Provides S3**

### Blocked
- DATA-06 waits on P-04

---

## API · Person B

Owns `app/api/`, `lib/server/services/`.

### In progress
- _(none)_

### Next
- [ ] **API-01** Route skeletons for every route in `api.ts`, returning validated fixtures; contract tests · Needs: C-02
- [ ] **API-02** Get Sabad; save draft · FR-01, FR-02 · Needs: DATA-02
- [ ] **API-03** `POST /api/check` (code) and `/api/check/llm`: build `CheckInput` with current references → `engine.runChecks` (`CheckResult`) → store validated findings and per-rule `notEvaluable` only if versions match; persist `CheckRun` phase status/failure · FR-06, FR-12 · Needs: S1 (stub until M1/M2)
- [ ] **API-04** Decisions: accept, override, waive with a required reason; ready for review; re-check replaces stale findings · FR-03, FR-11, FR-12
- [ ] **API-05** Publish gate (open error/flag, incomplete current check phase or reasonless CONS-01 departure blocks; response names each cause; other warnings are informational) and publish → equally ranked references with source/exception/reason marks + `engine.indexReferences` · FR-13, FR-14 · Needs: S6 (stub: no-op)
- [ ] **API-06** Rules list with versions and provenance · FR-15
- [ ] **API-07** Proposals → `engine.runDriftCheck` → store results · FR-16, FR-17 · Needs: S4 (stub: pass)
- [ ] **API-08** Approve a rule or override a drift block with a reason → new ruleset version, provenance; new rules get `check_type: "free_text_llm"` · FR-18 · Pairs with LLM-06
- [ ] **API-09** `GET /api/eval` reads `data/eval/latest.json` · FR-19 · Needs: S5 (stub: fixture)

### P1
- [ ] **API-10** Proposals drafted from repeated overrides by 2+ people · FR-16b

---

## FE · Person B

Owns `app/(studio)/`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `components/`, `lib/client/`, `lib/utils.ts`, `public/`.

### In progress
- _(none)_

### Next
- [ ] **FE-01** Mockup p1 shell: first-visit name prompt stored in the browser and editable in the top bar (FR-20); Workspace/Review/Rules/Evaluation navigation, live ruleset version, BaniDB attribution and real logo in the footer (FR-21)
- [ ] **FE-02** `lib/client` typed client from `api.ts`; mock mode with `NEXT_PUBLIC_USE_MOCKS=1` · Needs: C-02, C-04
- [ ] **FE-03** Mockup p2 workspace: demo Sabad list/status, read-only BaniDB Gurmukhi (Noto Sans Gurmukhi), ang, raag, writer, Rahao; transcreation inputs per tukk or grouped tukks; save/change feedback; no text-generating control · FR-01, FR-02
- [ ] **FE-04** Mockup p3 report card: source and exact quoted draft spans beside rule/severity/explanation/reference evidence; current blockers; code findings first, pending then completed LLM findings; provenance · FR-06, FR-07
- [ ] **FE-05** Mockup p4 review queue and decision log: current draft version, cleared finding history, accept/override/waive all disabled until a reason is typed; ready for review · FR-03, FR-11, FR-12
- [ ] **FE-06** Mockup p4–5 publish gate and published view: name open error/flag rules, show warnings separately; display published references and marked exceptions · FR-13, FR-14
- [ ] **FE-07** Mockup p7 rules page: all 66 rules, counts derived from `rules.resolved.json`, level, severity, decision, check plan and provenance · FR-15
- [ ] **FE-08** Mockup p6 proposal and drift view: rule/example/reason; contradiction, published-line impact and glossary evidence; approval or block override requires a reason · FR-16–18
- [ ] **FE-09** Mockup p8 evaluation: catch rate, false-flag rate, actual sample size and ruleset version, with an unavailable state before real corrections arrive · FR-19 · Fifth to cut

### P1
- [ ] **FE-10** Browse the full Guru Granth Sahib by ang, raag, writer · FR-04
- [ ] **FE-11** Mockup p2 word lookup: occurrences, prior renderings and similar lines, read-only and sourced from available data · FR-05
- [ ] **FE-12** Mockup p7 ruleset version-history tab and prefilled change proposal
- [ ] **FE-13** Mockup p8 Run backtest and Export JSON controls; needs a separately agreed API contract and server execution path
- [ ] **FE-14** Mockup p8 detailed caught/missed/false-flag examples and per-version comparison beyond the P0 summary

---

## Integration · together

- [ ] **M1** (hour 3) Save a transcreation → real API → `runChecks('code')` → real findings with highlights
- [ ] **M2** (hour 6) LLM findings; override and waive need a reason; publish blocked by an open must-fix. **Decide cuts here**
- [ ] **M3** (hour 8) Propose → drift → approve → the next check uses the new rule; eval numbers shown
- [ ] **INT-01** Fix integration issues
- [ ] **INT-02** Seed the demo and run it end to end (checklist below)
- [ ] **INT-03** Record the 5-minute video: the six beats in [`_docs/01-problem-statement.md`](_docs/01-problem-statement.md#what-the-video-must-show)

### Demo checklist
- [ ] Demo Sabad loads with correct Gurmukhi from BaniDB
- [ ] Saving a transcreation shows code findings, then LLM findings
- [ ] Every finding cites a rule and a quoted span; no finding says "incorrect"
- [ ] Override with a reason → publish succeeds; without a reason → blocked
- [ ] Propose a rule → drift check → approve with a reason → next check uses the new version
- [ ] Eval shows catch and false-flag rates with sample size
- [ ] BaniDB attribution visible
- [ ] Mockup labels are reconciled with live data: 10 active rules (8 checks + 2 workflow), PRIN-04 active, no hard-coded sample counts or timings

### Cut order (decide at M2)
1. CHK-12 CONS-01 and LLM-09 style, if neither SikhRI-supplied nor Eko-published references provide applicable evidence
2. LLM-11 duplicate and scope-change warnings (already P1)
3. Per-rule breakdown in EVAL-01 and FE-09
4. LAYER-06 tier in LLM-05
5. FE-09 eval card (show `latest.json` as a table instead)

---

## Requests between people

Format: `- from → to · what's needed · task it blocks`. The owner ticks it when done.

- _(none)_
