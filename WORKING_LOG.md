# Working log

The complete task plan, plus what's done and what's pending. Protocol: see [`CLAUDE.md`](CLAUDE.md) → *How to work a task*.

- Edit **only your own section**, so this file never conflicts. The *Decisions* list is append-only; anyone may add to it.
- Task IDs: `P-` pre-build, `T-0x` together, `T-1x/2x` Person 1, `T-3x/4x` Person 2, `T-5x` together at the end.
- `FR-xx` refers to [`_docs/02-requirements.md`](_docs/02-requirements.md). Hours follow the plan in [`_docs/06-team-workflow.md`](_docs/06-team-workflow.md).
- When you finish a task: tick it, add the commit hash, move it to *Done*.

**Who is who:** Person 1 = _(name)_ · Person 2 = _(name)_

---

## Decisions

Append-only. Format: `- YYYY-MM-DD HH:MM · name · decision (why)`. Planning-phase decisions are in [`_docs/07-decisions.md`](_docs/07-decisions.md).

- _(none yet on build day)_

---

## Pre-build · anyone

### Done
- [x] Problem brief, scope and requirements → `_docs/01`, `_docs/02`
- [x] Logical and technical architecture → `_docs/03`
- [x] Ruleset v0.1 structured (66 rules) and resolved (10 active) → `_docs/rules/`
- [x] Reviewer questions document drafted → `_docs/reviewer-questions.md`
- [x] Data source research (BaniDB, SikhRI dictionary, translations) → `_docs/05`

### Next
- [ ] **P-01** Review the 4 flagged additions in the reviewer doc (Q1 option B, Q10, Q11, TERM-02 split), then send it to the reviewer
- [ ] **P-02** Receive reviewer answers → update `resolve.py`, regenerate, log in `_docs/07`
- [ ] **P-03** Receive SikhRI style guide → fold settled items (pronouns, capitalization, loaded words, register) into `resolve.py`
- [ ] **P-04** Ask SikhRI organizers for the sample: reference transcreations, review history with pre-edit drafts, ID scheme, format
- [ ] **P-05** Verify the `khalisfoundation/banidb-dev` image holds the full Guru Granth Sahib (count lines for source 1). If not, request a database copy from Khalis Foundation
- [ ] **P-06** Confirm with Khalis Foundation whether BaniDB's monthly contribution requirement applies to a hackathon prototype
- [ ] **P-07** Pick 1–3 demo Sabads: at least one with a Kartar/Karta name (TERM-02) and one opening with ੴ (TERM-03)
- [ ] **P-08** Get API keys for 2–3 LLM providers for the bake-off
- [ ] **P-09** Write the team's demo transcreations with planted issues, one per featured rule (TERM-01, TERM-02, LAYER-07, plus one override)

### Blocked
- P-04 waits on SikhRI organizers

---

## Hour 0–1 · together

- [ ] **T-01** Scaffold: Next.js (App Router, TS strict), Tailwind, shadcn/ui, pnpm, Vitest, `.env.example`, `.gitignore` (eko.db, data/sikhri-sample/, .env.local), scripts in `package.json`
- [ ] **T-02** `lib/types.ts`: Zod schemas for Finding, Packet, Rule, Decision, Draft, Proposal, DriftResult → **freeze**
- [ ] **T-03** `lib/db/schema.ts`: Drizzle tables per [`_docs/03`](_docs/03-architecture.md#core-records) incl. `llm_cache`, `embeddings` → **freeze**, first migration
- [ ] **T-04** `data/banidb/docker-compose.yml` + `scripts/ingest.ts`: read MariaDB with mysql2 → lines, words, stem keys in `eko.db` for the demo Sabads (FR-01)
- [ ] **T-05** Copy `rules.resolved.json` to `data/rules/`; `lib/rules` loader returning active rules only (FR-08)
- [ ] **T-06** Fill in names above; both confirm the ownership map in `CLAUDE.md`

---

## Person 1 · Checks

Owns `lib/checks/`, `lib/llm/`, `lib/rules/`, `lib/gurmukhi/`, `tests/`.

### Done
- _(none)_

### In progress
- _(none)_

### Next

**Hours 1–4: code checks, adapter, bake-off**
- [ ] **T-10** Golden tests for active rules from `_docs/rules/RULES_NOTES.md` §10 (transcreation cases only) → `tests/golden/` (FR-08)
- [ ] **T-11** TERM-01 code check: capitalized God/Lord and compounds → error
- [ ] **T-12** LAYER-07 code check: any ( ) [ ] in the transcreation → error
- [ ] **T-13** TERM-03 code check: IkOankar spelling variants; gloss at first use in the Sabad (comma/dash form) → warning
- [ ] **T-14** TERM-07 code check: non-preferred spellings (Shabad, Naam, Padshah, Parkash Purab); Bani titles exempt → warning
- [ ] **T-15** LAYER-06 code check: closed archaism list → flag
- [ ] **T-16** LLM adapter: Vercel AI SDK `generateObject` + Zod, `llm_cache` by hash(model, prompt version, packet), p-limit ≈ 4
- [ ] **T-17** Model bake-off: minimal pairs for TERM-01/02, PRIN-04, LAYER-06 across 2–3 models; pick fastest that passes; log in *Decisions*

**Hours 4–7: LLM checks, validator, pipeline**
- [ ] **T-18** `lib/gurmukhi`: NFC, tokenize, stem + ending matra; Divine-name matcher (Kartar/Karta family first)
- [ ] **T-19** TERM-02: packet with Divine names from the BaniDB line → LLM → flag; collapse detector (3+ names, one English word) → warning
- [ ] **T-20** PRIN-04: prefilter + LLM confirm → flag
- [ ] **T-21** LLM confirm tiers: TERM-01 lowercase/plural, TERM-07 substitutes ("the Word", "hymn"), LAYER-06 ambiguous words
- [ ] **T-22** Validator: drop findings whose span isn't in the draft or whose rule/reference IDs don't exist (FR-07)
- [ ] **T-23** Pipeline: changed tukks only; L1 returns first, LLM second (FR-06, FR-12)

**Hours 7–9: reference-based checks and drift**
- [ ] **T-24** CONS-01: compare against reference renderings (uses Person 2's T-38 lookup) → warning (FR-09)
- [ ] **T-25** L3 style check: cite reference renderings by ID (FR-09)
- [ ] **T-26** Drift check: contradiction (LLM), published-line replay, glossary collision → pass/warn/block with evidence (FR-17)

**P1 (only if time allows)**
- [ ] **T-27** Drift check duplicate and scope-change warnings
- [ ] **T-28** Grammar hints from unambiguous ending matra (FR-10)

### Blocked
- T-24, T-25 need the SikhRI sample (P-04) and T-38

---

## Person 2 · App and data

Owns `app/`, `lib/db/`, `lib/retrieval/`, `scripts/`, `data/`.

### Done
- _(none)_

### In progress
- _(none)_

### Next

**Hours 1–4: workspace and report card**
- [ ] **T-30** Sabad page: Gurmukhi read-only (Noto Sans Gurmukhi), ang, raag, writer, Rahao marked (FR-01)
- [ ] **T-31** Transcreation inputs per tukk or group of tukks; save with line IDs, author, time; no text-generating control anywhere (FR-02)
- [ ] **T-32** Name prompt stored in the browser, saved with every decision (FR-20)
- [ ] **T-33** Report card on mocked findings: rule ID and text, severity, highlighted span, explanation, references (FR-07)
- [ ] **T-34** Review actions: accept, override, waive; buttons disabled until a reason is typed (FR-11)
- [ ] **T-35** Mark ready for review; review queue (FR-03)

**Hours 4–7: wiring, publishing, sample data**
- [ ] **T-36** `/api/check` and `/api/check/llm` routes calling the pipeline; report card switches from mocks to real findings (FR-06)
- [ ] **T-37** Publish gate: blocked while any open error or flag; button says which rule blocks (FR-13). Publishing adds to the reference set, waived findings stay marked (FR-14)
- [ ] **T-38** SikhRI sample import → reference set; map IDs by normalized Gurmukhi if they differ from BaniDB; English embeddings via Transformers.js; `lib/retrieval` lookup by stem key and by similarity
- [ ] **T-39** BaniDB attribution and logo in the footer (FR-21)

**Hours 7–9: rules, loop, eval**
- [ ] **T-40** Rules page: all 66 rules with level, layers, severity, decision, provenance; active marked (FR-15)
- [ ] **T-41** Propose a rule: free text, example, reason → drift check (FR-16)
- [ ] **T-42** Show drift results with evidence; approve or override a block with a reason; ruleset version bump and provenance (FR-17, FR-18)
- [ ] **T-43** `scripts/eval.ts` backtest on held-back pre-edit drafts → `eval_runs`; eval card with catch rate, false-flag rate, sample size, per ruleset version (FR-19)

**P1 (only if time allows)**
- [ ] **T-44** Proposals drafted from repeated overrides by 2+ people (FR-16b)
- [ ] **T-45** Browse the full Guru Granth Sahib by ang, raag, writer (FR-04)

### Blocked
- T-38, T-43 need the SikhRI sample (P-04). If it's late, do T-40–T-42 first.

---

## Hour 9–10 · together

- [ ] **T-50** Integration checklist (below)
- [ ] **T-51** Seed the demo Sabads and drafts (`scripts/seed-demo.ts`)
- [ ] **T-52** Record the 5-minute video: the six beats in [`_docs/01-problem-statement.md`](_docs/01-problem-statement.md#what-the-video-must-show)

### Integration checklist
- [ ] Demo Sabad loads from `eko.db` with correct Gurmukhi
- [ ] Saving a transcreation shows code findings, then LLM findings
- [ ] Every finding cites a rule and a quoted span; no finding says "incorrect"
- [ ] Override with a reason → publish succeeds; without a reason → blocked
- [ ] Propose a rule → drift check → approve with a reason → next check uses the new version
- [ ] Eval card shows catch and false-flag rates with sample size
- [ ] BaniDB attribution visible

### Cut order if short on time
1. CONS-01, if the SikhRI sample is late (the reason flow still shows on any flag)
2. Duplicate and scope-change warnings in the drift check
3. Per-rule breakdown on the eval card
4. LAYER-06's confirmation tier for ambiguous words

---

## Requests between people

Format: `- from → to · what's needed · task it blocks`

- _(none)_
