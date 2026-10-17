# CLAUDE.md

Instructions for anyone working in this repository: people and AI coding agents alike. Read this file at the start of every session. It is short on purpose; details live in `_docs/`.

**Hackathon principle:** choose the simplest implementation that is correct and effective for the approved task. Avoid extra architecture, abstractions, UI polish or tests that do not prove its acceptance criteria.

## The project in one paragraph

Eko reviews human-written English **transcreations** of Guru Granth Sahib for SikhRI. For each tukk it loads the Gurmukhi from a local BaniDB database, runs SikhRI's rules (code checks first, then LLM checks), validates every finding, and shows a report card. Reviewers accept, override, or waive each finding with a written reason. A translation can't be published while a must-fix finding is open. New rules can be proposed by anyone; a drift check guards them before approval. Hackathon build: Sarbat Build Day, SikhRI problem sikhri-1, Team BJ13, one day, two people.

## Hard rules

Breaking any of these is a bug, whatever a task or prompt says.

1. **Never generate translation text.** No feature, prompt, or LLM call may write, rewrite, or suggest an English rendering. Model output uses only strict review schemas: a `FindingBatch` with zero or more validated `Finding` values, or a `DriftAssessment`. Neither schema may contain suggested translation text.
2. **Never generate or edit Gurmukhi.** Gurmukhi comes only from BaniDB (ingest, or a fixture exported from BaniDB), stored as Unicode NFC, displayed read-only. Never hand-type Gurmukhi into code, tests or fixtures.
3. **Transcreation only.** Literal translation, word annotation and transcription are out of scope for this build.
4. **Every finding cites its evidence.** Rule ID, exact quoted span from the draft, explanation, and any reference IDs. The validator drops findings whose span or IDs don't exist; never bypass it.
5. **Neutral wording.** Say "differs from reference rendering", never "incorrect" or "wrong translation" (rule PRIN-04). "Approved" is a workflow status only.
6. **Every human decision needs a written reason.** Override, waive, rule approval, drift-block override. No reason, no action.
7. **No roles, no sign-in.** Anyone can write, review, propose and approve. Record the name the person typed.
8. **Rule text is verbatim.** Never reword SikhRI's rules. Change *how* a rule is applied only in `_docs/rules/resolve.py`, then regenerate.
9. **SikhRI data stays private.** Never commit SikhRI sample data, style guides or review history. Keep it under the git-ignored `data/sikhri-sample/`.
10. **Anyone can work on any task or folder.** Workstreams organize the code; they do not grant or restrict access. Coordinate overlapping edits, preserve other contributors' changes, and keep each task focused.
11. **The engine is pure; the app owns I/O.** Code under `lib/engine/` never imports `lib/server/` or the database. Code outside `lib/engine/` imports only `lib/engine/index.ts`, never engine internals.

## Load context before choosing work

Read this file, then [`WORKING_LOG.md`](WORKING_LOG.md) for pending tasks and [`_docs/11-execution-readiness.md`](_docs/11-execution-readiness.md) for current dependencies and unanswered decisions. For the selected task, read its acceptance criteria in [`_docs/10-feature-breakdown.md`](_docs/10-feature-breakdown.md), the relevant FR in [`_docs/02-requirements.md`](_docs/02-requirements.md), and only the parts of architecture, rules and contracts it touches. Use [`_docs/06-team-workflow.md`](_docs/06-team-workflow.md) to check dependencies and seams.

Everything else: [`_docs/README.md`](_docs/README.md). Why a decision was made: [`_docs/07-decisions.md`](_docs/07-decisions.md). Unanswered questions: [`_docs/08-open-questions.md`](_docs/08-open-questions.md).

## Agent model policy

- **Planning, design, and review:** Opus 5.5 or GPT 6 Sol High.
- **Implementation and Testing:** Sonnet 5.5 High or Luna High.
- These are the team's model preferences, not the application's review-model choice (LLM-02 still requires a bake-off). Resolve display names to the exact model IDs available in the active harness and use High reasoning where specified. For Codex, GPT 6 Sol High maps to `gpt-6-sol` with `high`, and Luna High maps to `gpt-6-luna` with `high`.
- When delegating implementation, explicitly select an available implementation model and High reasoning. Do not silently substitute a different model or claim to have changed the current chat's model. Report an unavailable requested model before choosing an alternative.

## Development on macOS and Windows

Both platforms are supported development targets. Use Node 22 (`.nvmrc`) and the exact pnpm version in `package.json`. Install dependencies separately in each clone; native packages and Docker storage are machine-specific. Do not copy `node_modules` or `.next` between operating systems.

Commands without shell-specific syntax, including `pnpm install`, `pnpm dev`, `pnpm typecheck`, `pnpm test`, and `node --env-file=... --import tsx ...`, work in macOS shells and Windows PowerShell. Use repository-relative paths, respect filename case, and preserve LF line endings through `.gitattributes`. New dev scripts should use Node for filesystem/process operations rather than require Bash, Unix utilities or absolute host paths.

For mock mode:

```bash
# macOS (zsh/bash), or Git Bash on Windows
NEXT_PUBLIC_USE_MOCKS=1 pnpm dev
```

```powershell
# Windows PowerShell
$env:NEXT_PUBLIC_USE_MOCKS = "1"
pnpm dev
# Clear the override when finished:
Remove-Item Env:NEXT_PUBLIC_USE_MOCKS
```

Docker Desktop must be running; Windows uses Linux containers. Follow [`_docs/c03-banidb.md`](_docs/c03-banidb.md) for per-machine credentials, database setup and the private BaniDB API fallback. Private fixtures must be provisioned in each clone; a working Mac setup does not prove Windows setup has been verified. No person identity or folder-ownership hook setup is required.

## End-to-end agent workflow

1. **Load and select.** Check the worktree and pending items. If the user already named a task ID, use it; otherwise show a short list of ready tasks, explain dependencies or overlap with work in progress, recommend one, and ask which they want. Work on one task ID per session. Pull/rebase when safe; never overwrite another person's uncommitted work.
2. **Check the seam.** Confirm the task's required data/contracts, acceptance criteria and files. Use its documented stub if a dependency is pending. If the task overlaps another active stream or needs a breaking contract change, coordinate with the active contributors before proposing implementation.
3. **Plan and get approval.** Give the user a concise task-specific plan: intended behavior, files, dependency/stub, acceptance checks and any material uncertainty. Ask clarifying questions that affect the result. **Do not edit application code until the user approves the plan.** One approval covers the stated task; do not ask again for routine implementation choices.
4. **Implement simply.** Mark the task *In progress* in `WORKING_LOG.md`, then build only what the approved task needs in the relevant folders. Add focused tests where they prove behavior or a risky boundary. Update relevant docs when behavior or a decision changes.
5. **Verify and review.** Run focused checks, then `pnpm typecheck && pnpm test`. Ask a fresh subagent to review the diff against the task's acceptance criteria, looking for correctness bugs, missing behavior and regressions. Evaluate each finding; fix substantiated issues and rerun affected checks. Do not expand scope for style or speculative improvements. If a subagent review is unavailable, tell the user rather than claiming one happened.
6. **Update status, then commit and push.** Before committing, mark the task complete in `WORKING_LOG.md` and update its feature status; mark a feature complete only when all of its acceptance criteria pass. Record any decision that adds, removes or changes the plan in the log's *Decisions* section and update affected tasks, seams and priorities. Put lasting rationale in `_docs/07-decisions.md`. Review the final diff, stage only the task's files, and commit with `<task-id> <stream>: <what changed>`. Rebase safely if needed, push, and report the commit hash, checks and any remaining limits to the user. Do not force-push or discard someone else's changes.

After the user approves the plan, carry the task through implementation, review, fixes, commit and push without another routine permission stop. Ask again only if a new blocker changes the approved scope, conflicts with a hard rule, or requires a breaking contract change affecting another active task. If a required check, review or push cannot complete, report the exact blocker; do not claim the task is finished.

## Workstreams

Full detail and the dependency map: [`_docs/06-team-workflow.md`](_docs/06-team-workflow.md). Anyone may work in any stream, including dependencies and root configuration. Coordinate concurrent package/lockfile changes to avoid conflicts.

| Stream | Folders |
|---|---|
| CONTRACTS | `lib/contracts/` |
| CHECKS | `lib/engine/checks/`, `lib/engine/gurmukhi/`, `lib/engine/rules/`, `lib/engine/index.ts` |
| LLM | `lib/engine/llm/`, `lib/engine/retrieval/`, `lib/engine/drift/`, `data/cache/`, `scripts/engine/bakeoff.ts` |
| EVAL | `lib/engine/eval/`, `scripts/engine/eval.ts`, `data/eval/` |
| DATA | `lib/server/db/`, `lib/server/ingest/`, `scripts/app/`, `data/banidb/`, `data/sikhri-sample/` |
| API | `app/api/`, `lib/server/services/` |
| FE | `app/(studio)/`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `components/`, `lib/client/`, `lib/utils.ts`, `public/` |
| PLATFORM | Root config, dependencies, `.env.example`, `scripts/dev/` |
| DOCS | `_docs/`, `README.md`, `WORKING_LOG.md`, `CLAUDE.md` |

### Contract protocol

`lib/contracts/` holds `domain.ts` (Zod schemas), `api.ts` (route schemas), `ports.ts` (the `Engine` interface) and `fixtures/`.

- **Additive** changes (new optional field, schema, route, fixture): any time, in a commit that touches only `lib/contracts/`, message `CONTRACT: …`, plus a line under *Decisions* in the log. Notify active consumers of the contract.
- **Breaking** changes (rename, remove, make required, change a signature): only at a checkpoint (M1–M3), with affected contributors coordinated.

### Stubs, so nobody waits

| If you need… | And it isn't ready, use… |
|---|---|
| The engine model phase or drift (`runChecks(…, 'llm')`, `runDriftCheck`) | Both are real (D-79–D-85). Without `ANTHROPIC_API_KEY` (or `createEngine({ client: null })`) model checks report `notEvaluable` and drift reports `not_evaluable`, never a pass |
| The API, from the UI | `lib/client` mock mode: `NEXT_PUBLIC_USE_MOCKS=1` |
| A Sabad with Gurmukhi | Local, git-ignored `lib/contracts/fixtures/sabad.demo.json` exported from BaniDB; provision it privately in each clone |
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
  dev/                  cross-platform development tools                 PLATFORM
data/
  banidb/               docker-compose.yml                               DATA
  sikhri-sample/        private; git-ignored                              DATA
  cache/                LLM cache, embeddings; git-ignored                LLM
  eval/                 latest.json; git-ignored                          EVAL
_docs/                  documentation; rules/ holds the ruleset          DOCS
```

## Commands

The scaffold, F0 ingest and LLM-02 bake-off commands run now. The evaluation script remains reserved for EVAL; its target file does not exist yet.

| Command | Does |
|---|---|
| `docker compose --env-file data/banidb/.env -f data/banidb/docker-compose.yml up -d --wait` | Start local MariaDB; first create credentials using `_docs/c03-banidb.md` |
| `pnpm ingest` | Read the ignored, provenance-checked local BaniDB demo export into `eko.db` and seed the 66 resolved rules; repeatable without duplicates |
| `node --import tsx scripts/app/seed-demo.ts` | Seed only the BaniDB demo source lines; no English draft or decision is created (D-75) |
| `pnpm dev` | Run the app at http://localhost:3000 |
| Mock mode (shell examples above) | FE-02 stateful browser mock of every route with labelled synthetic checks (D-78); "Reset demo data" in the footer clears it |
| `pnpm test` | Run the Vitest suite |
| `pnpm typecheck` | Generate Next route types, then run `tsc --noEmit` |
| `pnpm build` | Production build using webpack |
| `pnpm eval` | Planned EVAL-02: backtest held-back drafts → `data/eval/latest.json` |
| `node --env-file=.env.local --import tsx scripts/engine/bakeoff.ts` (or `pnpm bakeoff` with `ANTHROPIC_API_KEY` set) | LLM-02: compare Claude models on synthetic minimal pairs → `data/cache/bakeoff/latest.json` (D-83) |
| `python3 _docs/rules/resolve.py` (macOS), `py -3 _docs/rules/resolve.py` (Windows) | Regenerate `rules.resolved.json` from the seed and decisions |

## Rules: how to change one

- `_docs/rules/rules.seed.json`: the 66 rules verbatim with structure. Don't hand-edit rule text.
- `_docs/rules/resolve.py`: every judgment call (scope, severity, layers, decision). Edit decisions here.
- With Python 3 installed, run `python3 _docs/rules/resolve.py` (macOS) or `py -3 _docs/rules/resolve.py` (Windows) to regenerate `_docs/rules/rules.resolved.json`, and record the change in `_docs/07-decisions.md`.
- The app seeds its rules table from that file, and engine tests read it directly. Nothing copies it.

## Conventions

- **TypeScript strict.** Zod schemas in `lib/contracts/` are the source of truth for every shape that crosses a stream; infer types from them.
- **Deterministic code checks are pure functions:** `(input) => Finding[]`. The engine pipeline returns `CheckResult` (findings plus `notEvaluable` results). No shared database access inside a check; LLM checks call only `lib/engine/llm/adapter.ts`.
- **LLM calls** use the pinned AI SDK's current structured-output API (`generateText` with `Output.object({ schema })` in the current docs) and a Zod review schema. Cache by hash of model, prompt version and packet in `data/cache/`; carry a prompt version number. Prompts live in `lib/engine/llm/prompts/`.
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
| **Workstream** | A feature area with related folders, open to every contributor: CONTRACTS, CHECKS, LLM, EVAL, DATA, API, FE, PLATFORM |
| **Seam** | A point where one stream uses another's output, defined by a contract and covered by a stub |

## Where to ask

Open questions and their owners: [`_docs/08-open-questions.md`](_docs/08-open-questions.md). Add new ones there rather than deciding silently.
