# Eko: SikhRI Translation Reviewer

Eko helps SikhRI keep one voice across a teeka written by many people. A person writes an English **transcreation** of a line of Gurbani; Eko checks it against SikhRI's translation rules and the Gurmukhi from BaniDB, and returns a report card. Each finding names the rule, quotes the exact words, and explains why. People decide what to change. **Eko never writes or suggests translation text.**

Built by Team BJ13 for Sarbat Build Day, problem statement [sikhri-1](https://sarbat-problem-statements.fly.dev/#sikhri-1) (SikhRI).

## Status

| Area | State |
|---|---|
| Problem, scope, requirements | Done: [`_docs/02-requirements.md`](_docs/02-requirements.md) |
| Architecture and stack | Done: [`_docs/03-architecture.md`](_docs/03-architecture.md) |
| Ruleset v0.1 (66 rules, 10 active) | Done, pending reviewer answers: [`_docs/04-ruleset.md`](_docs/04-ruleset.md) |
| Code | Not started. Scaffold is task T-01 in [`WORKING_LOG.md`](WORKING_LOG.md) |

## Start here

| If you want to… | Read |
|---|---|
| Work on the code (human or AI agent) | [`CLAUDE.md`](CLAUDE.md), then [`WORKING_LOG.md`](WORKING_LOG.md) |
| Understand the problem | [`_docs/01-problem-statement.md`](_docs/01-problem-statement.md) |
| See what to build | [`_docs/02-requirements.md`](_docs/02-requirements.md) |
| See how it fits together | [`_docs/03-architecture.md`](_docs/03-architecture.md) |
| Understand the rules | [`_docs/04-ruleset.md`](_docs/04-ruleset.md) |
| Know where data comes from | [`_docs/05-data-sources.md`](_docs/05-data-sources.md) |
| Know how two people work in parallel | [`_docs/06-team-workflow.md`](_docs/06-team-workflow.md) |
| Know why something was decided | [`_docs/07-decisions.md`](_docs/07-decisions.md) |
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

## Planned stack

TypeScript, Next.js, SQLite with Drizzle, Vercel AI SDK (any LLM provider), Transformers.js for local embeddings, Vitest. Gurbani text comes from BaniDB's database image run locally in Docker. Details and reasons are in [`_docs/03-architecture.md`](_docs/03-architecture.md).

## Getting started

The app isn't scaffolded yet. Once task T-01 lands, these commands will work (see [`CLAUDE.md`](CLAUDE.md) for the current list):

```bash
# prerequisites: Node 20+, pnpm, Docker
docker compose -f data/banidb/docker-compose.yml up -d   # local BaniDB database
pnpm install
cp .env.example .env.local                               # add LLM API keys
pnpm ingest                                              # BaniDB → eko.db
pnpm dev                                                 # http://localhost:3000
pnpm test                                                # golden tests
```

To regenerate the resolved ruleset after editing a decision:

```bash
python3 _docs/rules/resolve.py
```

## Licence and attribution

- Code: MIT, for SikhRI to use.
- SikhRI's translations, rules and documents remain SikhRI's and are shared only on SikhRI's terms. Don't commit SikhRI sample data to a public repository.
- Gurbani text and metadata: [BaniDB](https://www.banidb.com) by Khalis Foundation. The app must show BaniDB attribution and logo (see [`_docs/05-data-sources.md`](_docs/05-data-sources.md)).
