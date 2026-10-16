# 06 · Team workflow

How two people, each with their own AI coding agent, build Eko in one day without stepping on each other.

## The setup we chose

Merge conflicts come from two agents editing the same files, not from git itself. The options we weighed:

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Split by folder (chosen)** | Each person and their agent own a set of folders. Shared contracts are written together in hour 0–1, then frozen. Small commits to `main`, rebase at least hourly | Both build at full speed; conflicts are rare because nobody edits the other's files | Needs setup discipline; a contract change needs a heads-up |
| B. One driver, one set of agents | One person runs several agents in parallel, each in its own git worktree. The other handles data, reviewer doc, test data, QA and the video | No merge conflicts at all | Coding throughput is one person's attention |
| C. Pair on one machine | Both steer one agent session | Zero conflicts, shared understanding | About half the output; good for the last hour only |

**Plan:** A for hours 1–9, C for the final hour of integration and recording.

## Ownership

| Owner | Folders | Builds |
|---|---|---|
| **Person 1 · Checks** | `lib/checks/`, `lib/llm/`, `lib/rules/`, `lib/gurmukhi/`, `tests/` | Code checks, LLM adapter and prompts, validator, cache, Divine-name matching, CONS-01 and style checks, drift check logic |
| **Person 2 · App and data** | `app/`, `lib/db/`, `lib/retrieval/`, `scripts/`, `data/` | Pages and API routes, schema and migrations, BaniDB ingest, SikhRI sample import and reference lookup, backtest and eval card |
| **Both, frozen after hour 1** | `lib/types.ts`, `lib/db/schema.ts`, `package.json`, `pnpm-lock.yaml` | Change only after telling the other person; one commit, then both pull |

Seams between the two:
- Person 2's report card is built against **mocked findings** in the frozen `Finding` shape until Person 1's checks land.
- Person 1's CONS-01 and style checks call Person 2's **reference lookup** in `lib/retrieval` (task T-38). Agree its function signature in hour 0–1 and put it in `lib/types.ts`.
- Person 2 owns the schema and runs migrations. Person 1 asks for columns via *Requests* in `WORKING_LOG.md`.
- Only one person adds packages at a time (Person 2 by default), so the lockfile doesn't conflict.

## Git rules

- Work on `main`. Commit when a piece works; `git pull --rebase && git push` at least hourly.
- Commit message: `<task-id> <area>: <what changed>`, for example `T-12 checks: LAYER-07 parentheses`.
- Update `WORKING_LOG.md` (your own section) in the same commit as the work.
- Never leave an agent running unattended on a shared file.
- If a rebase conflicts in a file you don't own, stop and ask the owner. Don't resolve it for them.

## Working with AI agents

- Both agents read `CLAUDE.md` at the start of every session; it holds the hard rules, the ownership map and the conventions.
- Start each agent session with the task ID: "Work on T-19 from WORKING_LOG.md." The agent reads the FR it references and the relevant `_docs/` file.
- Keep agent tasks small: one task ID per session or per commit.
- When an agent finishes, it updates `WORKING_LOG.md` and commits. Review the diff before pushing.

## WORKING_LOG.md protocol

[`WORKING_LOG.md`](../WORKING_LOG.md) holds the complete task plan and its state.

- Each person edits only their own section (Done, In progress, Next, Blocked), so the log never conflicts.
- *Decisions* is append-only, with time and name. Planning decisions live in [07-decisions.md](07-decisions.md).
- *Requests between people* is where one person asks the other for a change in their folders.
- The *Integration checklist* is filled in together in the last hour.

## One-day plan

Hours are a plan, not an estimate from past runs. Task IDs are in `WORKING_LOG.md`.

| Hours | Person 1 · Checks | Person 2 · App and data |
|---|---|---|
| 0–1 | Together: scaffold, `CLAUDE.md` check, freeze types and schema, start the BaniDB container, ingest the demo Sabad (T-01 to T-06) | |
| 1–4 | Code checks with golden tests; LLM adapter; model bake-off (T-10 to T-17) | Workspace and report card on mocked findings; review actions with reasons (T-30 to T-35) |
| 4–7 | Divine-name matching, TERM-02, PRIN-04, confirmation tiers, validator, pipeline (T-18 to T-23) | Wire routes to the pipeline; publish gate; SikhRI sample import and reference lookup; attribution (T-36 to T-39) |
| 7–9 | CONS-01, style check, drift check (T-24 to T-26) | Rules page, proposal form, approval and versioning, backtest and eval card (T-40 to T-43) |
| 9–10 | Together (pairing): integrate, seed the demo, run end to end, record the video (T-50 to T-52) | |

If the SikhRI sample is late, Person 2 does T-40 to T-42 before T-38, and Person 1 does T-26 before T-24/T-25.

## Cut order if short on time

1. CONS-01, if the SikhRI sample is late (the reason flow still shows on any flag)
2. Duplicate and scope-change warnings in the drift check (keep contradiction and published-line replay)
3. Per-rule breakdown on the eval card (keep overall catch and false-flag rates)
4. LAYER-06's confirmation tier for ambiguous words (keep the closed archaism list)
