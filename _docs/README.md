# Docs index

Everything Team BJ13 decided before the build, in reading order. Each file stands on its own; cross-links point to the source of truth rather than repeating it.

| File | What's in it | Source of truth for |
|---|---|---|
| [01-problem-statement.md](01-problem-statement.md) | SikhRI's brief, the seed idea, what the video must show | Demo beats |
| [02-requirements.md](02-requirements.md) | Functional requirements (FR-xx), non-functional requirements, out of scope | What to build, "done when" |
| [03-architecture.md](03-architecture.md) | Logical flow, runtime architecture, stack, records, LLM boundary, drift check | How it fits together |
| [04-ruleset.md](04-ruleset.md) | Active rules, severities, judgment calls, how to change a rule | How rules are applied |
| [05-data-sources.md](05-data-sources.md) | BaniDB (offline), SikhRI sample, what isn't available and why | Where data comes from, terms |
| [06-team-workflow.md](06-team-workflow.md) | Two people with AI agents, ownership, git, one-day plan | Who does what, when |
| [07-decisions.md](07-decisions.md) | Dated decision log with reasons | Why |
| [08-open-questions.md](08-open-questions.md) | Unanswered questions, owners, what each blocks | What's unknown |
| [reviewer-questions.md](reviewer-questions.md) | The document sent to SikhRI's reviewer: all 66 rules and 15 questions | Copy of the shared doc |
| [architecture.html](architecture.html) | Visual architecture page with diagrams (open in a browser) | Snapshot; Markdown docs win if they differ |

## Rules folder

| File | Purpose | Edit? |
|---|---|---|
| [rules/ruleset-v0.1-draft.txt](rules/ruleset-v0.1-draft.txt) | The team's original ruleset draft, from SikhRI's public Approach and Methodology pages | No: historical source |
| [rules/rules.seed.json](rules/rules.seed.json) | All 66 rules, verbatim, with structure (category, check type, prefilter proposals) | Rarely |
| [rules/resolve.py](rules/resolve.py) | Every judgment call: scope, severity, layers, decision | **Yes: change decisions here** |
| [rules/rules.resolved.json](rules/rules.resolved.json) | Generated. What the app loads | No: regenerate with `python3 _docs/rules/resolve.py` |
| [rules/RULES_NOTES.md](rules/RULES_NOTES.md) | Analysis: tensions, precision, synthetic test cases (§10) | Reference |

## Shared links

These live outside the repo. They are private until shared from their Share menus.

- Architecture page (live): https://claude.ai/artifact/JGZe4iPmsYqXEUBFxRJ6Jq
- Reviewer questions (Claude Doc): https://claude.ai/code/artifact/aaf9f606-969e-4bd3-b453-30992b387995
- Problem statement: https://sarbat-problem-statements.fly.dev/#sikhri-1

## Keeping docs current

If code changes a decision, a contract or a requirement, update the matching file here in the same commit and add a line to [07-decisions.md](07-decisions.md). `architecture.html` is a snapshot from the planning session and isn't kept in sync; the Markdown files are authoritative.
