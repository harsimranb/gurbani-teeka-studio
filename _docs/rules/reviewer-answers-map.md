# Reviewer answers: fold-in map (P-02 / P-03)

Use when the reviewer's answers to [`../reviewer-questions.md`](../reviewer-questions.md) (Q1-Q15) or SikhRI's style guide arrive. An unanswered question keeps its **current call**, so only non-current answers need a change. Written against `resolve.py` as of 2026-10-16 (line numbers drift; search the named symbol). Generator output was confirmed byte-identical to the committed `rules.resolved.json` on that date.

## Where a change can land

| Kind | Where | Note |
|---|---|---|
| Scope, severity, layers, blocking, decision text | `resolve.py`: a `res("RULE-ID", ...)` call, `REMOVED_BY_TEAM` (~l.122), `LITERAL_ONLY` (~l.130), the `R["LAYER-08"]` override (~l.137), the layers loop (~l.141), `DEFAULT_SEV` (l.21), `global_decisions` (~l.182), `INTERIM` (l.148, currently `[]`) | The only place Rule 8 allows. Rule text is never edited. |
| Prefilter patterns, keyword lists | `rules.seed.json` `prefilter` (a proposal field, not rule text) | `resolve.py` has no prefilter hook today. Open choice: (a) add a small `prefilter=` override to `resolve.py` (cleanest for Rule 8), or (b) edit the seed prefilter and log a D-entry. Decide once, then apply to every row below marked **SEED**. |
| How a finding is produced (promotion, thresholds, exemptions) | `lib/engine/checks/*.ts`, `pipeline.ts` | CHECKS stream. |
| What the model is told | `lib/engine/llm/prompts/confirm.ts` (`GUIDANCE`, `CONFIRM_GUIDANCE_VERSION`), `term02.ts` (`term02-v1`), `style.ts` | LLM stream. Bump the prompt/guidance version. |
| A new check the draft has no rule for | A proposal (free text, FR-17), approved in the app, **not** `resolve.py` | Needs the drift check; may report `not_evaluable`. |
| Unknown / waiting on someone | New row in [`../08-open-questions.md`](../08-open-questions.md) | |

**Effects every `resolve.py` edit has**
- `rule.resolution.decision` is passed verbatim into the model prompts (`confirm.ts`, `term02.ts`) and into the cache key (`data/cache/`). Any decision-text edit on a model-checked rule (PRIN-04, TERM-01, TERM-02, TERM-07, LAYER-06, CONS-01) re-runs cached judgments and may shift bake-off results. Notify the LLM session.
- Severity is one value per rule. A finer split (for example a different severity for one sub-check) needs `makeFinding(..., severity)` in the check, as TERM-07's first-use hint already does. A model can lower but never raise the rule severity (`ownModelFinding`, `pipeline.ts`).
- Blocking is computed: `error`/`flag` on an active rule blocks; `warning`/`hint`/`lens` do not. Override with `blocks_publish=` only if the label and the gate must differ.
- Tests that read the resolved file: `lib/engine/rules/rules.test.ts` (`EXPECTED_SEVERITY`, "eight" rules, `.toBe(7)`), `lib/server/ingest/rules.test.ts` (66 rules, 10 active), `lib/contracts/fixtures/index.ts` (`rulesFixture`) and everything importing it: `lib/engine/checks/{golden,pipeline,generic,term03,term07,validate}.test.ts`, `lib/engine/llm/{judge,prompts/*}.test.ts`, `lib/engine/{drift,retrieval,gurmukhi}/*.test.ts`, `lib/contracts/{domain,fixtures,api}.test.ts`, `lib/server/db/repo.test.ts`, `lib/client/api.test.ts`, `scripts/engine/bakeoff*.test.ts`. Below, "active-set tests" means `rules.test.ts` + `ingest/rules.test.ts`.

## Q1. Scope (TERM-04, TERM-05, PRIN-03)

Current: A. All three removed (`REMOVED_BY_TEAM`).

| Answer | `resolve.py` | Code / tests | New rule or OQ |
|---|---|---|---|
| B (keep TERM-04/05) | Delete `TERM-04` and `TERM-05` from `REMOVED_BY_TEAM`; the earlier `res("TERM-04")` / `res("TERM-05")` (p0_check, error) take effect. Add both to the layers loop so layers = `["transcreation"]`. Keep PRIN-03 removed. | Add `genericCheck("TERM-04")`, `genericCheck("TERM-05")` to `CODE_CHECKS` (`pipeline.ts` l.18; without it the rule is silently skipped). Seed prefilters already exist. Optionally add `GUIDANCE["TERM-04"/"TERM-05"]` in `confirm.ts` (TERM-05 should pass a bare "Vedas" when the Gurmukhi line names it). Active-set tests: 8 -> 10 checked, 10 -> 12 active; `EXPECTED_SEVERITY` gains both (error). | None. The broader "Judeo-Christian undertones" clause stays a lens until Q14(3). |
| C | Depends on text. | n/a | OQ row if the answer changes PRIN-03 (publication gate); PRIN-03 needs a `publication`-layer check that does not exist. |

## Q2. "God" and "Lord" (TERM-01)

Current: (1) A, Divine referent only. (2) A, lowercase/plural acceptable for worldly or other-tradition referents.

| Answer | `resolve.py` | Code / tests | New rule or OQ |
|---|---|---|---|
| (1) B, ban any use | `res("TERM-01")` decision text: drop "referent" wording. Severity stays `error`. | `term01Check` (`generic.ts` l.32): promote every hit, including the `llm_confirm` lowercase tier, to `flag`. Tests: `generic.test.ts`, `golden.test.ts`, `confirm.test.ts` (`GUIDANCE["TERM-01"]` becomes unused), `bakeoff-cases.ts` TERM-01 pairs, `lib/client/mock-checks.ts` (mock only). | None. |
| (2) B, raise lowercase | Decision text. If it should be weaker than Must-fix, no `resolve.py` option (single severity). | Promote the lowercase tier to `flag` in `term01Check`, passing a lower `severity` to `makeFinding` via `runPrefilter`. Same tests as above. | OQ for the severity of lowercase hits. |
| (2) C, per word | Decision text lists the words. | Per-word handling in `term01Check` or `GUIDANCE["TERM-01"]` (bump `CONFIRM_GUIDANCE_VERSION`). | None. |

## Q3. Divine names (TERM-02, LAYER-10)

Current: (2) A, Kartar/Karta must keep "Creator". (3) A, collapse warning at 3+ names. (1) table is open.

| Answer | `resolve.py` | Code / tests | New rule or OQ |
|---|---|---|---|
| (1) table filled | `res("TERM-02")` decision text: replace "Narrowed until SikhRI supplies the Divine-name table" with the table's scope. Severity unchanged (`flag`). | The table has no home yet. Name list = Gurmukhi alternatives in the seed TERM-02 prefilter (**SEED**; read by `divineNameFamilies`, `gurmukhi/index.ts`); the attribute table would be new data plus a rewrite of `term02.ts` (`term02-v1`). Take Gurmukhi from BaniDB, never typed by hand. Tests: `term02.test.ts`, `gurmukhi.test.ts`, `judge.test.ts`, `pipeline.test.ts`, `golden.test.ts`, `bakeoff-cases.ts`, `fixtures/check-result.json`. | OQ: where the table lives (data file vs rule text); possibly new per-name rules via proposals. |
| (2) B, not always | Decision text with the exception. | `term02.ts` "attribute" sentence and conditions; bump version. | OQ if exceptions need a data source. |
| (3) B, 2+ names | Decision text "3+" -> "2+". | `distinctFamilies >= 3` in `pipeline.ts` (~l.123) and `term02.ts` (~l.27), the `distinctFamilies ?? 0) < 3` collapse gate in `lib/engine/llm/judge.ts` (~l.81), plus "three or more" in the system prompt; tests `term02.test.ts`, `pipeline.test.ts`, `judge.test.ts`. | None. |
| (3) C, drop collapse | Decision text: remove check (b). | Remove the `|| distinctFamilies >= 3` packet condition, `sabad` context and the "collapse" subcheck from `term02.ts`, and the collapse gate in `judge.ts` (~l.81); tests `term02.test.ts`, `judge.test.ts`. | None. |

## Q4. IkOankar (TERM-03)

Current: (1) A Sabad, (2) A comma/dash apposition, (3) No, (4) Yes (exact spelling only).

| Answer | `resolve.py` | Code / tests | New rule or OQ |
|---|---|---|---|
| (1) B/C, Bani or publication | Decision text; `global_decisions` "Review unit is the Sabad" (~l.188). | `firstUseSeen` in `term03.ts` is per Sabad; `CheckInput` carries one Sabad only, so Bani/publication scope needs a contract change (breaking, M1-M3 checkpoint) and a new `codePhaseScope`. TERM-07's first-use hint has the same scope. | OQ if only the style guide settles it. |
| (2) B/C, footnote or no gloss | Rewrite the `R["TERM-03"]["decision"]` override (~l.143). | Remove the `first-use-gloss` finding from `term03.ts` (keep spelling). Tests: `term03.test.ts`, `golden.test.ts`, `pipeline.test.ts`. | None. |
| (2) D, other format | Same decision text. | Adjust `GLOSS_AFTER_TOKEN` (`term03.ts` l.6). | None. |
| (3) Yes, add "1Force, the One" | Decision text. | Extend `GLOSS_AFTER_TOKEN`; tests as above. | None. |
| (4) No, also accept ___ | Decision text. | Accepted-spelling list in `term03.ts` (today the seed action is `flag_if_not_exact:IkOankar`, **SEED**). | None. |

## Q5. Core Sikh terms (TERM-07)

Current: (1) A list as is, (2) A Bani titles exempt, (3) A substitutes need a reason, (4) A first-use gloss = hint only.

| Answer | `resolve.py` | Code / tests | New rule or OQ |
|---|---|---|---|
| (1) B, changes | `res("TERM-07")` decision text. | Spelling patterns are **SEED**. New glossed terms are read from the verbatim rule text by `parseGlossedTerms` (`term07.ts`), so an addition not in the rule text is a pattern-only addition. Tests: `term07.test.ts`, `golden.test.ts`. | New rule via proposal if a term is outside TERM-07's text. |
| (2) B, no exemption | Decision text ("titles of Banis ... exempt"). | Empty `BANI_TITLE_EXEMPTIONS` (`term07.ts` l.7). | None. |
| (3) B, Must-fix | Raising TERM-07 severity also raises spellings; decision text. | Set rule severity to the stronger level and pass `severity: "warning"` to the spelling findings in `term07.ts`, or accept the whole rule at the stronger level. Active-set tests (`EXPECTED_SEVERITY`). | OQ if a split is wanted. |
| (3) C, do not raise | Decision text. | Drop the `llm_confirm` branch for TERM-07 (`term07.ts`; seed pattern 5 is **SEED**); `GUIDANCE["TERM-07"]` unused. | None. |
| (3) D, per word | Decision text. | Word list in `GUIDANCE["TERM-07"]` or pattern edit. | None. |
| (4) B, expected | Decision text. | Remove `severity: "hint"` in `firstUseHints` (`term07.ts` l.36) so it takes the rule severity (warning). | None. |
| (4) C, not expected | Decision text. | Stop calling `firstUseHints`. | None. |

## Q6. Repeated words (TERM-08)

Current: A. TERM-08 inactive (`LITERAL_ONLY`).

| Answer | `resolve.py` | Code / tests | New rule or OQ |
|---|---|---|---|
| B, all repeated words | Remove `TERM-08` from `LITERAL_ONLY`; set `res("TERM-08", ..., layers=["transcreation"])` and add it to the layers loop. Severity `warning` already. | No check exists. Needs a new code or model check that aligns Gurmukhi stem keys (`toWords`, `gurmukhi/index.ts`) to English renderings; entry in `CODE_CHECKS` or a new prompt. Active-set tests 8 -> 9 and 10 -> 11. | OQ: alignment method (same limit as OQ-17). |
| C, divine names and core terms only | Leave TERM-08 inactive; add the sentence to `res("TERM-02")` / `res("TERM-07")` decisions. | Extra sub-check in `term02.ts` and a Sabad-scoped comparison for TERM-07. | None. |

## Q7. Single correct reading (PRIN-04)

Current: two phrases raised, "true/real meaning" checked in context; last two rows blank.

| Answer | `resolve.py` | Code / tests | New rule or OQ |
|---|---|---|---|
| Add "this clearly means", "properly understood" (Yes) | `res("PRIN-04")` decision text. | New patterns are **SEED** (`llm_confirm`), plus `GUIDANCE["PRIN-04"]` in `confirm.ts` (bump version). Tests: `generic.test.ts`, `confirm.test.ts`, `golden.test.ts`, `bakeoff-cases.ts`. | None. |
| Any current phrase answered No | Decision text. | Remove or narrow the matching seed pattern (**SEED**). | None. |
| Other wording | Decision text. | New pattern (**SEED**). | A claim with no fixed wording: proposal rule. |

## Q8. Archaic words (LAYER-06)

Current: (1) A Must-fix, (2) C no register check.

| Answer | `resolve.py` | Code / tests | New rule or OQ |
|---|---|---|---|
| (1) B, Needs a reason | `res("LAYER-06", severity="warning")`; blocking follows automatically. | Active-set test `EXPECTED_SEVERITY["LAYER-06"]`; `golden.test.ts`, `pipeline.test.ts`, `generic.test.ts` severities; model findings are capped at the rule severity. | None. |
| (1) C, some allowed | Decision text. | Closed list = seed pattern 1 (**SEED**); ambiguous tier = `GUIDANCE["LAYER-06"]`. | None. |
| (2) A or B, register | Remove "Treats LAYER-06 as settling the archaism part of the ... 'Register' question" from the decision (~l.92). | None in the existing checks. | New proposal rule for plain or elevated register (judgment, `free_text` packet); OQ for the pass criteria. |

## Q9. Brackets (LAYER-07)

Current: (1) A square brackets count, (2) A no exceptions.

| Answer | `resolve.py` | Code / tests | New rule or OQ |
|---|---|---|---|
| (1) B, square brackets allowed | `res("LAYER-07")` decision text (~l.94). | `layer07Check` (`generic.ts` l.38) promotes every hit to `flag`; skip hits whose text is `[` or `]`. Tests: `generic.test.ts`, `golden.test.ts`, `pipeline.test.ts`, `domain.test.ts` / `findings.json` fixtures that cite LAYER-07. | None. |
| (2) B, exceptions | Decision text lists them. | An exemption list in `layer07Check` (needs a defined pattern, for example references). | OQ to define the exception. |

## Q10. Mirroring the literal (LAYER-08)

Current: A. Inactive (`R["LAYER-08"]` override).

| Answer | `resolve.py` | Code / tests | New rule or OQ |
|---|---|---|---|
| B, Guidance only | Replace the override with `scope="review_lens", severity="lens"`. | None (not checked). Active-set test counts unchanged. | OQ: SikhRI literals (P-04 / DATA-06) if shown as context. |
| C, Needs a reason | Delete the override (~l.137); restore `scope="p0_check"`, `severity="warning"`, `layers=["transcreation"]`; the 0.85 token-similarity decision text applies. | New `layer08Check` in `lib/engine/checks/` and a `CODE_CHECKS` entry; `CheckInput` needs the literal text (additive contract field plus DATA import). Active-set tests 8 -> 9, 10 -> 11. | OQ-03 (sample format) and a literals source; threshold calibration on the sample. |

## Q11. Departing from the reference (CONS-01/02/03)

Current: (1) A written reason clears it, (2)/(3) informational.

| Answer | `resolve.py` | Code / tests | New rule or OQ |
|---|---|---|---|
| (1) B, second person accepts | Decision text on CONS-01/03 (~l.103-111). | Workflow, not a rule: API-04 decision flow and `lib/contracts/api.ts`. Conflicts with Hard rule 7 (no roles); needs a team decision. | New OQ plus a D-entry before any change. |
| (1) C, other | Decision text. | Depends. | OQ. |
| (2)/(3) where reasons live; Eko can read it | No change. | Feeds `lib/engine/retrieval/`, DATA-06 import. | Answers OQ-13 and OQ-17; unblocks CHK-12 (deterministic CONS-01). |

## Q12. Strictness by level (all rules)

Current: A. MUST -> flag/error, SHOULD -> warning, GUIDE -> lens.

| Answer | `resolve.py` | Code / tests | New rule or OQ |
|---|---|---|---|
| B, some MUST non-blocking | Per named rule, `severity="warning"` (or keep `severity` and set `blocks_publish=False`). Today's blockers: PRIN-04 flag, TERM-01 error, TERM-02 flag, LAYER-06 flag, LAYER-07 error. | `EXPECTED_SEVERITY` in `rules.test.ts`; gate tests that assume a blocker (`golden.test.ts`, `pipeline.test.ts`, FE `components/published/GateColumn.tsx` data). | None. |
| C, some SHOULD block | Per named rule (TERM-03, TERM-07, CONS-01): `severity="flag"` or `error`, or `blocks_publish=True`. | Same tests; CONS-01 already needs a reason before publish (`publish_requires_reason`). | None. |
| Level-wide change | Edit `DEFAULT_SEV` (l.21). | Mostly moot: every checked rule sets `severity=` explicitly. | None. |

## Q13. Eko's wording

Current: A, "differs from reference rendering".

| Answer | `resolve.py` | Code / tests | New rule or OQ |
|---|---|---|---|
| B, "published rendering" / C, other | PRIN-04 and CONS-01 decision text (~l.34, ~l.105) and `global_decisions` (~l.190). | `lib/engine/llm/prompts/style.ts` and `style.test.ts` (plus a synthetic explanation string in `lib/engine/checks/pipeline.test.ts`); UI strings in `components/` if added since; `NON_NEUTRAL` guard in `lib/engine/llm/guards.ts` stays. PRIN-04 neutral wording (Hard rule 5) is unchanged. | None. |

## Q14. Gaps (pronouns, capitalization, loaded words)

Current: no checks; `INTERIM = []` (l.148), pronoun check EKO-PRON-01 removed.

| Answer | `resolve.py` | Code / tests | New rule or OQ |
|---|---|---|---|
| (1) A/B/C, pronoun convention | Nothing for a free-text rule. | None until approved. | New proposal rule(s) for the pronoun and gendered third person; closes OQ-02 part. Update `RULES_NOTES.md` §5 only if DOCS agrees. |
| (2) capitalization list | Nothing. | None. | Proposal rule (capitalization list); closes OQ-02 part. |
| (3) Avoid words | Update `res("TERM-04")` decision (the "Judeo-Christian undertones" clause) only if the team reinstates TERM-04 (see Q1 B). | None. | Proposal rule(s) listing the "Avoid" words; "Use with care" words as a lower-severity proposal; "Fine" needs nothing. Drift check applies. |

## Q15. Anything missed

New check requests are proposals (FR-17) or OQ rows; none go in `resolve.py` unless they change an existing rule's application.

## Style guide (P-03) intake

| Style-guide item | Settles | Lands in |
|---|---|---|
| Pronouns for the Divine; gendered third person | OQ-02, Q14(1) | Proposal rule(s); record in `07-decisions.md`; close OQ-02 part. |
| Capitalization (Wisdom, Divine, Guru, Will) | OQ-02, Q14(2) | Proposal rule. |
| Loaded words beyond God, Lord, scripture, canon | OQ-02, Q14(3), TERM-04 general clause, TERM-06 | Proposal rules; or `resolve.py` TERM-04 decision if reinstated (Q1 B). |
| Register (plain vs elevated; archaisms) | OQ-02, Q8(2) | `res("LAYER-06")` decision (drop the "Register" sentence) plus a proposal rule. |
| Divine-name table; untranslated names | Q3(1), TERM-02 | `res("TERM-02")` decision; seed Gurmukhi list (**SEED**); `term02.ts`. |
| IkOankar first-use scope and gloss format | Q4 | `res("TERM-03")` override text; `term03.ts` if the format changes. |
| Core-term list, Bani/Gurmat glossing | Q5, TERM-07 | `res("TERM-07")`; **SEED** patterns. |
| Preferred renderings / glossary with term mappings | OQ-13, OQ-17, Q11(3), CONS-01 | Unblocks CHK-12 and glossary-collision drift; DATA-06 import. |
| Internal style record / reasons log | Q11(2)(3), OQ-03 | OQ-03 / OQ-17 answer. |
| Address and voice, length, Rahau, imagery (draft Section 8) | Not in the 15 questions | New OQ rows or proposal rules; no `resolve.py` change. |

## Fold-in procedure

1. Edit `_docs/rules/resolve.py` (never `rules.seed.json` rule text; prefilter edits per the choice in "Where a change can land").
2. `python3 _docs/rules/resolve.py` (macOS) or `py -3 _docs/rules/resolve.py` (Windows).
3. `git diff _docs/rules/rules.resolved.json`; confirm only the intended rules changed. Update active-set tests (`EXPECTED_SEVERITY`, 8 and 10 counts) to match.
4. Engine edits from the tables above, then `pnpm typecheck && pnpm test`.
5. Existing databases: `seedResolvedRules` writes ruleset version 1 and `saveRuleset` throws if stored version 1 differs ("differs from its stored snapshot"). Reset `eko.db` and rerun `pnpm ingest`, or bump the version in `lib/server/ingest/rules.ts` and `lib/contracts/fixtures/index.ts` together.
6. Record a D-entry in `_docs/07-decisions.md` (the next free D-number; check the file first) and a Decisions row in `WORKING_LOG.md`; close the OQ row in `08-open-questions.md` (OQ-01 / OQ-02) with the date and where it was applied; tick P-02 / P-03; update `04-ruleset.md` status line.
7. Notify the LLM session when any of these change: TERM-02 (collapse threshold, attribute rule, name list), PRIN-04, TERM-01 (lowercase tier), TERM-07 (substitutes), LAYER-06 tiers, CONS-01 wording, or any decision text on those rules (it feeds prompts and the cache key). Bump `CONFIRM_GUIDANCE_VERSION` / the prompt version where the guidance changed.

## Reviewer document vs repo copy

`~/Downloads/Eko Ruleset Review.md` is older than `_docs/reviewer-questions.md`: the repo copy adds a header link note and reworded text in the severity table ("Needs a reason" row), the CONS-01 row, and the current calls of Q11 and Q12 (CONS-01 publish-reason, D-56/D-57); all other differences are whitespace.
