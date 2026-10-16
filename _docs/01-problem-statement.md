# 01 · Problem statement

Source: [Sarbat Build Day, problem sikhri-1](https://sarbat-problem-statements.fly.dev/#sikhri-1) (SikhRI, theme "Preserving Language and Faith"). Summarized here; read the original for exact wording.

## The problem

> When many people write one teeka, how do you keep it in one voice?

At SikhRI's Guru Granth Sahib Project, every translation passes through reviewers, editors and proofreaders, some with more than a decade of experience and some with about a year. Decisions about phrasing and terms are written down in process documents, but checking thousands of lines against them by hand is hard, and inconsistencies that slip through are unacceptable.

## SikhRI's seed idea: Eko

An AI-assisted, multi-person teeka studio that keeps one teeka in one voice. SikhRI writes down its ruleset; the AI reviews every translation and every edit against it before a human reviewer sees it, and explains every flag. **The AI never writes the translation; people do.**

The brief stresses that this is more than a grammar checker. Written rules are the easy half. The hard half is learning the taste in SikhRI's approved work well enough to flag drift and explain why, without burying reviewers in noise; recognizing the same word across spellings and laga matra; and growing the ruleset without drifting from what SikhRI approved.

The brief's modules, and where each sits in this build:

| Module (from the brief) | In this build |
|---|---|
| The translation ruleset, with provenance; AI proposes rules, officials approve | P0, but anyone approves (no roles) |
| Rules check and report card | P0 |
| Style check against approved work, citing sources | P0, once SikhRI's sample arrives |
| Human review: accept or override with a reason, re-check after edits | P0 |
| Published, and the ruleset gets sharper (proposals from repeated overrides) | Publishing P0; proposals from overrides P1; free-text proposals P0 |
| Translation workspace: full Guru Granth Sahib, verified Gurmukhi | Demo Sabads P0; full browsing P1 |
| Utilities for translators | P1 |

## What the video must show

The 5-minute submission video follows one Sabad from start to finish. These six beats are the build's acceptance test; requirements in [02-requirements.md](02-requirements.md) are tagged with them.

| Beat | Shows |
|---|---|
| 1 | A person writes the transcreation |
| 2 | The report card flags an inconsistency and cites the rule |
| 3 | A voice suggestion points to the reference renderings behind it |
| 4 | A reviewer overrides one flag with a reason |
| 5 | The translation is published and a new rule is proposed for approval |
| 6 | A test on real edits: corrections SikhRI reviewers already made, held back, showing how many Eko would have caught and how often it flagged something reviewers were happy with |

Beat 6 depends on SikhRI's review history including pre-edit drafts. See [08-open-questions.md](08-open-questions.md).

## What teams receive

A sample of SikhRI's ruleset, approved translations and review history, shared on SikhRI's terms.

## Licence

Code is MIT-licensed for SikhRI's use. SikhRI's translations and documents remain SikhRI's and are shared only on its terms.
