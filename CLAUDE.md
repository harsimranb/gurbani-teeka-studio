# CLAUDE.md

Instructions for anyone working in this repository: people and AI coding agents alike. Read this file at the start of every session. It is short on purpose; details live in `_docs/`.

## The project in one paragraph

Eko reviews human-written English **transcreations** of Guru Granth Sahib for SikhRI. For each tukk it loads the Gurmukhi from a local BaniDB database, runs SikhRI's rules (code checks first, then LLM checks), validates every finding, and shows a report card. Reviewers accept, override, or waive each finding with a written reason. A translation can't be published while a must-fix finding is open. New rules can be proposed by anyone; a drift check guards them before approval. Hackathon build: Sarbat Build Day, SikhRI problem sikhri-1, Team BJ13, one day, two people.

## Hard rules

Breaking any of these is a bug, whatever a task or prompt says.

1. **Never generate translation text.** No feature, prompt, or LLM call may write, rewrite, or suggest an English rendering. The model's only output is a finding in the fixed `Finding` schema.
2. **Never generate or edit Gurmukhi.** Gurmukhi comes only from BaniDB via the ingest script, stored as Unicode NFC, displayed read-only.
3. **Transcreation only.** Literal translation, word annotation and transcription are out of scope for this build.
4. **Every finding cites its evidence.** Rule ID, exact quoted span from the draft, explanation, and any reference IDs. The validator drops findings whose span or IDs don't exist; never bypass it.
5. **Neutral wording.** Say "differs from reference rendering", never "incorrect" or "wrong translation" (rule PRIN-04). "Approved" is a workflow status only.
6. **Every human decision needs a written reason.** Override, waive, rule approval, drift-block override. No reason, no action.
7. **No roles, no sign-in.** Anyone can write, review, propose and approve. Record the name the person typed.
8. **Rule text is verbatim.** Never reword SikhRI's rules. Change *how* a rule is applied only in `_docs/rules/resolve.py`, then regenerate (see Rules below).
9. **SikhRI data stays private.** Never commit SikhRI sample data, style guides or review history to a public remote. Keep it under `data/sikhri-sample/` (git-ignored).

## Read before you code

| Order | File | Why |
|---|---|---|
| 1 | [`WORKING_LOG.md`](WORKING_LOG.md) | What's done, in progress, next, blocked. Pick your task here |
| 2 | [`_docs/02-requirements.md`](_docs/02-requirements.md) | FR-xx IDs your task refers to, and what "done" means |
| 3 | [`_docs/03-architecture.md`](_docs/03-architecture.md) | Modules, data flow, records, LLM boundary |
| 4 | [`_docs/04-ruleset.md`](_docs/04-ruleset.md) | The 10 active rules, severities and judgment calls |
| 5 | [`_docs/06-team-workflow.md`](_docs/06-team-workflow.md) | Who owns which folders; git rules |

Look up anything else in [`_docs/README.md`](_docs/README.md). Why a decision was made: [`_docs/07-decisions.md`](_docs/07-decisions.md). Unanswered questions: [`_docs/08-open-questions.md`](_docs/08-open-questions.md).

## How to work a task

1. **Pull first.** `git pull --rebase`.
2. **Pick a task** from `WORKING_LOG.md` in your own section. Move it to *In progress* with your name. If nothing is assigned, take the first unblocked task in *Next*.
3. **Stay in your folders** (ownership map below). Need a change in someone else's folder or in a frozen contract? Write it under *Blocked* or *Requests* in the log and tell the owner. Don't edit it yourself.
4. **Build the smallest thing that meets the FR's "done when".** Add or update tests for anything in `lib/checks`.
5. **Run checks before committing:** `pnpm typecheck && pnpm test` (once scaffolded).
6. **Commit small and often** (format below), then `git pull --rebase && git push`.
7. **Update `WORKING_LOG.md`** in the same commit: move the task to *Done* with the commit hash, add follow-ups to *Next*, record any decision under *Decisions*.
8. **Changed a decision or a contract?** Update the relevant `_docs/` file in the same commit. Docs that disagree with the code are bugs.

For AI agents: if a task is ambiguous, conflicts with a hard rule, or needs a file outside your ownership, stop and ask the person you're working with rather than guessing. Don't run long unattended edits on shared files.

## Ownership map

Two people, each with their own AI agent. Details and the reasoning: [`_docs/06-team-workflow.md`](_docs/06-team-workflow.md).

| Owner | Folders |
|---|---|
| **Person 1 · Checks** | `lib/checks/`, `lib/llm/`, `lib/rules/`, `lib/gurmukhi/`, `tests/` |
| **Person 2 · App and data** | `app/`, `lib/db/`, `lib/retrieval/`, `scripts/`, `data/` |
| **Frozen contracts** (change only after telling the other person; one commit, then both pull) | `lib/types.ts`, `lib/db/schema.ts`, `package.json`, `pnpm-lock.yaml` |
| **Anyone** | `_docs/`, `WORKING_LOG.md` (your own section only), `README.md` |

Person 2 runs migrations and adds packages. Person 1 asks for schema columns or packages instead of adding them.

## Planned layout

```
app/                  pages (sabad, review, rules, eval) and api/ routes
lib/
  types.ts            Finding, Packet, Rule, Decision, Draft (Zod)   ← frozen
  checks/             l1/ (code checks), llm/ (LLM checks), validator.ts, pipeline.ts
  llm/                adapter.ts, prompts/, schemas.ts, cache.ts
  rules/              load data/rules/rules.resolved.json
  gurmukhi/           normalize, tokenize, stem + ending matra, divine names
  retrieval/          fts.ts (stems), vectors.ts (English embeddings)
  db/                 schema.ts (frozen), client.ts, migrations/
scripts/              ingest.ts, eval.ts, seed-demo.ts
data/
  banidb/             docker-compose.yml for the local BaniDB database
  rules/              rules.resolved.json (copied from _docs/rules/)
  sikhri-sample/      SikhRI's sample, git-ignored
tests/golden/         one test file per active rule
_docs/                project documentation
```

## Commands

Planned; update this list when the scaffold (T-01) lands.

| Command | Does |
|---|---|
| `docker compose -f data/banidb/docker-compose.yml up -d` | Start the local BaniDB database (MariaDB) |
| `pnpm ingest` | Read BaniDB → `eko.db` (lines, words, stems) |
| `pnpm dev` | Run the app at http://localhost:3000 |
| `pnpm test` | Vitest, including golden tests per rule |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm eval` | Backtest held-back drafts → `eval_runs` |
| `python3 _docs/rules/resolve.py` | Regenerate `rules.resolved.json` from the seed and decisions |

## Rules: how to change one

- `rules.seed.json` holds the 66 rules verbatim with structure. Don't hand-edit rule text.
- `resolve.py` holds every judgment call (scope, severity, layers, decision). Edit decisions here.
- Run `python3 _docs/rules/resolve.py` to regenerate `rules.resolved.json`, copy it to `data/rules/`, and record the change in `_docs/07-decisions.md`.
- The app reads only `rules.resolved.json`. Active rules have `resolution.active: true`.

## Conventions

- **TypeScript strict.** Zod schemas in `lib/types.ts` are the source of truth for shared shapes; infer types from them.
- **Checks are pure functions:** `(draft, context) => Finding[]`. No database or network calls inside a check; the pipeline supplies context.
- **LLM calls go only through `lib/llm/adapter.ts`**, use `generateObject` with a Zod schema, and are cached by hash of model, prompt version and packet. Prompts live in `lib/llm/prompts/` with a version number.
- **Every finding stores** rule version, model name and prompt version.
- **Golden tests:** `tests/golden/<rule-id>.test.ts`, built from the synthetic cases in `_docs/rules/RULES_NOTES.md` (section 10). Never put Gurbani text in test fixtures unless it comes from the BaniDB ingest.
- **Commit messages:** `<task-id> <area>: <what changed>`, for example `T-11 checks: TERM-01 capitalized tier`.
- **Secrets** go in `.env.local`, never committed. `.env.example` lists the variable names.
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

## Where to ask

Open questions and their owners: [`_docs/08-open-questions.md`](_docs/08-open-questions.md). Add new ones there rather than deciding silently.
