# 11 · Execution readiness and decisions

Critical pass on 2026-10-16 over [requirements](02-requirements.md), [architecture](03-architecture.md), [resolved rules](rules/rules.resolved.json), [team workflow](06-team-workflow.md), [mockup map](09-ui-mockups.md), [feature acceptance](10-feature-breakdown.md), and [working log](../WORKING_LOG.md). This is the kickoff gate for the two builders. It records what is settled, what needs a decision, and what can proceed while external data is absent.

## Current status

- **Open contribution across macOS and Windows.** Anyone may work on any task or folder (D-71); the former person-based hook/map and identity setup are removed. Each clone must verify private-data ignores, provision private inputs and install dependencies natively. Follow `CLAUDE.md` for model policy and platform setup (D-72/73). macOS verification does not prove Windows readiness.
- **The minimal C-01 app scaffold is complete.** Node 22 and pnpm 11 are present. C-03 started Docker and inspected `banidb-dev`: its Guru Granth Sahib source has 20,134 verse rows and 39,977 missing mapped verses, despite covering all 1430 angs. No complete local Sabad has the required writer metadata. A complete 15-line BaniDB API fallback fixture is private; local database-export acceptance still needs a fuller source. LLM credentials remain unverified (P-08), and no product workflow exists yet.
- **C-02 contracts v1 are complete.** Domain records, 18 P0 route contracts, the pure engine port, minimal labelled fixtures and synthetic client/engine stubs pass typecheck and the combined 34-test suite. Stub findings are tied to current input evidence; unavailable checks, drift and evaluation are explicit. Real API handlers, checks, storage and C-04's broader fixtures remain later tasks.
- **Neither SikhRI dataset has arrived** (Harsimran, 2026-10-16). Eko-published references may exercise citation mechanics, but they do not prove consistency against SikhRI's earlier approved corpus. The real-corrections backtest and video beat 6 cannot be accepted without pre-edit drafts.
- **Rules are internally consistent at this point:** 66 total, eight active text checks, CONS-02 suppressor and CONS-03 by design. Rule text is unchanged. CONS-01 remains a warning with `publish_requires_reason: true` (D-56).

## Decisions already made in this pass

| Decision | Agent instruction | Record |
|---|---|---|
| Review scope | Human-written English transcreation only; no generated translation or Gurmukhi; every finding cites exact evidence | D-02/03, `CLAUDE.md` |
| Reference authority | SikhRI-supplied and Eko-published references rank equally by source; keep source and exception marks visible | D-57 |
| CONS-01 publish policy | A reason is required before publishing a departure. Other open warnings do not block; errors/flags and incomplete current check phases do | D-56, FR-13 |
| Ruleset display | Seed integer 1 displays as `v1`; one approved change displays as `v2`; never use the PDF's illustrative `v0.1` as stored state | D-53 |
| Check invalidation | Check edited authored units and affected Sabad-scoped rules; reject late results for old draft/ruleset versions | D-54, FR-06/12 |
| Finding offsets | End-exclusive UTF-16 code-unit offsets into the authored English draft; `text.slice(start, end)` must equal the quoted span | C-02, CHK-09 |
| Reference index lifetime | Pass the current reference snapshot in `CheckInput` on each check. `indexReferences` may warm/update an index, but a cold process restart must still work | `_docs/06` port |
| AI SDK call | Pin versions at C-01; use the pinned SDK's supported structured-output API. The [current official guide](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) uses `generateText` with `Output.object` | D-35 |
| Model output | Use strict review-only `FindingBatch` and `DriftAssessment` schemas. A packet with no issue has an empty batch; an uncheckable packet reports `not_evaluable` without a fabricated finding | D-59 |
| Free-text proposals | Any proposal may be approved and attempted at the next check; only evidence-backed exact-span findings are emitted | D-60 |
| Timing | Checkpoint hours are estimates; milestone order and acceptance are the gates | D-61 |
| Drift replay threshold | Use the documented provisional `affected_count >= 1` block with IDs/source counts; SikhRI can revise it later | D-63, OQ-07 |
| Engine boundary | Code checks and ports do not access the shared app database; the approved engine-private LLM cache/embedding files are allowed by D-45 | D-44/45 |

## Decisions required before dependent work

| Gate | Owner and latest safe point | Question and recommended default; approval is still needed | Blocks |
|---|---|---|---|
| **OQ-13 · Glossary authority** | SikhRI/Harsimran, before LLM-10 | What is the source of a “preferred rendering” for a blocking glossary collision? **Recommendation:** use explicit SikhRI preferences if supplied; otherwise report this drift subcheck unavailable, not pass. | Drift evidence and approval |
| **OQ-14 · Backtest labels** | SikhRI/Harsimran, before EVAL-01 | Which review edits count as in-scope corrections and how are changed spans aligned to findings? **Recommendation:** agree on the denominator and exclusion labels before computing rates; report unmatched corrections separately. | Credible catch/false-flag rates |
| **OQ-17 · Term mapping** | SikhRI/CHECKS contributor, before CHK-12 | Does the reference sample map source terms to English renderings? **Default until known:** no deterministic term-level CONS-01 finding from line-level English alone; LLM-09 may compare cited English references without claiming such mapping. | CHK-12 evidence validity |
| **OQ-16 · Cross-platform private access** | Contributors, before C-05/M0 | Verify each macOS/Windows clone and share the PDF and private BaniDB fixture through an approved private path. Person assignments and identity setup are no longer required. | Per-clone privacy checks and M0 |

## External inputs and release conditions

| Input | Owner | Decision/use |
|---|---|
| **P-04 / OQ-03: SikhRI sample** | SikhRI organizers | Request approved transcreations, review history **with pre-edit drafts**, IDs and layer. Neither arrived as of this pass. Without any applicable reference, show “unavailable”; without pre-edit drafts, do not claim a real backtest or a complete beat 6. Confirm whether Eko-published citations alone satisfy the video’s beat 3 wording. |
| **P-05/P-06 / OQ-04/05: BaniDB** | Khalis Foundation/team | Verify image completeness and ask how a 1–3 Sabad demo, local database copy, private fixture sharing, attribution/logo, refresh and contributions comply with the [published terms](https://www.banidb.com/tos/). The terms include entire-data-use and 90-day-refresh conditions for database copies. Until clarified, do not commit a Gurmukhi export or represent a subset as licensed for redistribution. |
| **P-01/P-02/P-03 / OQ-01/02/08: SikhRI review** | Harsimran/SikhRI | Approve the four reviewer-doc additions before sending, then fold answers and the promised style guide into `resolve.py`; regenerate and log any changed rule decisions. |
| **P-08: model access** | Both builders | Obtain keys for the bake-off or decide which single provider can be tested. A model choice is not approved until the minimal-pairs results and latency are recorded. |
| **Local embedding asset** | LLM contributor | Verify that the Transformers.js model weights can be fetched and cached before retrieval is on the demo path. If unavailable, show lexical/reference lookup only and mark English-similarity retrieval unavailable; never claim embeddings ran. |

## M0 contract checklist for the agents

Before separate work begins, C-02 must record these in `lib/contracts/` and validate fixture instances:

1. A route inventory and request/response schema for each P0 API action; no translation-generation route.
2. `Draft.version`, grouped `line_ids`, exact span offset convention, current/cleared `Finding` state, and `Decision` actor/reason/version.
3. Engine `CheckResult = {findings, notEvaluable}` and durable app `CheckRun` phase status (`pending`, `succeeded`, `failed`) keyed by draft and ruleset version; stale result rejection and retry behavior.
4. `CheckInput.references` and `DriftContext.references` as current snapshots, `Reference.source` and structured `exceptions[]` linked to rule ID, decision/action and reason; source weight is equal while marks remain visible and drift replay reports source-labelled counts.
5. The rule fields `blocks_publish` and optional `publish_requires_reason`, with CONS-01 as the only seeded rule requiring a reason at publish.
6. Strict per-packet `FindingBatch`: `{status: "evaluated", findings: Finding[]}` (an empty array means no issue), or `{status: "not_evaluable", findings: [], reason: string}`. Drift uses `DriftAssessment`; neither output has a translation field. Define drift evidence and an `EvalRun` with explicit numerator/denominator fields and an unavailable state; settle the inclusion/matching policy in OQ-14 before EVAL-01.

**May proceed now:** C-01 scaffold/version pinning, C-02 contracts using the settled review schemas, C-05 per-clone private-data ignore verification, deterministic rule checks against labelled synthetic English cases, and FE layout against mocks. **Do not claim M0 complete** until the contracts, BaniDB-backed local fixture and guardrails work. Do not claim F3 against SikhRI's corpus or F7 against real corrections until P-04 arrives.
