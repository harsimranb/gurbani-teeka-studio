# 09 · UI mockups and build mapping

Harsimran supplied an eight-page PDF, **Eko UI Mockups**, on 2026-10-16 (SHA-256 `fb3d76042e691dc97801df5f770924396153bd131bdda77607d9454fc156a9ae`). The source file is outside this repository; ask Harsimran for it when working from another machine. This page captures the screens as a build reference without copying the PDF or its Gurbani examples into the repo. It is a design reference, not a new ruleset or a source of BaniDB fixtures. Requirements in [02](02-requirements.md), rule decisions in [04](04-ruleset.md), and the task priorities in [WORKING_LOG.md](../WORKING_LOG.md) take precedence where mockup labels differ.

The ordered task breakdown and acceptance checks for these screens are in [10-feature-breakdown.md](10-feature-breakdown.md).

## Screen map

| PDF page | Screen and interaction to build | Priority and owner |
|---|---|---|
| 1 | First-visit name prompt; name persists in this browser and can be changed from the top bar. Shared navigation shows Workspace, Review, Rules, Evaluation, current ruleset version and BaniDB attribution/logo. | P0 · FE-01, FR-20/21 |
| 2 | Sabad workspace: list of the 1–3 demo Sabads with status; selected Sabad metadata; BaniDB Gurmukhi read-only; English transcreation per tukk or grouped tukks; save feedback shows which lines changed, then code and model check progress independently; report-card and ready-for-review actions. | P0 · FE-03/04, API-02/03, FR-01/02/03/06. Full browse and word lookup are P1 · FE-10/11, FR-04/05. Grammar hints remain P1 · FR-10. |
| 3 | Report card: source and draft beside findings; exact quoted English spans highlighted; severity, rule ID/text, evidence and valid reference links; code/model provenance and rule/prompt versions; visible publish blockers; stale findings are not shown as current. Approved rules that cannot be judged from this draft show `not_evaluable`, not a fabricated finding. | P0 · FE-04, CHK-09, API-03/04, FR-07/12/13. A validator status/count is useful when available, but the validator itself is required. |
| 4 | Review queue and one-draft review view: current draft version, decision history, cleared findings after re-check, and accept/override/waive actions. Every action requires a reason; an open error or flag names the blocker at publish. Ordinary warnings do not block, but a CONS-01 departure needs a recorded reason before publish. | P0 · FE-05/06, API-04/05, FR-03/11/12/13. |
| 5 | Published state: show author, approver, time, ruleset version, reference IDs, source labels and reasons/exception markers. Index the published text with equal source weight to SikhRI-supplied references while preserving waiver, override and context-departure marks. | P0 · API-05, LLM-07/08, FE-06, FR-14. |
| 6 | Rules proposal: free-text rule, example and reason; submit to drift check; show contradiction, published-line impact and glossary collision with evidence; approve or override a block only with a reason. | P0 · FE-08, API-07/08, LLM-10, FR-16/17/18. Duplicate/scope-change commentary and proposals drafted from repeated overrides are P1 · LLM-11, API-10, FR-16b. |
| 7 | Rules list and detail: all 66 draft rules, dynamically computed active/later/guidance/process/removed/merged counts, severity, check plan, team decision and provenance. | P0 · FE-07, API-06, FR-15. A browsable version-history tab and prefilled “propose a change” action are P1. |
| 8 | Evaluation: show the latest real-corrections backtest's catch rate, false-flag rate, sample size and ruleset version; show a clear unavailable state when pre-edit drafts have not arrived. Keep per-rule and per-version numbers in the eval output; the detailed UI table is a planned M2 cut if time is short. | P0 · EVAL-01/02, API-09, FE-09, FR-19. Running a backtest and exporting JSON from the browser, plus individual caught/missed/false-flag examples, are P1; the P0 run is `pnpm eval`. |

## Visual and interaction guidance

- Use the mockup's restrained desktop layout: light gray canvas, white cards, dark navy primary actions, orange selection/accent, green completion, and distinct error/flag/warning/hint states. Color must not be the only way to read status; keep text labels and visible focus states.
- Keep Gurmukhi visually distinct in Noto Sans Gurmukhi with a system fallback, and read-only. The English transcreation uses a readable text treatment. IDs, versions, timing and provenance may use a compact monospace treatment.
- Keep the four main destinations visible. Show the current ruleset version from live data, not a hard-coded mockup label. The same applies to counts, latency, citations, reviewer names and evaluation numbers.
- Preserve the two-step check response: code results first, model results second. Show loading, cached and completed states without implying that a pending model check has passed.
- Grouped tukks remain one authored transcreation tied to all constituent BaniDB line IDs. A finding still has to quote an exact span from that authored English text; source-line highlights are supporting evidence, not a substitute for the quoted span.
- Use actual BaniDB exports for all displayed Gurmukhi. The PDF's example text, IDs, reference renderings, names, counts, performance numbers and logo placeholder are illustrative and must not be copied into fixtures as authoritative data. Use the real BaniDB logo for FR-21.

## Corrections to the mockup before implementation

| Mockup label | Build rule |
|---|---|
| Page 7 says 9 active and lists PRIN-04 as removed. | The current resolved file has **10 active**: eight checks, CONS-02 as a suppressor, and CONS-03 by design. PRIN-04 is an active check; three rules are removed. Derive category counts from the resolved rules instead of typing them into the UI. |
| Pages show `v0.1` and a possible `v0.2`; DATA-04 seeds database version 1. | Use the stored integer as the display version: initial `v1`, then `v2` after one approval. Do not infer an approved next version from a proposal. |
| Page 5 includes “warnings without a reason” in the publish summary. | Ordinary open warnings do not block. A CONS-01 departure needs a recorded reason before publish (CONS-03). Show that reason requirement separately from error/flag blockers. |
| Page 8 has Run backtest and Export JSON buttons. | Keep the planned CLI backtest and read-only eval API as P0. Treat browser-triggered runs and export as P1 so no new server execution route is assumed in hour 0 contracts. |
| Some findings, reference IDs, severities and performance timings are illustrative. | The generated ruleset and validator decide real severity and evidence. Never claim a check passed, cite a reference, or show a measured rate until the corresponding engine result exists. |

## Demo path through the screens

Name prompt → write and save in Workspace → code finding then model/reference finding in Report card → review with a recorded reason → publish and show reference/exception marks → propose and approve a rule after drift check → show the backtest with real sample size. This follows the six beats in [01](01-problem-statement.md#what-the-video-must-show); beat 3 and beat 6 still depend on SikhRI's sample.
