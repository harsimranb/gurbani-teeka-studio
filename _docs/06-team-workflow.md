# 06 · Team workflow

The team builds Eko on macOS and Windows, with AI agents assisting each contributor. **Anyone can work on any task or folder.** Feature workstreams organize related code and dependencies; they are not fixed assignments. Coordinate overlapping edits and use contracts and stubs to work independently.

Model selection and platform-specific setup are defined in [`CLAUDE.md`](../CLAUDE.md#agent-model-policy). Planning uses Opus 5.5 or GPT 6 Sol High; implementation uses Sonnet 5.5 High or Luna High. There is no person-based ownership enforcement.

## Principles

1. **Open contribution, coordinated edits.** Anyone can change any folder or dependency. Announce overlapping work, keep changes task-specific, and preserve other contributors' edits.
2. **Contracts first.** Every seam between streams is a Zod schema or a function signature in `lib/contracts/`, agreed together in hour 0–1.
3. **Stub every seam.** Every consumer can run against a fixture or stub from hour 1, so nobody waits on anybody.
4. **The engine is pure; the app owns I/O.** Engine code (checks, LLM, eval) never imports the database. App code never imports engine internals, only `lib/engine/index.ts`. This single rule removes most integration conflicts.
5. **Each stream keeps private storage private.** If only one stream reads something (LLM cache, embeddings, eval output), it lives in that stream's own file, not in the shared database schema.
6. **Integrate on a schedule.** Four short checkpoints wire the streams together, so integration problems surface at hour 3, not hour 9.
7. **Stop at acceptance.** Keep each hackathon task small and correct; do not add a new service, framework or generalized subsystem for a feature that fits the existing process and database.

## Workstreams

| Stream | Builds | Related folders |
|---|---|---|
| **CONTRACTS** | Domain schemas, API request/response schemas, ports (function signatures), fixtures | `lib/contracts/` |
| **PLATFORM** | Scaffold, root config, dependencies, dev scripts | `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.*`, `tailwind.config.*`, `postcss.config.*`, `drizzle.config.*`, `vitest.config.*`, `.env.example`, `scripts/dev/` |
| **DATA** | Schema and migrations, repository functions, BaniDB ingest, SikhRI sample import, demo seed | `lib/server/db/`, `lib/server/ingest/`, `scripts/app/`, `data/banidb/`, `data/sikhri-sample/` |
| **API** | Route handlers, services (review, publish gate, rules, proposals, versioning) | `app/api/`, `lib/server/services/` |
| **FE** | Pages, components, typed API client with mock mode | `app/(studio)/`, `app/layout.tsx`, `app/globals.css`, `components/`, `lib/client/`, `public/` |
| **CHECKS** | Gurmukhi module, rules logic, code checks, validator, pipeline, engine entry point | `lib/engine/checks/`, `lib/engine/gurmukhi/`, `lib/engine/rules/`, `lib/engine/index.ts` |
| **LLM** | Adapter, cache, prompts, LLM checks, generic rule judge, reference retrieval, drift check, bake-off | `lib/engine/llm/`, `lib/engine/retrieval/`, `lib/engine/drift/`, `data/cache/` |
| **EVAL** | Backtest, metrics, eval output file | `lib/engine/eval/`, `scripts/engine/`, `data/eval/` |
| **DOCS** | Documentation, log | `_docs/`, `README.md`, `WORKING_LOG.md`, `CLAUDE.md` |

Tests live **next to the code** in each stream's folders (`*.test.ts`), so there's no shared `tests/` folder.

### Parallel work

Choose ready tasks by dependency and acceptance criteria. The engine and app can progress in parallel against the shared contract stubs. Use separate worktrees for independent concurrent agent tasks; coordinate shared files and contract changes before editing. Contributors may pick or hand off individual tasks; coordinate active edits instead of requiring whole-stream reassignment.

## Folder map

```
lib/
  contracts/                 CONTRACTS
    domain.ts                Line, Word, Draft, Finding, Decision, Rule, Proposal, DriftResult, Reference, ReviewCorrection, EvalRun
    api.ts                   request/response schema for every route
    ports.ts                 Engine interface: runChecks, runDriftCheck, indexReferences
    fixtures/                demo Sabad (exported from BaniDB), findings, references, corrections, eval run
  engine/                    CHECKS / LLM / EVAL
    index.ts                 CHECKS: the only file the app imports. Starts as a stub
    checks/                  CHECKS: l1/, validator.ts, pipeline.ts
    gurmukhi/                CHECKS: tokenize, stem + ending matra, Divine names
    rules/                   CHECKS: active rules, prefilters
    llm/                     LLM: adapter, cache, prompts/, checks/
    retrieval/               LLM: reference index (in memory) + embeddings
    drift/                   LLM: drift check
    eval/                    EVAL: backtest, metrics
  server/                    DATA / API
    db/                      DATA: schema.ts, client.ts, repo.ts, migrations/
    ingest/                  DATA: banidb.ts, sikhri-sample.ts
    services/                API: review, publish, rules, proposals
  client/                    FE: api.ts (typed client), mocks.ts
app/
  api/                       API: thin route handlers
  (studio)/                  FE: pages
  layout.tsx, globals.css    FE
components/                  FE
scripts/
  app/                       DATA: ingest.ts, import-sample.ts, seed-demo.ts
  engine/                    EVAL / LLM: eval.ts, bakeoff.ts
  dev/                       PLATFORM: cross-platform development tools
data/
  banidb/                    DATA: docker-compose.yml
  sikhri-sample/             DATA: raw + normalized/ (git-ignored)
  cache/                     LLM: llm-cache.db, embeddings (git-ignored)
  eval/                      EVAL: latest.json (git-ignored)
_docs/rules/                 DOCS: rules.resolved.json is read directly; no copy
```

## Contracts

Written together in hour 0–1 and committed as **contracts v1**.

| File | Holds | Used by |
|---|---|---|
| `domain.ts` | Zod schemas for every record crossing a seam, including `CheckResult` and persisted `CheckRun` | Everyone |
| `api.ts` | Request and response schema per route, plus the route list | FE (client and mocks), API (handlers validate responses) |
| `ports.ts` | The `Engine` interface below | API calls it; CHECKS/LLM implement it |
| `fixtures/` | Valid instances of every schema | Stubs, mocks, tests |

The `Engine` port, the main engine/app seam:

```ts
// lib/contracts/ports.ts (shape to agree in hour 0; names are a starting point)
export interface Engine {
  // phase 'code' returns in < 1 s; phase 'llm' runs prefiltered LLM checks
  runChecks(input: CheckInput, phase: 'code' | 'llm'): Promise<CheckResult>;
  runDriftCheck(proposal: Proposal, ctx: DriftContext): Promise<DriftResult[]>;
  indexReferences(refs: Reference[]): Promise<void>; // after publish or sample import
}

type CheckResult = {
  findings: Finding[]; // each passes the exact-span and ID validator
  notEvaluable: { ruleId: string; reason: string }[]; // no fabricated finding
};

// Everything the engine needs, passed in by the API. The engine never queries the DB.
type CheckInput = {
  sabad: { lines: Line[] };            // Gurmukhi from BaniDB, NFC
  draft: Draft;                        // transcreation text + line IDs
  sabadDrafts: Draft[];                // current authored units, including draft
  changedLineIds: string[];
  rules: Rule[];                       // current ruleset version, from the DB
  rulesetVersion: number;
  references: Reference[];             // current reference snapshot from the app
};
```

`changedLineIds` contains all BaniDB line IDs covered by each edited authored tukk/group; the engine also re-evaluates any Sabad-scoped checks whose result depends on them. `sabadDrafts` supplies the current authored-unit snapshot, including the selected `draft`, so first-use and collapse checks can inspect other units without database access. Units belong to this Sabad and cannot overlap source line IDs. Finding offsets are end-exclusive UTF-16 code-unit positions into the authored English draft: `draft.text.slice(start, end) === quoted_span`. The API passes the current reference snapshot on each check, so a process restart cannot leave the in-memory retrieval index empty. `indexReferences` may warm/update the engine-private index after import or publish, but correctness cannot depend on that warm state. The API stores a `CheckRun` for each affected authored unit and phase, and persists results only when the captured Sabad draft snapshot and ruleset versions still match the request. A sibling edit can invalidate a dependent check even if the selected draft version is unchanged. The publish gate requires successful code and model `CheckRun` records for those same versions. A per-rule `notEvaluable` result is visible but is not a finding or a failed phase.

### Contract change protocol

| Change | Allowed | How |
|---|---|---|
| **Additive:** new optional field, new schema, new route, new fixture | Any time | A commit that touches only `lib/contracts/`, message `CONTRACT: …`. Add a line under *Decisions* in `WORKING_LOG.md` and notify active consumers |
| **Breaking:** rename, remove, make a field required, change a signature | At a checkpoint (M1–M3), with affected contributors coordinated | Same commit rules; affected consumers update their code before continuing |

Never mix contract changes with other code in one commit; it keeps rebase conflicts trivial.

## Dependency map

**Engine/app seams** (the ones that can block another task):

| # | Seam | Provider → consumer | Contract | Stub until ready | Real one needed by |
|---|---|---|---|---|---|
| **S1** | Run checks | CHECKS + LLM → API | `Engine.runChecks`, `CheckResult`, `Finding` | `lib/engine/index.ts` returns `fixtures/check-result` from hour 1 | M1 (code phase), M2 (LLM phase) |
| **S2** | Check input | DATA + API → CHECKS + LLM | `CheckInput`, `Line`, `Rule`, `Reference` | Local, git-ignored `fixtures/sabad.demo.json` exported from BaniDB in hour 0 | Hour 1 (fixture is enough until M1) |
| **S3** | SikhRI sample | DATA → LLM retrieval and EVAL | `Reference`, `ReviewCorrection` as JSON files in `data/sikhri-sample/normalized/` | `fixtures/references.json`, `fixtures/corrections.json` (labelled test data) | M2 (references), M3 (corrections) |
| **S4** | Drift check | LLM → API | `Engine.runDriftCheck`, `DriftResult` | Stub reports `not_evaluable` explicitly | M3 |
| S5 | Eval results | EVAL → API → FE | `EvalRun` written to `data/eval/latest.json` | `fixtures/eval-run.json` | M3 |
| S6 | Published references | API → retrieval | `Engine.indexReferences` | No-op | M2 |
| S7 | New approved rules | API → LLM generic rule judge | `Rule` with `check_type: "free_text_llm"` | Rule appears on the rules page but isn't checked | M3 (beat 5) |

**Other workstream seams** (still contract-first, regardless of who implements them):

| Seam | Provider → consumer | Contract | Stub |
|---|---|---|---|
| API shapes | API → FE | `api.ts` | `lib/client` mock mode (`NEXT_PUBLIC_USE_MOCKS=1`) serves fixtures |
| Repository | DATA → API | functions in `lib/server/db/repo.ts` | In-memory repo seeded from fixtures |
| LLM checks in pipeline | LLM → CHECKS | `LlmCheck` type inside `lib/engine` | Pipeline runs code checks only |
| Reference lookup | LLM retrieval → CHECKS (CONS-01) | `ReferenceLookup` inside `lib/engine` | Returns no references; CONS-01 stays silent |

**Removed dependencies.** These would have coupled independent tasks, so they're designed out:

| Would have been | Removed by |
|---|---|
| DATA needing the Gurmukhi module for stems at ingest | Ingest stores NFC lines only; the engine computes stems in memory when it receives `CheckInput` |
| LLM cache and embeddings tables in the shared schema | Kept in LLM's own files under `data/cache/` |
| Eval results table in the shared schema | Eval writes `data/eval/latest.json`; the API just reads the file |
| Copying `rules.resolved.json` into `data/` | The DATA seed and the CHECKS tests both read `_docs/rules/rules.resolved.json` directly |
| Engine reading the database for references | The API passes references in; the engine keeps its own in-memory index |
| Adding packages mid-day | All known packages are installed in hour 0 (list below) |

### Critical path

```
hour 0  BaniDB container up → demo Sabad exported to fixtures   (DATA, blocks everyone)
        contracts v1 frozen                                      (shared)
hour 1–3  code checks  ‖  workspace + report card on mocks
M1      API calls engine.runChecks('code') on the real Sabad → findings in the UI
hour 3–6  LLM checks  ‖  review actions, publish gate, sample import
M2      LLM findings + override with reason + publish
hour 6–8  drift, rule judge, eval  ‖  rules page, proposals, eval card
M3      propose → drift → approve → re-check uses new rule; eval numbers shown
```

**Top risk:** the BaniDB container in hour 0. If it isn't running within 30 minutes, the [BaniDB API source](https://github.com/KhalisFoundation/banidb-api/blob/dev/swagger.json) documents `GET /v2/shabads/{shabadID}` as a fallback; verify the live endpoint and terms before one local export into the git-ignored fixture, then fix ingest later. Never hand-type or commit Gurmukhi into a fixture.

## Checkpoints

Each is about 15 minutes with the active contributors, run against `main`. The hour labels are planning estimates; milestone order and acceptance conditions govern progress (D-61).

| Checkpoint | When | Must work | If it doesn't |
|---|---|---|---|
| **M0** | End of hour 1 | `pnpm dev` and `pnpm test` pass; contracts v1 committed; demo Sabad fixture from BaniDB; engine stub and client mocks compile; private-data ignore rules verified | Don't split up until it does |
| **M1** | Hour 3 | Thin slice: save a transcreation in the UI → real API → `runChecks('code')` → real findings shown with highlights | Fix the seam first, then go back to streams |
| **M2** | Hour 6 | LLM findings; override and waive need a reason; publish blocked by must-fix/incomplete checks; reference findings if an applicable source exists | Decide cuts now (cut order below) |
| **M3** | Hour 8 | Propose → drift → approve → the next check uses the new rule; eval card shows backtest numbers | Drop the eval card for a table in the video |
| **M4** | Hour 9–10 | Demo end to end; video recorded | |

## One-day plan by stream

Task IDs match [`WORKING_LOG.md`](../WORKING_LOG.md).

| Hours | Engine work | App work |
|---|---|---|
| 0–1 | Together: PLATFORM scaffold and packages (C-01), contracts v1 and stubs (C-02), BaniDB up and demo Sabad fixture (C-03), fixtures (C-04), private-data checks (C-05) | |
| 1–3 | CHECKS: Gurmukhi module, 5 code checks with tests, validator, pipeline code phase, engine entry point | FE: workspace and report card on mocks. DATA: schema, repo, BaniDB ingest, rules seed |
| **M1** | | |
| 3–6 | LLM: adapter, cache, bake-off, TERM-02, PRIN-04, confirmation tiers, pipeline LLM phase. Retrieval index | API: check routes, review actions, publish gate. FE: review UI. DATA: sample import and normalized files |
| **M2** | | |
| 6–8 | LLM: CONS-01 and style with references, generic rule judge, drift check. EVAL: backtest and `latest.json` | API: rules, proposals, approval and versioning, eval route. FE: rules page, proposal and drift UI, eval card |
| **M3** | | |
| 8–10 | Together: fix integration issues, seed the demo, record the video (INT-01 to INT-03) | |

If the SikhRI sample is late: prioritize rules, proposals and approval before sample import; drift and the rule judge can proceed independently. Style may still use clearly labelled Eko-published references; deterministic CONS-01 waits for explicit term mapping.

## Conflict hotspots

| File or area | Risk | Rule |
|---|---|---|
| `package.json`, `pnpm-lock.yaml` | Both agents add packages → lockfile conflict | Pin dependencies and coordinate concurrent package/lockfile edits; anyone may add needed packages |
| `lib/contracts/` | Both edit | Protocol above; contract-only commits |
| `lib/server/db/schema.ts`, migrations | Migration order clashes | Coordinate migration order. Engine never needs an app table (principle 5) |
| `app/layout.tsx`, `globals.css`, `components/ui/` | Agents restyle shared UI | Coordinate shared UI edits and reuse existing components |
| `.env.example` | Both add keys | Append-only; add your line at the end |
| `WORKING_LOG.md` | Both edit | Anyone may update task status; coordinate simultaneous log edits |
| `CLAUDE.md` | Conflicting agent instructions | Record explicit user policy changes and reconcile related docs |
| Next.js route groups | `app/api/` vs `app/(studio)/` collide on routes | Pages never under `app/api/`; API routes never outside it |

### Packages to install in hour 0

Pin exact versions at install time. Anyone may update dependencies when needed; coordinate concurrent lockfile edits and install natively on each platform.

| Purpose | Packages |
|---|---|
| App | next, react, react-dom, typescript, @types/node, @types/react |
| UI | tailwindcss, @tailwindcss/postcss, postcss, shadcn CLI and component peers (class-variance-authority, clsx, tailwind-merge, lucide-react, tw-animate-css) |
| Data | drizzle-orm, drizzle-kit, better-sqlite3, @types/better-sqlite3, mysql2 |
| Contracts | zod |
| LLM | ai (Vercel AI SDK) and the provider packages for the bake-off (e.g. @ai-sdk/anthropic, @ai-sdk/openai), p-limit |
| Retrieval | @huggingface/transformers |
| Dev | vitest, tsx |

## Guardrails

- **Anyone can contribute.** No folder permissions, person identity, or ownership hook are required.
- **Private data stays ignored.** Verify BaniDB/SikhRI exports, local credentials, databases and caches remain out of Git in every clone.
- **Cross-platform development.** Follow [`CLAUDE.md`](../CLAUDE.md#development-on-macos-and-windows); install dependencies per machine and use shell-appropriate environment syntax. Do not infer Windows verification from macOS results.
- **Typecheck and tests before push:** `pnpm typecheck && pnpm test`.
- **Contract tests:** API handlers validate their responses against `api.ts` in tests, and the engine's real output is validated against `Finding`. A contract drift fails a test, not the demo.

## Git rules

- Trunk-based: work on `main`, make a small reviewed commit and push at the end of each approved task and before a checkpoint. Pull/rebase when safe; preserve unrelated local changes.
- Commit message: `<task-id> <stream>: <what changed>`, for example `CHK-04 checks: LAYER-07 parentheses`.
- Update `WORKING_LOG.md` (the relevant task section) in the same commit as the work; report the final commit hash after the commit and push.
- If a rebase conflicts with concurrent work, coordinate with the contributor and preserve their changes before resolving it.

## Working with AI agents

- Follow the end-to-end harness in [`CLAUDE.md`](../CLAUDE.md#end-to-end-agent-workflow): load context, ask the user which ready task to take unless already specified, identify dependencies/overlap, get approval on a small plan, implement, verify, use a fresh subagent for correctness review, fix valid findings, then commit and push.
- Each implementation session owns one task ID. Two independent tasks may run in parallel only in separate worktrees and only when their files and seams do not overlap; this is optional, not a requirement for a small hackathon task.
- An agent that needs a breaking contract change coordinates at a checkpoint; it updates all affected consumers only within the agreed task scope. Never leave an agent running unattended on shared files.

## Cut order if short on time

Decide at M2.

1. CONS-01 and the style check, if neither SikhRI-supplied nor Eko-published references provide applicable evidence (the reason flow still shows on any flag)
2. Duplicate and scope-change warnings in the drift check
3. Per-rule breakdown on the eval card (keep overall catch and false-flag rates)
4. LAYER-06's confirmation tier for ambiguous words
5. Eval card UI (show `latest.json` as a table in the video instead)
