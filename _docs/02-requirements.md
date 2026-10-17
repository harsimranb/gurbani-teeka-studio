# 02 · Requirements

What Eko must do for the hackathon build (P0) and what waits (P1). Each P0 requirement has a "done when" check to run before calling it finished. The **Beat** column refers to the video beats in [01-problem-statement.md](01-problem-statement.md#what-the-video-must-show). Tasks implementing each FR are in [`WORKING_LOG.md`](../WORKING_LOG.md).

## Scope in one line

Eko reviews human-authored literal translation, transcreation, word annotation and transcription, one Sabad at a time, against SikhRI's rules and BaniDB Gurmukhi. Publication and process rules are tracked too. The expansion is in progress; `_docs/rules/all-rules-matrix.md` distinguishes implemented checks from pending ones. Eko never writes translation text. Anyone can write, review, propose and approve; there are no roles.

The eight-page UI reference is mapped to these requirements in [09-ui-mockups.md](09-ui-mockups.md). Illustrative mockup data and labels do not change rule decisions or P0/P1 scope.

## Functional requirements

### Workspace

| ID | Requirement | Priority | Done when | Beat |
|---|---|---|---|---|
| FR-01 | Load a Sabad from the local BaniDB data and show its Gurmukhi read-only, with ang, raag, writer and the Rahao line marked | P0 | Stored and displayed text equals the BaniDB source after NFC normalization; no edit control exists on Gurmukhi | |
| FR-02 | A person enters or pastes a transcreation under each tukk, or under a group of tukks. Eko never writes or suggests translation text | P0 | Each save stores all associated line IDs, author and time; grouped tukks share one authored input; no control anywhere generates text | 1 |
| FR-03 | Mark a draft ready for review | P0 | Draft appears in the review queue | 1 |
| FR-04 | Browse the full Guru Granth Sahib by ang, raag, writer and Sabad, with status at a glance | P1 | Data model supports it now; demo covers 1–3 Sabads | |
| FR-05 | Utilities: every occurrence of a word, prior renderings, similar lines | P1 | Return to if time allows | |

### Checks and report card

| ID | Requirement | Priority | Done when | Beat |
|---|---|---|---|---|
| FR-06 | Every save checks changed authored tukks/groups and any Sabad-scoped checks affected by them. Code checks return first; LLM checks follow | P0 | Unrelated tukks are not re-checked; first-use/collapse checks affected elsewhere in the Sabad are refreshed; code findings under 1 s and LLM findings under about 15 s per authored unit (targets); the UI distinguishes pending, cached, completed, failed and not-evaluable results | 2 |
| FR-07 | Each finding shows rule ID, rule text, severity, the exact words highlighted, an explanation, and any cited reference renderings | P0 | The validator drops any finding whose quoted words or cited IDs don't exist; the report card shows rule, model and prompt provenance for surviving findings | 2, 3 |
| FR-08 | Track all 66 source rules across their applicable layers; run only implemented checks at their resolved severity and show missing evidence as unevaluable | P0 | The rules matrix covers every ID, focused tests prove each implemented check, and the report never labels pending rules as passed | |
| FR-09 | Style and consistency checks cite the reference renderings they draw on | P0 | Every such finding lists at least one valid reference ID and labels its source; a check runs when an applicable SikhRI-supplied or Eko-published reference exists | 3 |
| FR-10 | Grammar hints from the ending matra, only where unambiguous, labelled as hints | P1 | Deferred: a free transcreation doesn't map word for word onto the line | |

### Review and publishing

| ID | Requirement | Priority | Done when | Beat |
|---|---|---|---|---|
| FR-11 | Anyone reviewing accepts, overrides or waives each finding, always with a written reason, visible to every later reviewer | P0 | Every decision is disabled until a reason is entered and appears in the decision history; accepting a finding sends it back for editing and leaves a must-fix open | 4 |
| FR-12 | Any edit or ruleset change re-runs the affected checks; findings on changed text or rules are replaced | P0 | A response for an older draft or ruleset cannot overwrite current findings; cleared findings may appear in history but not as current blockers | |
| FR-13 | Publishing is blocked while any open error or flag remains, a check phase for the current draft/ruleset is pending/failed, or a CONS-01 departure lacks a recorded reason | P0 | The publish button names each blocker; other open warnings are shown separately and do not block | 5 |
| FR-14 | Publishing adds the transcreation to the reference set and re-indexes it; waived findings stay marked on it | P0 | The next style check can cite the newly published lines with equal source weight to SikhRI-supplied references; source and waiver/override/departure marks remain visible | 5 |

### Rules and learning loop

| ID | Requirement | Priority | Done when | Beat |
|---|---|---|---|---|
| FR-15 | A rules page lists every rule with level, layers, severity, decision and provenance | P0 | All 66 rules visible; active/category counts are derived from the resolved ruleset, including checks, by-design rules and suppressors | |
| FR-16 | Anyone proposes a new rule in free text, with an example and a reason | P0 | The proposal goes straight to the drift check | 5 |
| FR-16b | Repeated overrides of one rule, from at least two people, produce a drafted proposal with its evidence | P1 | Seeded overrides produce one proposal | |
| FR-17 | The drift check runs on every proposal and shows its evidence (contradictions, affected approved references from either source, glossary collisions where data exists) | P0 | A deliberately contradicting proposal is blocked; unavailable evidence is labelled, not silently passed | 5 |
| FR-18 | Anyone approves a rule or overrides a drift block, always with a reason; the ruleset version goes up and provenance (who, when, why) is saved | P0 | The new version is used by the very next check | 5 |

### Evaluation

| ID | Requirement | Priority | Done when | Beat |
|---|---|---|---|---|
| FR-19 | A backtest replays held-back pre-edit drafts and reports catch rate, false-flag rate and sample size, per rule and per ruleset version | P0 | Re-running gives the same numbers (cached model responses); the UI shows the actual sample size and an unavailable state until real pre-edit drafts exist | 6 |

### Platform

| ID | Requirement | Priority | Done when | Beat |
|---|---|---|---|---|
| FR-20 | A person types their name once per browser; it's saved with every decision and approval. No sign-in, no roles | P0 | Every decision and rule change shows who made it; the name can be changed from the top bar | |
| FR-21 | BaniDB attribution and logo shown in the app | P0 | Visible in every page footer | |

## Non-functional requirements

| Area | Requirement |
|---|---|
| AI boundary | No feature generates translation text or Gurmukhi. Model output is a strict review-only `FindingBatch` (possibly empty) or `DriftAssessment`; neither may include replacement text |
| Traceability | Every finding stores the rule version, model name and prompt version that produced it |
| Performance | Speed wins over data locality: hosted models are fine. Code checks return in under a second; LLM checks run in parallel per tukk |
| Noise | Precision over recall: a check that can't verify its finding reports a hint, not a flag |
| Cost | LLM calls run only after a prefilter selects the line, and every response is cached by its inputs |
| Script | All Gurmukhi is Unicode NFC, set in a Gurmukhi font with a real fallback |

## Out of scope for this build

| Item | Status |
|---|---|
| Generating or suggesting translation text | Never. Eko only reviews |
| Non-transcreation publication | Pending. Other authored layers can be drafted and checked, but cannot enter the transcreation reference set |
| Sign-in, roles, permissions | Future. Anyone can write, review and approve |
| Offline demo mode | Not planned. The LLM cache stays, for speed and cost |
| Fine-tuning, multi-round history, diffs, versioning UI, Panjabi teeka | Future |
