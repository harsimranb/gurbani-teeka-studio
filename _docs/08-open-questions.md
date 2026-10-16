# 08 · Open questions

What's still unknown, who's chasing it, and what it blocks. Close a question by writing the answer, the date, and where it was applied (usually a line in [07-decisions.md](07-decisions.md)).

| # | Question | Ask | Blocks | Status |
|---|---|---|---|---|
| OQ-01 | The 15 judgment-call questions (scope, God/Lord, Divine names, IkOankar, core terms, repeated words, single-reading claims, archaisms, brackets, mirroring, departures, severity, wording, gaps) | Reviewer, via [reviewer-questions.md](reviewer-questions.md) | Final severities; TERM-02 breadth | Open: doc drafted, not yet sent (P-01) |
| OQ-02 | Style guide: pronouns for the Divine, capitalization, loaded words beyond God/Lord/scripture/canon, register | SikhRI team (sharing separately) | Possible new rules | Open (P-03) |
| OQ-03 | Sample format: reference transcreations and review history, ID scheme, whether pre-edit drafts are included | SikhRI organizers | Claims about SikhRI's existing style corpus and real-corrections backtest (beat 6) | Open (P-04); Harsimran confirmed neither dataset received as of 2026-10-16 |
| OQ-04 | Does `khalisfoundation/banidb-dev` hold the full Guru Granth Sahib? | Check locally; else Khalis Foundation | Ingest beyond the demo Sabads | Open (P-05) |
| OQ-05 | May this prototype use/show only 1–3 demo Sabads and privately share an exported fixture, given BaniDB's entire-data-use and redistribution terms? Do the refresh, logo and monthly contribution obligations apply? | Khalis Foundation | C-03 data handling, demo/release terms, FR-21 | Open (P-06); keep exports out of Git pending an answer |
| OQ-06 | Which LLM is fast enough and accurate on the minimal pairs? | Team bake-off (LLM-02) | L2 prompts tuning | Open |
| OQ-07 | Drift threshold: how many approved reference lines may a proposed rule flag before it's blocked? | Team, then reviewer | FR-17 tuning | Provisional build value: block when affected count is at least 1; show IDs/count. Reviewer may revise |
| OQ-08 | Should the 4 additions in the reviewer doc stay (Q1 option B, Q10, Q11, TERM-02 split)? | Harsimran | Sending the reviewer doc | Open (P-01) |
| OQ-13 | What source defines a preferred rendering for glossary-collision blocking: a supplied SikhRI glossary/style guide, references with explicit preference, or neither until available? | SikhRI team and Harsimran | LLM-10 drift check | Open; a missing source must be shown as unavailable, not pass |
| OQ-14 | Which reviewer edits count in the backtest denominator, and how are changed spans matched to findings when the review history lacks explicit span annotations? | SikhRI team and Harsimran | EVAL-01/02, video beat 6 | Open; decide before reporting a real rate |
| OQ-16 | Who is Person A and Person B, do they have separate configured clones, and how will both access the local UI PDF and private BaniDB fixture? | Harsimran | C-05 ownership setup, P-10, M0 | Open; settle before the builders split |
| OQ-17 | Does the reference sample include explicit term-to-rendering alignments or a preferred-rendering glossary? Line-level English alone cannot prove which English word renders a specific Gurmukhi stem. | SikhRI team; Person A checks sample | CHK-12 deterministic CONS-01 | Open; keep CHK-12 silent without an explicit mapping and use only cited English-reference style comparisons |

## Answered

| # | Question | Answer | Date |
|---|---|---|---|
| — | Which translation layer? | Transcreation only (D-03) | 2026-10-16 |
| — | Gurmukhi source? | BaniDB, local database copy (D-10) | 2026-10-16 |
| — | Is sending SikhRI data to a hosted model OK? | Yes; performance matters more (D-32) | 2026-10-16 |
| — | Roles? | None in this build (D-04) | 2026-10-16 |
| OQ-09 | CONS-01 departures require a recorded reason before publish; warning severity stays (D-56) | 2026-10-16 |
| OQ-10 | Eko-published references have equal source weight to SikhRI-supplied references, with source/exception marks retained (D-57) | 2026-10-16 |
| OQ-11 | Strict `FindingBatch` and `DriftAssessment` outputs allowed; no translation text (D-59) | 2026-10-16 |
| OQ-12 | Any free-text proposal may be approved and attempted; uncheckable packets report `not_evaluable` with no invented finding (D-60) | 2026-10-16 |
| OQ-15 | Clock hours are advisory; milestone order and acceptance remain (D-61) | 2026-10-16 |
