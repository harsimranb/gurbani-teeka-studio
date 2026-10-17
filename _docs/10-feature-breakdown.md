# Eko Feature Implementation Plan

> **For agentic workers:** Follow the approved-task workflow in [`CLAUDE.md`](../CLAUDE.md#end-to-end-agent-workflow), one task ID at a time. This document supplies acceptance criteria; keep the implementation small.

**Goal:** Build the eight-screen Eko demo flow with checkable completion criteria for each feature, without expanding the one-day P0 scope.

**Architecture:** Engine (CHECKS, LLM, EVAL) and app (DATA, API, FE, PLATFORM) are workstreams open to every contributor on macOS or Windows. They share Zod contracts agreed at M0. The app loads BaniDB text and rules, passes a `CheckInput` through the engine port, stores validated findings and human decisions, and renders the current state. See [03-architecture.md](03-architecture.md) and [06-team-workflow.md](06-team-workflow.md).

**Tech stack:** Next.js App Router, TypeScript strict, SQLite/Drizzle, Vercel AI SDK structured output with Zod (`generateText` + `Output.object` in current docs), Transformers.js, Vitest, BaniDB MariaDB at ingest. Pin compatible versions in C-01.

**Spec:** [Requirements](02-requirements.md), [UI mockup map](09-ui-mockups.md), [resolved rules](rules/rules.resolved.json), [working queue](../WORKING_LOG.md), and [execution readiness](11-execution-readiness.md). The queue owns task status; this plan owns task-level and feature-level acceptance. Keep the task IDs in both documents aligned and resolve readiness gates before dependent work.

**Implementation size:** This is a hackathon build. Use the existing one-process architecture and the smallest code path that passes the selected task's acceptance checks. Finish the P0 demo flow before adding P1 screens, generalized infrastructure or polish.

## Global constraints

- Eko reviews human-written English transcreations only. No control, prompt or model call may generate or suggest translation text.
- Displayed Gurmukhi and Gurmukhi fixtures come only from BaniDB, are NFC and read-only. Do not type Gurmukhi into tests or code.
- A finding must cite a real rule, an exact span of the current English draft, an explanation and valid reference IDs when used. Invalid findings are dropped before storage or display.
- Every human decision, including acceptance, override, waiver and rule approval, needs a stored written reason. No sign-in or roles; store the entered name.
- Open errors and flags, an incomplete current check phase, or a CONS-01 departure without a recorded reason block publishing. Other warnings do not block, but dismissing one needs a reason. Rule text remains verbatim and resolved decisions govern severity.
- SikhRI sample data stays outside Git under `data/sikhri-sample/`. BaniDB data, including a locally exported demo fixture, and local databases stay uncommitted unless Khalis Foundation expressly permits redistribution. Use labelled synthetic English cases only for stand-ins.
- Anyone may work in any folder. Coordinate overlapping edits and use `lib/engine/index.ts` as the app's only engine import.

## Review focus

These are the highest-risk conditions to pin to the owning task's verification before calling a feature done:

1. A grouped transcreation or a Sabad-scoped first-use/collapse rule changes: re-check the affected authored unit and dependent Sabad findings, replacing stale results while keeping every source line ID (CHK-10, API-02/03/04).
2. A model returns a span outside the draft or an unknown rule/reference ID: drop it before persistence and leave no phantom blocker (CHK-09, API-03).
3. A model result or reviewer action arrives for an older draft/ruleset version: reject it, keep current findings/gate unchanged, and retain earlier history (API-03/04).
4. The SikhRI sample lacks references or pre-edit drafts: show unavailable states, not fabricated citations or backtest rates (DATA-06, API-09, FE-09).
5. A blocked rule proposal is approved without an override reason: reject it server-side and leave the active ruleset version unchanged (API-08).
6. A free-text proposal contains instructions to write translation text or ignore rules: treat it only as untrusted rule data; produce a strict review result or `not_evaluable`, never a rewrite (LLM-06/10).

## Delivery order and proof

The hour labels below are estimates, not hard stop times; pass each milestone's acceptance before moving on (D-61).

| Checkpoint | Feature slice to demonstrate | Dependency |
|---|---|---|
| M0 · hour 1 | Scaffold, contracts, BaniDB fixture, mocks and private-data ignore checks work | C-01 to C-05; P-05 for full-source validation |
| M1 · hour 3 | Save a human transcreation; real code findings appear with exact highlights | F1, F2 code phase; S1/S2 |
| M2 · hour 6 | Model findings, reference findings where an applicable source exists, reasoned review and publish gate work; decide cuts | F2 model phase, F3 with SikhRI or Eko-published references, F4 |
| M3 · hour 8 | Proposal passes drift/approval, next check uses the new rule; backtest output is shown | F5, F6, F7; S3/S4/S5/S7 |
| M4 · hours 9–10 | Run the six demo beats on real data and record the video | INT-01 to INT-03 |

| Feature | Requirement coverage | PDF pages |
|---|---|---|
| F0 · foundation/data | FR-01, FR-08 and the platform constraints | — |
| F1 · workspace | FR-01, FR-02, FR-03, FR-20, FR-21 | 1–2 |
| F2 · checks/report | FR-06, FR-07, FR-08 | 2–3 |
| F3 · references/style | FR-09 | 2–3, 5 |
| F4 · review/publish | FR-11, FR-12, FR-13, FR-14 | 4–5 |
| F5 · rules catalog | FR-15 | 7 |
| F6 · proposals/drift | FR-16, FR-17, FR-18 | 6 |
| F7 · evaluation | FR-19 | 8 |
| P1 · optional | FR-04, FR-05, FR-10, FR-16b | 2, 6–8 |

## F0 · Foundation, contracts and source data

**Workstreams:** CONTRACTS, PLATFORM, DATA and API; anyone may contribute. **Needs:** BaniDB image and P-05 check. **Paths:** root config, `lib/contracts/`, `lib/server/db/`, `lib/server/ingest/`, `scripts/app/`, `data/banidb/`, `.gitignore`.

| Task | Independently reviewable deliverable |
|---|---|
| C-01 | Scaffold starts with `pnpm dev`; `pnpm typecheck` and `pnpm test` run; versions and scripts are pinned; secrets have names only in `.env.example`. |
| C-02 | `domain.ts`, `api.ts` and `ports.ts` validate every cross-stream shape, including grouped line IDs, draft/check versions and phase states, exact English span offsets, current reference snapshot, finding state, decision/reason, exception marks, strict `FindingBatch`/`DriftAssessment` outputs, engine `CheckResult`, persisted `CheckRun` and integer ruleset version (`1` displays as `v1`). Stub engine and mock client return schema-valid fixtures; the route inventory is explicit in `api.ts`. |
| C-03 | Local BaniDB source is verified and an ignored fixture is exported from a complete mapped Sabad with source IDs, metadata and NFC text. The supplied local SQLite copy may provide the demo export when the development image is partial; keep each source's provenance distinct. No Gurmukhi is typed or generated. Record coverage limits without claiming a fully audited/current corpus (P-05). |
| C-04 | Check-result, findings, references, corrections and eval fixtures validate against contracts and are clearly labelled test data. Fake metrics and references cannot be mistaken for SikhRI evidence. |
| C-05 | Each macOS/Windows clone verifies private-data ignores: SikhRI samples, BaniDB exports (including the demo fixture), credentials, caches, eval output and local databases stay ignored. No person identity or folder ownership restriction applies. |
| DATA-01 | A migration creates the records in [03](03-architecture.md#core-records), including durable `CheckRun` phase state; a temporary SQLite file can apply it from empty state. |
| DATA-02 | Repository functions save/load the contract records without engine imports; a temporary SQLite file exercises draft, finding, decision, rule and reference operations. |
| DATA-03 | Ingest creates BaniDB-backed lines and metadata with NFC text from the verified local export; re-running does not duplicate rows. |
| DATA-04 | Rules seed reads `rules.resolved.json` in place and preserves all 66 rule IDs; the all-layer expansion versions changed decisions without deleting older snapshots. Re-running does not duplicate versions. |
| DATA-05 | For F0, demo seed loads only the chosen BaniDB-exported source Sabad and is repeatable without duplicating lines (D-75). A human-written English draft is deferred to P-09/F1; no synthetic marker is presented as a transcreation. |
| API-01 | Every route declared in `api.ts` has a handler skeleton with a response-schema test. Safe reads may return labelled contract fixtures; stateful or evidence-dependent actions return a contract-valid unavailable error until their real implementation exists (D-76). |

**Feature acceptance:** A builder with the documented local BaniDB source can run the app/tests, export the demo Sabad and inspect real source IDs, metadata and read-only Gurmukhi. The shared contract shape and labelled synthetic English fixtures work before the private export is available. `git status` never offers SikhRI or BaniDB content or database files for commit. No app route queries BaniDB at request time. M0 passes only when the contract fixtures and Mac guardrail checks pass; Windows validation remains separately open by user direction.

## F1 · Name, navigation and transcreation workspace

**Workstreams:** App; anyone may contribute. **Needs:** C-02/C-04, DATA-02/03, API-02. **Paths:** `app/(studio)/`, `app/layout.tsx`, `components/`, `lib/client/`, `app/api/`, `lib/server/services/`.

| Task | Independently reviewable deliverable |
|---|---|
| FE-01 | First visit asks for a name once per browser; top bar changes it later; all four main destinations are reachable; BaniDB's real attribution and logo appear on every page. |
| FE-02 | Typed client uses `api.ts` and a fixture-backed mock mode. The same workspace screen renders from mocks and the real API without changing its component props. |
| API-02 | Sabad read returns line IDs, ang, raag, writer and Rahao; draft save records English text, every grouped source line ID, author, timestamp and a version. |
| FE-03 | A user selects a demo Sabad, sees source text read-only, enters one transcreation per tukk or group, saves, and sees save/version/check progress. No control creates English text. |

**Feature acceptance:** Reloading retains the browser name and saved draft; changing the name affects later actions, not historical attribution. A grouped draft survives reload with the same line IDs and English text. The source text has no edit control and matches the BaniDB-exported fixture character for character after NFC normalization. Marking ready for review makes the draft appear in the queue (API-04/FE-05).

## F2 · Rules engine, checks and report card

**Workstreams:** CHECKS, LLM, API and FE; anyone may contribute. **Needs:** C-02/C-03, S2, P-08 for model bake-off. **Paths:** `lib/engine/checks/`, `lib/engine/gurmukhi/`, `lib/engine/rules/`, `lib/engine/llm/`, `lib/engine/index.ts`, `app/api/`, `components/`.

| Task | Independently reviewable deliverable |
|---|---|
| CHK-01 | NFC token/stem and Divine-name evidence use only the BaniDB-exported fixture; tests cover relevant spelling variants without hand-written Gurmukhi. |
| CHK-02 | Rules loader selects exactly the eight `p0_check` rules on the transcreation layer and respects resolved severity and prefilters. |
| CHK-03 | Golden harness runs the synthetic English cases against the resolved rules and reports each rule's pass/fail cases. |
| CHK-04 | TERM-01 finds capitalized forbidden forms and compounds at exact draft offsets; lowercase/plural cases go to the model confirmation tier. |
| CHK-05 | LAYER-07 finds every round/square bracket in the transcreation and quotes its exact span. |
| CHK-06 | TERM-03 checks approved spelling and first-use gloss within one Sabad; warning severity comes from the resolved rule. |
| CHK-07 | TERM-07 spots non-preferred spellings while exempting Bani titles; English substitutes go to model confirmation. |
| CHK-08 | LAYER-06 closed archaism list produces a flag; ambiguous words wait for model confirmation. |
| CHK-09 | Validator drops unknown rule/reference IDs and absent/misaligned English spans, including in grouped drafts; offsets are UTF-16 code units, end-exclusive, and `draft.text.slice(start, end)` must equal `quoted_span`. No invalid finding reaches the API. |
| CHK-10 | `runChecks(input, 'code')` touches changed authored units plus affected Sabad-scoped rules, validates its findings and returns a `CheckResult` for S1's code phase. |
| CHK-11 | `runChecks(input, 'llm')` runs only selected rule packets, validates findings, includes per-rule `notEvaluable` results and returns independently of the code phase. |
| LLM-01 | Adapter uses the pinned SDK's supported Zod structured-output call. Each check packet returns a strict `FindingBatch` (zero or more findings, or `not_evaluable` with reason); drift returns `DriftAssessment`. Cache by model/prompt version/evidence packet and limit concurrency. |
| LLM-02 | Bake-off records pass/fail and timing for minimal pairs across 2–3 providers before a model is chosen. |
| LLM-03 | TERM-02 judges English against code-supplied Divine-name evidence and returns a validated flag or no finding; collapse detection gives a warning. |
| LLM-04 | PRIN-04 uses a prefilter and model confirmation; everyday non-claims pass its minimal pairs. |
| LLM-05 | Lowercase/plural TERM-01, TERM-07 substitutes and ambiguous LAYER-06 cases are confirmed in context only after a prefilter; the model never emits a rewrite. |
| API-03 | Separate code and model endpoints build `CheckInput` with current references, persist the engine `CheckResult` only when draft and ruleset versions still match, and keep `CheckRun` phase state durable as pending/succeeded/failed. A failed current phase can be retried without duplicating findings. Responses validate against contracts. |
| FE-04 | Report card shows current source/draft beside exact highlights, rule ID/text, severity, explanation, valid references, provenance and distinct pending/completed/failed phase states plus per-rule `not_evaluable` results, with retry for a failed phase. |

**Feature acceptance:** A save with planted TERM-01 and LAYER-07 issues displays code findings first; a suitable TERM-02 case yields a model finding from structured BaniDB evidence. Each finding's quoted span equals the saved English draft slice at its offsets and links only to existing rule/reference IDs. An injected bad model span or ID is absent from storage and UI. Unrelated tukks are not re-checked, while a changed first use or Sabad-wide collapse rechecks dependent findings. A delayed model response from an older draft/ruleset cannot replace current results. Code checks meet the under-one-second target; model checks aim for about 15 seconds per authored unit and report measured timing rather than mockup numbers. Implemented checks have focused cases; CONS-02/03 are verified through review workflow, not invented text checks. F8 covers the new layers.

## F3 · Reference and style evidence

**Workstreams:** DATA, LLM and CHECKS; anyone may contribute. **Needs:** an applicable SikhRI-supplied or Eko-published reference. P-04/S3 are needed for claims about SikhRI's existing corpus. **Paths:** `data/sikhri-sample/`, `lib/server/ingest/`, `lib/engine/retrieval/`, `lib/engine/llm/`, `lib/engine/checks/`.

| Task | Independently reviewable deliverable |
|---|---|
| DATA-06 | Private sample import normalizes reference transcreations and corrections to contract shapes, maps source IDs, and quarantines unmatched or ambiguous repeated-line matches without silently choosing a BaniDB ID or committing source data. |
| LLM-07 | Reference index consumes the current `CheckInput.references` snapshot, ranks SikhRI-supplied and Eko-published references equally by source, returns real IDs and preserves source/waiver/override/context-reason marks; `indexReferences` warms/updates it after import or publish, and a cold restart still works. |
| LLM-08 | Reference lookup retrieves related renderings by the planned stem and English similarity methods, with ordinary references distinct from exceptions. |
| CHK-12 | Deterministic CONS-01 raises a warning only when an applicable reference explicitly maps a source term to an English rendering, with its ID and an exact draft span; line-level English alone is insufficient. A departure needs a reason before publish. |
| LLM-09 | Style finding cites at least one retrieved real reference ID and an exact English draft span; no reference means no style finding. |

**Feature acceptance:** With explicit term mapping, a departure can yield a deterministic CONS-01 warning with the cited ID and exact English span. Without mapping, CHK-12 stays silent; the separate LLM-09 style check may compare English draft and cited English references without claiming term-level Gurmukhi alignment. The report card opens every cited reference and labels its source. An Eko-published reference has equal source weight to a SikhRI-supplied one; a recorded exception remains visibly marked. With no applicable references, the UI states that reference checks are unavailable and does not present fixture citations as real evidence. Harsimran confirmed on 2026-10-16 that neither SikhRI dataset has arrived: Eko-published references can demonstrate the mechanism, but no one may describe that as a check against SikhRI's existing approved corpus.

## F4 · Human review, reasons and publishing

**Workstreams:** API and FE, with LLM providing `indexReferences`; anyone may contribute. **Needs:** F1/F2, S6. **Paths:** `lib/server/services/`, `app/api/`, `app/(studio)/`, `components/`.

| Task | Independently reviewable deliverable |
|---|---|
| API-04 | Ready-for-review, accept, override and waive persist actor, written reason, time and draft/finding version. Accept confirms a finding and sends it back for editing; override or waiver resolves that finding. Editing supersedes findings tied to changed text; stale decisions cannot be applied to an older report. |
| FE-05 | Queue shows ready drafts and current counts; review view shows current text, findings and decision log. Every decision button remains disabled until a nonblank reason is entered. |
| API-05 | Publish gate returns open error/flag IDs, pending/failed current check phases or an unresolved CONS-01 departure without a recorded reason; override/waiver with a reason clears the relevant finding blocker. Publish creates equally ranked reference IDs, stores source/exception marks and calls `indexReferences`. |
| FE-06 | Publish view names blockers while blocked; after success it shows author, approver, time, version, references and marked exceptions. Warnings are visible but nonblocking. |

**Feature acceptance:** A publish attempt with an open error or flag fails on the server and names the blocking rule; pending or failed current-version checks also prevent publishing. An unresolved CONS-01 departure cannot publish without a recorded reason; other open warnings can. Empty or whitespace-only reasons fail for every decision, including a direct API request. Accepting a must-fix leaves it open for the writer; a valid override or waiver allows publication when no other must-fix remains and both check phases succeeded. The decision log retains who, when and why. A later edit clears stale findings from the active report; a stale reviewer action is rejected. A new check can cite the published reference with equal source weight and its exception marks visible.

## F5 · Rules catalog

**Workstreams:** App; anyone may contribute. **Needs:** DATA-04, API-06. **Paths:** `lib/server/services/`, `app/api/`, `app/(studio)/`.

| Task | Independently reviewable deliverable |
|---|---|
| API-06 | Rules response lists all 66 seeded rules and current approved additions with rule text, level, resolution, source, version and provenance; it derives counts from the stored rules. |
| FE-07 | Rules list filters by status and shows a detail panel with verbatim rule text, check plan, severity, team judgment and approval history. |

**Feature acceptance:** The catalog shows all 66 source rules, their applicable layers and a separate implemented-layer count. PRIN-03, TERM-04 and TERM-05 are reinstated. No text or count is hard-coded from mockup page 7. After approval of a new rule, the list and version update from live data. Version-history browsing beyond provenance is P1.

## F6 · Proposals, drift guard and ruleset activation

**Workstreams:** LLM, API and FE; anyone may contribute. **Needs:** F5, S4, S7, published references for replay. **Paths:** `lib/engine/drift/`, `lib/engine/llm/`, `lib/server/services/`, `app/api/`, `app/(studio)/`.

| Task | Independently reviewable deliverable |
|---|---|
| LLM-06 | Generic judge treats approved free-text rules as untrusted data and attempts each on the next check. It returns validated exact-span findings when possible, otherwise `not_evaluable` with reason; a rule instructing translation or prompt override cannot make it emit a rewrite. |
| LLM-10 | Drift check returns structured contradiction, approved-reference replay across both equally ranked sources, and glossary-collision outcomes with evidence IDs, source labels and counts. A deliberate contradiction blocks. Missing glossary evidence is `unavailable`, not pass. Duplicate and scope-change commentary remain P1. |
| API-07 | Submission requires rule text, example and reason; it stores the proposal and drift results without changing the active ruleset. |
| API-08 | Approval and block override require a nonblank reason, actor and provenance; successful approval creates one new ruleset version atomically and makes it active for the next check. |
| FE-08 | Proposal page shows the form, each drift result and its evidence; a blocked proposal offers revise or reasoned override, never silent approval. |

**Feature acceptance:** Submitting a deliberately conflicting rule displays the block and affected evidence. The provisional replay rule blocks when at least one approved reference line would be flagged and shows the affected IDs/source counts (OQ-07). Approving a block without an override reason fails and leaves the version unchanged; a reasoned override records who/when/why. Any approved proposal increments the version once, appears in the catalog and is attempted by the generic judge on the next check. A checkable proposal can produce a validated exact-span finding; an uncheckable one visibly reports `not_evaluable` and produces no fabricated finding. Use a checkable proposal for the demo.

## F7 · Backtest and evaluation view

**Workstreams:** EVAL, API and FE; anyone may contribute. **Needs:** SikhRI pre-edit drafts via DATA-06, F2 pipeline, S5. **Paths:** `lib/engine/eval/`, `scripts/engine/eval.ts`, `data/eval/`, `app/api/`, `app/(studio)/`.

| Task | Independently reviewable deliverable |
|---|---|
| EVAL-01 | Metrics classify real corrections as caught/missed and findings on unchanged spans as false flags; output includes denominators, sample size, per-rule and per-version results, with typos/out-of-scope corrections tagged separately. |
| EVAL-02 | `pnpm eval` replays held-back pre-edit drafts through the same engine/rules, writes `data/eval/latest.json` and reproduces the same result on a cache-warm rerun. It does not mutate live drafts, rules or decisions. |
| API-09 | Read-only eval route validates `latest.json` against `EvalRun`; missing or unusable real corrections return an explicit unavailable state. |
| FE-09 | Evaluation page shows catch rate, false-flag rate, sample size and ruleset version from the API; missing data is labelled unavailable, never displayed as 0%. |

**Feature acceptance:** With a real held-back sample, the page reports the two rates and their denominators for the selected ruleset version; recomputation with cached model responses matches. A sampled caught and missed correction can be traced to the underlying finding or lack of one. Without pre-edit drafts, beat 6 is explicitly unavailable and no synthetic rate is presented as measured. Per-rule UI breakdown is an M2 cut; keep the JSON output. Browser Run/Export controls and example cards are P1.

## F8 · All-layer rule reconciliation and expanded checks

**Workstreams:** CONTRACTS, CHECKS, LLM, API, FE and DOCS. **Design:** [`docs/superpowers/specs/2026-10-16-all-rules-design.md`](../docs/superpowers/specs/2026-10-16-all-rules-design.md). **Matrix:** [`rules/all-rules-matrix.md`](rules/all-rules-matrix.md).

| Task | Independently reviewable deliverable |
|---|---|
| RULE-ALL | Track all 66 verbatim seed rules, reinstate PRIN-03/TERM-04/TERM-05, store layer-specific human drafts, and expose the actual implemented and pending status for each rule. Add evidence-backed checks and version the rule decisions without deleting earlier decisions. |

**Feature acceptance:** Literal, transcreation, word annotation and transcription drafts coexist and reload by source location; Gurmukhi remains BaniDB-sourced and read-only. Each rule has an applicable layer, required evidence, check or workflow mode, and a visible result or honest unavailable reason. Every implemented text finding quotes an exact span from the current authored field. A literal edit invalidates a dependent LAYER-08 result. Only the transcreation enters the current published-reference workflow until layer-specific publication records are designed. The all-rule matrix names which subchecks still lack source data or implementation; an active catalog entry alone is never called a pass. The expansion stays in progress while any check that can be implemented from available, trustworthy inputs is still pending.

## P1 tasks if capacity remains

| Task | Acceptance if pulled into the build |
|---|---|
| FE-10 · full browsing | Ang, raag and writer filters query the ingested corpus and open the chosen Sabad; status is correct. Requires P-05 full-data verification. |
| FE-11 · word lookup | Occurrences, prior renderings and similar lines are read-only, carry source IDs and never suggest a replacement transcreation. |
| LLM-11 · drift refinements | Duplicate/scope-change results show cited related rules and a warning; neither silently blocks a proposal. |
| LLM-12 · grammar hints | Only unambiguous code-derived ending-matra evidence yields a labelled nonblocking hint. |
| API-10 · override proposals | Overrides from at least two distinct entered names on one rule yield one drafted proposal with evidence and no automatic approval. |
| FE-12 · rule history | Version history and prefilled change proposals come from stored rule versions; no mockup placeholders. |
| FE-13 · eval controls | Browser Run/Export use an agreed API contract; run cannot modify live review data and export matches the selected cached eval result. |
| FE-14 · eval detail | Per-version comparison and caught/missed/false-flag examples come from real corrections and stored runs; no mockup placeholders. |

## Final integration acceptance

- [ ] `pnpm typecheck && pnpm test` pass; private data paths remain ignored in each clone.
- [ ] INT-02 runs the six-screen path against real BaniDB text, with code checks first, validated model/reference evidence, reasoned review, publish, rule activation and evaluation.
- [ ] Every visible rule count, ruleset version, reference ID, timing and rate comes from live data; no PDF placeholder is presented as a measurement.
- [ ] The six review-focus cases above have task-owned tests or a recorded manual verification at their named boundary.
- [ ] INT-03 records all six required video beats only when the needed SikhRI reference and pre-edit data exist. If they do not arrive, mark the affected beats incomplete in the demo checklist and submission rather than substituting test fixtures or claiming real metrics.
