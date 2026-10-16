# 07 · Decisions

Planning decisions with their reasons. Newest last. Build-day decisions go in the *Decisions* section of [`WORKING_LOG.md`](../WORKING_LOG.md) first; copy lasting ones here.

Format: **ID · date · decision.** Why ("Team call" where the team gave no further reason). *Affects.*

## Scope and product

- **D-01 · 2026-10-16 · Team BJ13 builds for SikhRI's sikhri-1 (Eko).** The team holds the slot. *All.*
- **D-02 · 2026-10-16 · Eko never generates or suggests translation text; it only reviews.** SikhRI's brief: "humans write". Also keeps the AI's output checkable. *Hard rule 1, LLM boundary.*
- **D-03 · 2026-10-16 · Review the English transcreation only.** Team call; literal translation, annotation and transcription come later. *Ruleset (7 literal-layer rules inactive), FR-10.*
- **D-04 · 2026-10-16 · No roles, no sign-in; anyone can write, review, propose and approve, always with a reason.** Team call; roles are future scope. *FR-11, FR-16, FR-18, FR-20.*
- **D-05 · 2026-10-16 · Rule proposals drafted from repeated overrides are P1; free-text proposals are P0.** Team call. *FR-16, FR-16b.*
- **D-06 · 2026-10-16 · No offline demo mode.** Team call; the LLM cache stays for speed and cost. *FR list.*
- **D-07 · 2026-10-16 · Translator utilities are P1.** Team call; return to them if time allows. *FR-05.*
- **D-08 · 2026-10-16 · Learning loop with a drift check is P0; a drift block can be overridden with a reason.** The brief requires the ruleset to grow without drifting. *FR-17, FR-18.*

## Data

- **D-10 · 2026-10-16 · Gurmukhi comes from BaniDB, ingested from a local copy of its database, not the API.** Offline, no rate limits. *Ingest, `_docs/05`.*
- **D-11 · 2026-10-16 · SikhRI's dictionary and published translations aren't used.** Web only, all rights reserved, no API; terms forbid scraping. *Grammar hints moved to P1.*
- **D-12 · 2026-10-16 · BaniDB's English translations are never used as style references.** They aren't SikhRI's voice. *Retrieval.*
- **D-13 · 2026-10-16 · SikhRI's style guide arrives separately; reviewer questions don't restate it.** *Reviewer doc, open questions.*

## Ruleset

- **D-20 · 2026-10-16 · Rule text stays verbatim; judgment calls live in `resolve.py`.** Reviewable and reversible. *`_docs/rules/`.*
- **D-21 · 2026-10-16 · Severity follows the draft's strength table (MUST → error/flag, SHOULD → warning, GUIDE → lens).** *All active rules.*
- **D-22 · 2026-10-16 · Removed TERM-04, TERM-05, PRIN-03 and the interim pronoun check EKO-PRON-01.** Team call. *Ruleset; reviewer doc Q1 asks for confirmation.*
- **D-23 · 2026-10-16 · Ambiguous rules resolved by judgment calls (TERM-01 scope, TERM-02 narrowed to the Kartar family plus a collapse detector, gloss format, CONS-01/02/03 interplay, LAYER-06 archaisms).** Unblocks the build; the reviewer can overturn. *`_docs/04`, reviewer doc.*
- **D-24 · 2026-10-16 · Neutral wording: "differs from reference rendering", never "incorrect".** Follows PRIN-04. *UI copy, prompts.*

## Technology

- **D-30 · 2026-10-16 · TypeScript full stack: Next.js, SQLite with Drizzle, one process.** One language, one deploy, one file of state. *`_docs/03`.*
- **D-31 · 2026-10-16 · Provider-agnostic LLM layer (Vercel AI SDK + Zod); pick the fastest model that passes the bake-off.** *`lib/llm`.*
- **D-32 · 2026-10-16 · Sending SikhRI data to hosted models is acceptable; performance matters more.** *NFRs.*
- **D-33 · 2026-10-16 · Local embedding model (Transformers.js) for the proof of concept.** Good enough, no key needed. *`lib/engine/retrieval`.*
- **D-34 · 2026-10-16 · Gurmukhi analysis is done by code; the LLM judges only English against structured evidence.** LLMs are unreliable on Gurbani morphology. *Check engine.*

## Team

- ~~**D-40** · Two people split by folder (Person 1 checks, Person 2 app).~~ Superseded by D-42.
- ~~**D-41** · `WORKING_LOG.md` sections per person.~~ Superseded by D-47.
- **D-42 · 2026-10-16 · Work is split into feature workstreams (CONTRACTS, CHECKS, LLM, EVAL, DATA, API, FE, PLATFORM), each owning its own folders.** Lets each stream be built, tested and reassigned independently. *`_docs/06`, `.ownership.json`.*
- **D-43 · 2026-10-16 · Person A owns the engine streams (CHECKS, LLM, EVAL); Person B owns the app streams (DATA, API, FE, PLATFORM).** Streams that talk most stay with one person, leaving four cross-person seams. *`_docs/06`.*
- **D-44 · 2026-10-16 · The engine is pure: `lib/engine/` never touches the shared database; the app imports only `lib/engine/index.ts`.** Removes most cross-person dependencies. *`_docs/03`, `CLAUDE.md` hard rule 11.*
- **D-45 · 2026-10-16 · Engine-private storage stays in files: LLM cache and embeddings in `data/cache/`, eval output in `data/eval/latest.json`; stems are computed in memory, not stored at ingest; word lookup is an in-memory index instead of SQLite FTS5.** Keeps the shared schema owned by DATA alone. *`_docs/03`.*
- **D-46 · 2026-10-16 · Contracts (`lib/contracts/`: domain, api, ports, fixtures) are agreed in hour 0; additive changes any time in contract-only commits, breaking changes only at checkpoints.** *`_docs/06`, `CLAUDE.md`.*
- **D-47 · 2026-10-16 · `WORKING_LOG.md` is organized by workstream, with a *Needs* line per task and a *Seams* table the provider ticks.** *Repo root.*
- **D-48 · 2026-10-16 · A pre-commit hook blocks commits outside your streams' folders (`.ownership.json`, `scripts/dev/check-ownership.mjs`).** AI agents drift into neighbouring folders; the hook makes it a blocked commit instead of a merge conflict. *`.githooks/`.*
- **D-49 · 2026-10-16 · All known packages are installed in hour 0; afterwards only Person B adds packages.** Avoids lockfile conflicts. *`_docs/06`.*
- **D-50 · 2026-10-16 · `_docs/rules/rules.resolved.json` is read in place by the DATA seed and engine tests; nothing copies it.** One source of truth. *`CLAUDE.md`.*
- **D-51 · 2026-10-16 · Integration checkpoints M0–M3 at hours 1, 3, 6 and 8; cuts are decided at M2.** Surfaces integration problems early. *`_docs/06`.*
