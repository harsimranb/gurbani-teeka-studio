# Eko: SikhRI Translation Reviewer

Eko helps SikhRI keep one voice across a teeka written by many people. A person writes an English **transcreation** of a line of Gurbani; Eko checks it against SikhRI's translation rules and the Gurmukhi from BaniDB, and returns a report card. Each finding names the rule, quotes the exact words, and explains why. People decide what to change. **Eko never writes or suggests translation text.**

Built by Team BJ13 for Sarbat Build Day, problem statement [sikhri-1](https://sarbat-problem-statements.fly.dev/#sikhri-1) (SikhRI).

## Status

| Area | State |
|---|---|
| Problem, scope, requirements | Done: [`_docs/02-requirements.md`](_docs/02-requirements.md) |
| Architecture and stack | Done: [`_docs/03-architecture.md`](_docs/03-architecture.md) |
| Ruleset v0.1 (66 rules, 10 active) | Done, pending reviewer answers: [`_docs/04-ruleset.md`](_docs/04-ruleset.md) |
| Team workflow | Open contribution across all workstreams, model policy and macOS/Windows setup: [`_docs/06-team-workflow.md`](_docs/06-team-workflow.md) |
| UI mockups | Eight supplied screens mapped to P0/P1 tasks: [`_docs/09-ui-mockups.md`](_docs/09-ui-mockups.md) |
| Feature plan | Task breakdown and acceptance criteria: [`_docs/10-feature-breakdown.md`](_docs/10-feature-breakdown.md) |
| Kickoff readiness | Decisions and external inputs before workstream split: [`_docs/11-execution-readiness.md`](_docs/11-execution-readiness.md) |
| Code | F0 foundation complete for the approved Mac, source-only scope: contracts, private local BaniDB export, storage, seed, and 18 validated route skeletons. Windows validation and the human demo draft remain open: [`WORKING_LOG.md`](WORKING_LOG.md) |

## Start here

| If you want to… | Read |
|---|---|
| Work on the code (human or AI agent) | [`CLAUDE.md`](CLAUDE.md), then [`WORKING_LOG.md`](WORKING_LOG.md) |
| Understand the problem | [`_docs/01-problem-statement.md`](_docs/01-problem-statement.md) |
| See what to build | [`_docs/02-requirements.md`](_docs/02-requirements.md) |
| See how it fits together | [`_docs/03-architecture.md`](_docs/03-architecture.md) |
| Understand the rules | [`_docs/04-ruleset.md`](_docs/04-ruleset.md) |
| Know where data comes from | [`_docs/05-data-sources.md`](_docs/05-data-sources.md) |
| Understand workstreams and their dependencies | [`_docs/06-team-workflow.md`](_docs/06-team-workflow.md) |
| Know why something was decided | [`_docs/07-decisions.md`](_docs/07-decisions.md) |
| Build the supplied screens | [`_docs/09-ui-mockups.md`](_docs/09-ui-mockups.md) |
| Check feature tasks and acceptance | [`_docs/10-feature-breakdown.md`](_docs/10-feature-breakdown.md) |
| See decisions before kickoff | [`_docs/11-execution-readiness.md`](_docs/11-execution-readiness.md) |
| See what's still unanswered | [`_docs/08-open-questions.md`](_docs/08-open-questions.md) |

The full docs index is [`_docs/README.md`](_docs/README.md).

## How it works

```
BaniDB (local copy) ──ingest──▶ eko.db ◀── rules.resolved.json
                                   │
 person writes transcreation ──▶ checks: code first, then LLM ──▶ validator ──▶ report card
                                                                                  │
                         reviewer accepts / overrides / waives, always with a reason
                                                                                  │
                                       publish (blocked while a must-fix is open)
```

## Stack

TypeScript, Next.js, SQLite with Drizzle, Vercel AI SDK (any LLM provider), Transformers.js for local embeddings, Vitest. Gurbani text comes from BaniDB's database image run locally in Docker. Details and reasons are in [`_docs/03-architecture.md`](_docs/03-architecture.md).

## Getting started

The minimal app scaffold is available. Product data, checks and evaluation arrive in later tasks (see [`CLAUDE.md`](CLAUDE.md) for the current command list):

```bash
# prerequisites: Node 22 (.nvmrc), pinned pnpm version from package.json
pnpm install
pnpm dev                                                 # http://localhost:3000
pnpm typecheck
pnpm test
pnpm build
```

C-02 supplies review-only schemas and explicitly synthetic engine/client stubs. F0 adds 18 route skeletons; stateful actions report unavailable until their real workflow tasks. For the private local BaniDB SQLite demo export and source-only ingest (`pnpm ingest` loads the full Guru Granth Sahib corpus when that SQLite copy is present), follow [C-03 setup](_docs/c03-banidb.md). The pinned Docker development image remains partial; the earlier API fallback is retained privately. A human-written English demo draft is still needed for F1.

Development runs on macOS and Windows. Install dependencies independently on each machine; do not share `node_modules`, `.next`, Docker volumes or credentials. Anyone can work on any task or folder; person identity and ownership hooks are no longer required. See [`CLAUDE.md`](CLAUDE.md#development-on-macos-and-windows) for shell-specific mock mode and shared setup guidance.

For agents, planning uses **Opus 5.5 or GPT 6 Sol High**; implementation uses **Sonnet 5.5 High or Luna High**. This is separate from Eko's application-model bake-off.

To regenerate the resolved ruleset after editing a decision:

```bash
python3 _docs/rules/resolve.py   # macOS; Windows: py -3 _docs/rules/resolve.py
```

## Licence and attribution

- Code: MIT, for SikhRI to use.
- SikhRI's translations, rules and documents remain SikhRI's and are shared only on SikhRI's terms. Don't commit SikhRI sample data to a public repository.
- Gurbani text and metadata: [BaniDB](https://www.banidb.com) by Khalis Foundation. The app must show BaniDB attribution and logo (see [`_docs/05-data-sources.md`](_docs/05-data-sources.md)).
