# All 66 rules across six layers

## Intent

Eko currently stores all 66 seed rules, but activates only ten resolutions: eight transcreation checks, one suppressor and one rule enforced by workflow. The requested change is to make all 66 operative across literal translation, transcreation, annotation, transcription, publication and process. The three team-removed rules (PRIN-03, TERM-04, TERM-05) return. Eko should produce automated findings wherever the submitted content and trusted evidence support them.

This explicitly supersedes the current transcreation-only product rule in `CLAUDE.md` and the corresponding requirements, acceptance criteria and readiness notes. Update those documents in the implementation before representing the new layers as supported. The prohibitions on model-written translation and fabricated Gurmukhi remain.

## Goals and boundaries

- Retain the 66 source texts verbatim and make every rule's applicability, execution mode and latest outcome visible.
- Let people author the additional layers. Eko itself never writes, rewrites or suggests a translation or Gurmukhi text. Gurmukhi remains BaniDB-sourced, NFC, and read-only. For ANNO-07, a form absent from BaniDB is `not_evaluable`; there is no manual Gurmukhi entry.
- Validate every text finding against a current exact span and existing rule/reference IDs. Keep semantic checks review-only and allow `not_evaluable` when evidence is insufficient.
- Keep human decisions, waivers, rule approvals and process attestations attributable to a typed name and written reason.
- Preserve existing transcreation drafts, reports, decisions and publications through additive storage changes.
- Treat process and publication obligations as workflow assessments with event evidence; do not fabricate an English quote solely to fit the existing text-finding schema.

## Experience

The Sabad workspace gains a layer switch for literal translation, transcreation, word annotation, transcription and human-authored publication notes. Publication notes remain separate drafts and never enter the transcreation reference set. The source line stays read-only. Each authored item is explicitly identified by its layer, source line or word, author and version. The report groups results by layer and shows checked, needs review, and cannot evaluate states per rule. A reviewer can open the source text, submitted text and cited reference or event. Publication names open blockers and unfulfilled process steps.

The rules catalog defaults to all 66, with filters for layer and outcome. It shows a separate count of rules present, applicable, actually evaluated, and currently passing. It never equates catalog presence or attempted execution with compliance.

## Rule disposition

Every ID receives an explicit implementation mode in `resolve.py`; the generated resolved file remains the sole seed. The initial classification below is a design call for implementation, not a change to verbatim rule text or to the authority of a SikhRI reviewer.

| Mode | IDs and behavior |
|---|---|
| Existing text checks, extended to applicable layers | PRIN-04, TERM-01/02/03/07, LAYER-06/07, CONS-01. Keep their current guards and exact-span validation; extend only where the rule applies and the authored layer exists. |
| Deterministic checks on new structured inputs | LAYER-02 and the punctuation/markup part of LAYER-03; ANNO-02/04/05/07/08; TRAN-02/03/04/06/07/08/09/10/11/12/13/14/15/16. Mechanical claims need appropriate field structure and sourced character data. Where pronunciation or etymology changes the answer, report uncertainty. |
| Evidence-grounded model checks | PRIN-01/06/07/08, TERM-04/05/06, LAYER-01/05/08/09, CONS-04, ANNO-01/03/06/09/10, TRAN-01/05, and the meaning/coverage part of LAYER-03. A model may flag only an exact submitted span with a rule ID, explanation and valid evidence; otherwise it returns `not_evaluable`. Broad goals and subjective guidance remain reviewer guidance rather than publish-blocking claims unless reviewer-approved criteria exist. |
| Workflow, suppressor and cross-record checks | PRIN-02/03/05/09, TERM-08/09, FLOW-01/02/03/04/05/06/07, LAYER-04/10, CONS-02/03, ANNO-11. These assess stored sequence, source-word recurrence, structural separation, acknowledgments, consultation, reasons and interpretive deliberation. Missing or contradictory records become event-backed assessments rather than fake text findings. |

The merged TERM-09 becomes its own workflow check rather than double-flagging CONS-01; it checks glossary consultation before a new rendering. PRIN-09 and FLOW-07 are both recorded but may share one evidence event. LAYER-04 permits word-order changes; additions are assessed under LAYER-03. LAYER-10 remains an umbrella: Eko shows the specific TERM finding when one exists and records LAYER-10 as covered by it, without duplicate alerts. TERM-08 needs Sabad-wide source-word recurrence and a reasoned CONS-02 departure. TRAN-01's pronunciation precedence limits mechanical transcription findings rather than being overridden by them.

## Inputs and evidence

The contract adds a layer-specific authored item discriminated union. Literal and transcreation units contain human-authored English. A literal unit also records which source word occurrences its submitted spans cover and which English spans the author marks as added for clarity; that alignment is evidence for LAYER-01/03, never model-generated text. Annotations are keyed to a BaniDB word occurrence and have separate fields for meanings, grammar and language forms. Transcription holds human-authored Roman text, keyed to source words or lines. Publication notes are human-authored drafts; fuller cited commentary, footnote decisions and publication records remain follow-up work. Process records contain attestations and provenance for resource consultation, annotation-before-literal-before-transcreation, Bani-centered work and divergent interpretations.

Checks consume an immutable snapshot of the relevant Sabad and reference records. A text finding uses the exact submitted field and its UTF-16 offsets. A workflow assessment uses explicit event IDs and timestamps. Both use the rule's current version and validate all IDs. The report has a per-rule status: `evaluated`, `not_evaluable`, or `not_applicable`, with the reason for the latter two. A missing required authored layer cannot count as a pass.

No untrusted model response can introduce Gurmukhi, a suggested English rendering, a new source ID or a prose quote unsupported by the snapshot. The model returns a review-only schema; code constructs and validates persisted results. SikhRI's missing style guide, Divine-name table, dictionary, prior renderings and review history lead to explicit `not_evaluable` outcomes for checks that depend on them. A reviewer can still inspect these rules and record a reasoned decision.

ANNO-07 specifically uses BaniDB Gurmukhi forms when present. If the required source-language form is absent, the rule is visible but cannot be evaluated for that annotation. No interface accepts new Gurmukhi text.

## Ruleset and migration

Update decisions only in `_docs/rules/resolve.py`, regenerate `rules.resolved.json`, and record the new interpretation in `_docs/07-decisions.md`. Add an additive migration and versioned rule snapshot so existing v1 data remains readable and the new v2 becomes active. Do not silently reseed or delete `eko.db`. Existing transcreation publication records retain their original rule version; reopening or publishing new work uses the new ruleset.

## Delivery order and proof

1. Build a 66-row traceability matrix: rule ID, layer, required input/evidence, check mode, outcome and focused acceptance case. Resolve duplicate/umbrella behavior and publish policy before code changes.
2. Add contracts and persistence for human-authored layers, word-level annotation, transcription, publication and process evidence; prove old data still loads.
3. Add authoring and review surfaces for those inputs, with BaniDB source read-only and typed authorship.
4. Add deterministic checks, then evidence-grounded model checks, then process assessments. Each rule gets positive, negative and missing-evidence cases where applicable. A rule impossible to trigger in the BaniDB corpus (for example TRAN-16's adhak clause) gets a `not_applicable` case, never invented Gurmukhi.
5. Wire cross-layer invalidation, report statuses and publishing gates. Keep old transcreation checks working.
6. Regenerate and seed the versioned 66-rule resolution, run focused checks plus full typecheck and test suite, review the diff, and verify the all-rules catalog and a complete Sabad workflow with human-authored fixtures.

The main code seams are `_docs/rules/resolve.py` and the generated ruleset; `lib/contracts/domain.ts` and `api.ts`; `lib/server/db/` and `lib/server/services/`; `lib/engine/checks/`, `llm/` and the public `index.ts`; and the workspace, report, review and catalog components. Update `CLAUDE.md`, requirements, feature acceptance, readiness and `WORKING_LOG.md` to reflect the newly approved scope. Preserve the untracked `.claude/` directory and other contributors' files.

Success means every one of the 66 has a visible disposition and a tested execution path for its applicable input. It does not mean every rule produces a finding on every Sabad, or that unavailable external evidence is treated as a pass. Real SikhRI corpus accuracy remains unverified until those private inputs arrive.

## Calls made for review

- Existing English draft text is not automatically copied into a literal field; authors provide it separately.
- New rule activation is a new ruleset version, preserving old decisions and publications.
- Subjective principles can yield reviewed, evidence-backed findings or a visible unavailable state; they do not silently block publication based on model opinion alone.
- Workflow rules cite stored actions and documents, so they have a separate assessment type from exact-span text findings.
