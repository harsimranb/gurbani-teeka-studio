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
- **D-33 · 2026-10-16 · Local embedding model (Transformers.js) for the proof of concept.** Good enough, no key needed. *`lib/retrieval`.*
- **D-34 · 2026-10-16 · Gurmukhi analysis is done by code; the LLM judges only English against structured evidence.** LLMs are unreliable on Gurbani morphology. *Check engine.*

## Team

- **D-40 · 2026-10-16 · Two people, one build day, split by folder with frozen contracts; pair for the last hour.** Avoids merge conflicts between two agents. *`_docs/06`, `CLAUDE.md`.*
- **D-41 · 2026-10-16 · `WORKING_LOG.md` holds the full task plan; each person edits only their section.** *Repo root.*
