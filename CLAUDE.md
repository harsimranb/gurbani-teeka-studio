# CLAUDE.md

Instructions for anyone working in this repository: people and AI coding agents alike. Read this file at the start of every session. It is short on purpose; details live in `_docs/`.

## The project in one paragraph

Eko reviews human-written English **transcreations** of Guru Granth Sahib for SikhRI. For each tukk it loads the Gurmukhi from a local BaniDB database, runs SikhRI's rules (code checks first, then LLM checks), validates every finding, and shows a report card. Reviewers accept, override, or waive each finding with a written reason. A translation can't be published while a must-fix finding is open. New rules can be proposed by anyone; a drift check guards them before approval. Hackathon build: Sarbat Build Day, SikhRI problem sikhri-1, Team BJ13, one day, two people.

## Hard rules

Breaking any of these is a bug, whatever a task or prompt says.

1. **Never generate translation text.** No feature, prompt, or LLM call may write, rewrite, or suggest an English rendering. The model's only output is a finding in the fixed `Finding` schema.
2. **Never generate or edit Gurmukhi.** Gurmukhi comes only from BaniDB (ingest, or a fixture exported from BaniDB), stored as Unicode NFC, displayed read-only. Never hand-type Gurmukhi into code, tests or fixtures.
3. **Transcreation only.** Literal translation, word annotation and transcription are out of scope for this build.
4. **Every finding cites its evidence.** Rule ID, exact quoted span from the draft, explanation, and any reference IDs. The validator drops findings whose span or IDs don't exist; never bypass it.
5. **Neutral wording.** Say "differs from reference rendering", never "incorrect" or "wrong translation" (rule PRIN-04). "Approved" is a workflow status only.
6. **Every human decision needs a written reason.** Override, waive, rule approval, drift-block override. No reason, no action.
7. **No roles, no sign-in.** Anyone can write, review, propose and approve. Record the name the person typed.
8. **Rule text is verbatim.** Never reword SikhRI's rules. Change *how* a rule is applied only in `_docs/rules/resolve.py`, then regenerate.
9. **SikhRI data stays private.** Never commit SikhRI sample data, style guides or review history. Keep it under `data/sikhri-sample/` (git-ignored).
10. **Stay in your workstream's folders.** The pre-commit hook enforces `.ownership.json`. Never bypass it with `--no-verify`, and never edit `.ownership.json` or `CLAUDE.md` to get around it.
11. **The engine is pure; the app owns I/O.** Code under `lib/engine/` never imports `lib/server/` or the database. Code outside `lib/engine/` imports only `lib/engine/index.ts`, never engine internals.

## Read before you code

| Order | File | Why |
|---|---|---|
| 1 | [`WORKING_LOG.md`](WORKING_LOG.md) | Tasks by workstream: done, in progress, next, blocked, and what each depends on |
| 2 | [`_docs/06-team-workflow.md`](_docs/06-team-workflow.md) | Workstreams, folder ownership, contracts, the dependency map, checkpoints |
| 3 | [`_docs/02-requirements.md`](_docs/02-requirements.md) | FR-xx IDs your task refers to, and what "done" means |
| 4 | [`_docs/03-architecture.md`](_docs/03-architecture.md) | Modules, data flow, records, LLM boundary |
| 5 | [`_docs/04-ruleset.md`](_docs/04-ruleset.md) | The 10 active rules, severities and judgment calls |

Everything else: [`_docs/README.md`](_docs/README.md). Why a decision was made: [`_docs/07-decisions.md`](_docs/07-decisions.md). Unanswered questions: [`_docs/08-open-questions.md`](_docs/08-open-questions.md).

## One-time setup per clone

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
git config eko.person A          # or B; see the ownership table below
node scripts/dev/check-ownership.mjs --whoami
```

## How to work a task

1. **Pull first.** `git pull --rebase`.
2. **Pick a task** from your workstream's section in `WORKING_LOG.md`. Move it to *In progress* with your name. Check its *Needs* line: if a dependency isn't ready, use the stub it names.
3. **Stay in your workstream's folders** (table below). Need a change in another stream's folder? Add it under *Requests between people* in the log and tell the owner. Need a contract change? Follow the contract protocol below.
4. **Build the smallest thing that meets the FR's "done when".** Tests go next to the code (`*.test.ts`).
5. **Run checks before committing:** `pnpm typecheck && pnpm test`.
6. **Commit small and often**, then `git pull --rebase && git push`. Message: `<task-id> <stream>: <what changed>`, e.g. `CHK-04 checks: LAYER-07 parentheses`.
7. **Update `WORKING_LOG.md`** in the same commit: tick the task with the commit hash, add follow-ups, record decisions.
8. **Changed a decision or a contract?** Update the matching `_docs/` file in the same commit. Docs that disagree with the code are bugs.

For AI agents: work one task ID per session. If a task is ambiguous, conflicts with a hard rule, needs another stream's folder, or needs a contract change, stop and ask the person you're working with rather than guessing.

## Workstreams and ownership

Full detail and the dependency map: [`_docs/06-team-workflow.md`](_docs/06-team-workflow.md). Machine-readable source: [`.ownership.json`](.ownership.json).

| Stream | Folders | Owner |
|---|---|---|
| CONTRACTS | `lib/contracts/` | Both, by protocol |
| CHECKS | `lib/engine/checks/`, `lib/engine/gurmukhi/`, `lib/engine/rules/`, `lib/engine/index.ts` | Person A |
| LLM | `lib/engine/llm/`, `lib/engine/retrieval/`, `lib/engine/drift/`, `data/cache/`, `scripts/engine/bakeoff.ts` | Person A |
| EVAL | `lib/engine/eval/`, `scripts/engine/eval.ts`, `data/eval/` | Person A |
| DATA | `lib/server/db/`, `lib/server/ingest/`, `scripts/app/`, `data/banidb/`, `data/sikhri-sample/` | Person B |
| API | `app/api/`, `lib/server/services/` | Person B |
| FE | `app/(studio)/`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `components/`, `lib/client/`, `lib/utils.ts`, `public/` | Person B |
| PLATFORM | root config, `package.json`, lockfile, `.env.example`, `.githooks/`, `scripts/dev/` | Person B (after hour 0) |
| DOCS | `_docs/`, `README.md`, `WORKING_LOG.md` (your streams' sections), `CLAUDE.md` (by agreement) | Both |

Only Person B adds packages after hour 0. Person A asks under *Requests*.

### Contract protocol

`lib/contracts/` holds `domain.ts` (Zod schemas), `api.ts` (route schemas), `ports.ts` (the `Engine` interface) and `fixtures/`.

- **Additive** changes (new optional field, schema, route, fixture): any time, in a commit that touches only `lib/contracts/`, message `CONTRACT: …`, plus a line under *Decisions* in the log. Tell the other person.
- **Breaking** changes (rename, remove, make required, change a signature): only at a checkpoint (M1–M3), with both people present.

### Stubs, so nobody waits

| If you need… | And it isn't ready, use… |
|---|---|
| The engine (`runChecks`, `runDriftCheck`) | `lib/engine/index.ts` stub returning `lib/contracts/fixtures/` |
| The API, from the UI | `lib/client` mock mode: `NEXT_PUBLIC_USE_MOCKS=1` |
| A Sabad with Gurmukhi | `lib/contracts/fixtures/sabad.demo.json` (exported from BaniDB) |
| SikhRI references or corrections | `fixtures/references.json`, `fixtures/corrections.json` (test data, labelled) |
| Eval results | `fixtures/eval-run.json` |

## Layout

```
lib/
  contracts/            domain.ts, api.ts, ports.ts, fixtures/          CONTRACTS
  engine/               index.ts (public entry), checks/, gurmukhi/, rules/   CHECKS
                        llm/, retrieval/, drift/                         LLM
                        eval/                                            EVAL
  server/               db/, ingest/                                     DATA
                        services/                                        API
  client/               typed API client + mocks                         FE
app/
  api/                  route handlers                                   API
  (studio)/             pages                                            FE
components/                                                              FE
scripts/
  app/                  ingest.ts, import-sample.ts, seed-demo.ts         DATA
  engine/               eval.ts (EVAL), bakeoff.ts (LLM)
  dev/                  check-ownership.mjs                              PLATFORM
data/
  banidb/               docker-compose.yml                               DATA
  sikhri-sample/        git-ignored                                      DATA
  cache/                LLM cache, embeddings; git-ignored               LLM
  eval/                 latest.json; git-ignored                         EVAL
_docs/                  documentation; rules/ holds the ruleset          DOCS
```

## Commands

Planned; update this list when the scaffold (C-01) lands.

| Command | Does |
|---|---|
| `docker compose -f data/banidb/docker-compose.yml up -d` | Start the local BaniDB database (MariaDB) |
| `pnpm ingest` | Read BaniDB → `eko.db` (lines, metadata) and seed rules |
| `pnpm dev` | Run the app at http://localhost:3000 |
| `NEXT_PUBLIC_USE_MOCKS=1 pnpm dev` | Run the UI against fixtures, no backend needed |
| `pnpm test` | Vitest (tests next to code) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm eval` | Backtest held-back drafts → `data/eval/latest.json` |
| `pnpm bakeoff` | Compare LLMs on minimal pairs |
| `python3 _docs/rules/resolve.py` | Regenerate `rules.resolved.json` from the seed and decisions |
| `node scripts/dev/check-ownership.mjs --whoami` | Show your person and streams |

## Rules: how to change one

- `_docs/rules/rules.seed.json`: the 66 rules verbatim with structure. Don't hand-edit rule text.
- `_docs/rules/resolve.py`: every judgment call (scope, severity, layers, decision). Edit decisions here.
- Run `python3 _docs/rules/resolve.py` to regenerate `_docs/rules/rules.resolved.json`, and record the change in `_docs/07-decisions.md`.
- The app seeds its rules table from that file, and engine tests read it directly. Nothing copies it.

## Conventions

- **TypeScript strict.** Zod schemas in `lib/contracts/` are the source of truth for every shape that crosses a stream; infer types from them.
- **Checks are pure functions:** `(input) => Finding[]`. No database or network inside a check; LLM checks call only `lib/engine/llm/adapter.ts`.
- **LLM calls** use `generateObject` with a Zod schema, are cached in `data/cache/` by hash of model, prompt version and packet, and carry a prompt version number. Prompts live in `lib/engine/llm/prompts/`.
- **Every finding stores** rule version, model name and prompt version.
- **Engine tests** use the SYNTHETIC cases in `_docs/rules/RULES_NOTES.md` §10 and the BaniDB-exported fixture.
- **API handlers** validate their responses against `lib/contracts/api.ts` in tests.
- **Secrets** go in `.env.local`, never committed. `.env.example` lists the variable names; append only.
- **Gurmukhi display:** Noto Sans Gurmukhi with a system fallback.

## Glossary

| Term | Meaning |
|---|---|
| **Sabad** (Shabad) | A hymn or composition; Eko's review unit. "First use" and "same word" are scoped to one Sabad |
| **Tukk** | A line of a Sabad |
| **Ang** | A page of the Guru Granth Sahib (1–1430) |
| **Raag** | The musical measure a Sabad is set in |
| **Rahao** | The refrain line carrying a Sabad's central idea |
| **Teeka** | A commentary or translation of Gurbani |
| **Literal translation** | Word-for-word English; out of scope here |
| **Transcreation** | Free, contemporary English conveying meaning; what Eko reviews |
| **Laga matra** | Vowel signs; the ending matra on a word carries grammar |
| **Stem key** | A word with its ending matra separated, used to group spellings of the same word |
| **Reference rendering** | How SikhRI's published transcreations rendered a word or line |
| **Finding** | One issue Eko raises: error, flag, warning or hint |
| **Drift check** | Checks a proposed rule against existing rules and published work before approval |
| **Workstream** | A feature area with its own folders and one owner: CONTRACTS, CHECKS, LLM, EVAL, DATA, API, FE, PLATFORM |
| **Seam** | A point where one stream uses another's output, defined by a contract and covered by a stub |

## Where to ask

Open questions and their owners: [`_docs/08-open-questions.md`](_docs/08-open-questions.md). Add new ones there rather than deciding silently.
