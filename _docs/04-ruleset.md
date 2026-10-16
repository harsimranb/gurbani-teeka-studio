# 04 · Ruleset

Eko's rules come from the team's draft ruleset v0.1, built from SikhRI's published Approach and Methodology pages: 66 rules, each with a strength level (MUST, SHOULD, GUIDE) and a source tag. Rule text is kept verbatim. How each rule is applied (scope, severity, layers) is a team judgment call, recorded per rule in [`rules/rules.resolved.json`](rules/rules.resolved.json).

**Status:** judgment calls are provisional until the reviewer answers [reviewer-questions.md](reviewer-questions.md) and SikhRI's style guide arrives.

## Files

| File | Role |
|---|---|
| [`rules/ruleset-v0.1-draft.txt`](rules/ruleset-v0.1-draft.txt) | The original draft (historical source; tables are flattened in this text export) |
| [`rules/rules.seed.json`](rules/rules.seed.json) | 66 rules, verbatim, with category, check type, prefilter proposals, ambiguities |
| [`rules/resolve.py`](rules/resolve.py) | All judgment calls. **Edit here** |
| [`rules/rules.resolved.json`](rules/rules.resolved.json) | Generated output the app loads. Each rule has a `resolution` block |
| [`rules/RULES_NOTES.md`](rules/RULES_NOTES.md) | Analysis: tensions, precision risks, questions, synthetic test cases (§10). Written before the Oct 16 team decisions; where it disagrees, `rules.resolved.json` wins |

### The `resolution` block

```json
"resolution": {
  "active": true,
  "scope": "p0_check",
  "severity": "warning",
  "blocks_publish": false,
  "layers": ["transcreation"],
  "conditional": "needs applicable reference with explicit term-to-rendering mapping",
  "publish_requires_reason": true,
  "decision": "CONS-01 decision from resolve.py"
}
```

`publish_requires_reason` appears only on CONS-01; other rules default to false. It is separate from `blocks_publish`, so CONS-01 remains a warning rather than an error or flag.

| `scope` | Meaning |
|---|---|
| `p0_check` | Checked in this build |
| `p0_by_design` | Satisfied by how Eko works; no check needed |
| `p0_suppressor` | Never raises a finding; clears or suppresses others |
| `p1_check` | Checkable later (literal layer, annotation, transcription) |
| `review_lens` | Reviewer guidance only; never flagged |
| `out_of_scope` | Process rule; not checkable from text |
| `removed` | Removed by the team |
| `merged` | Folded into another rule |

## Counts

| Scope | Count |
|---|---|
| Checks on the transcreation | 8 |
| Met by design | 1 |
| Suppressor | 1 |
| Later | 32 |
| Reviewer guidance | 11 |
| Process only | 9 |
| Removed by the team | 3 |
| Merged | 1 |
| **Total** | **66** |

## Severity

Severity follows the draft's own strength table.

| Severity | Rule level | Effect |
|---|---|---|
| **Error** | MUST, checked by code with near-zero false positives | Blocks publishing until fixed or waived with a reason |
| **Flag** | MUST, confirmed by the LLM against the BaniDB line | Blocks publishing until fixed or overridden with a reason |
| **Warning** | SHOULD | Needs a reason to dismiss; ordinary warnings do not block. A CONS-01 departure also needs a recorded reason before publish (CONS-03) |
| **Hint** | Anything Eko can't verify | Shown; no action needed (none active in this build) |
| **Lens** | GUIDE | Shown to reviewers as guidance; never flagged |

## Active rules

| Rule | What it checks | Level | How Eko checks it | Severity |
|---|---|---|---|---|
| TERM-01 | No "God" or "Lord" for the Divine | MUST | Code for capitalized forms; LLM checks the referent for lowercase or plural | Error |
| LAYER-07 | No parentheses or brackets in the transcreation | MUST | Code | Error |
| TERM-02 | Keep the Divine attribute the line uses | MUST | Code finds Divine names in the BaniDB line; LLM judges the English. Only the Kartar/Karta family (Creator) for now, plus a warning when 3+ different names in one Sabad share one English word | Flag |
| PRIN-04 | No claim of one correct reading | MUST | Prefilter, then LLM confirms | Flag |
| LAYER-06 | Contemporary English | MUST | Code for a closed archaism list; LLM for ambiguous words | Flag |
| TERM-03 | "IkOankar", glossed on first use in the Sabad | SHOULD | Code | Warning |
| TERM-07 | Core terms kept transcribed (Sabad, Nam, Bani …) | SHOULD | Code for spellings; LLM for substitutes like "the Word" | Warning |
| CONS-01 | Default to the reference rendering | SHOULD | Code only when an applicable reference has an explicit term-to-rendering mapping; otherwise the separate cited English-reference style check may run | Warning; reason before publish |
| CONS-03 | Every departure has a recorded reason | MUST | Warnings can't be dismissed without a written reason | By design |
| CONS-02 | Depart when context requires | MUST | A written reason clears a consistency warning | Suppressor |

Prefilter patterns for each active rule are proposals in `rules.seed.json` (`prefilter` field). Treat them as a starting point, then tune against the golden tests.

**Removed by the team:** TERM-04, TERM-05, PRIN-03, and the interim pronoun check EKO-PRON-01.
**Inactive while only the transcreation is reviewed:** TERM-08, LAYER-01 to 04, LAYER-08. Their earlier calls are kept in `resolve.py` for later.

## Global decisions

1. Severity follows the strength table above.
2. PRIN rules win conflicts, as the draft states. A specific rule is cited over an umbrella rule (LAYER-10 → TERM-01 to 03).
3. The review unit is the Sabad: "first use" and "same word" are scoped to one Sabad.
4. Each rule runs only on its own layer; in this build that means the transcreation.
5. Wording follows PRIN-04: "differs from reference rendering", never "incorrect". "Approved" is a workflow status only.
6. Open questions for SikhRI never become flags.
7. Eko never generates translation text.
8. No roles: anyone may resolve a finding, propose a rule, or approve one, always with a written reason.
9. Eko-published renderings have equal source weight to SikhRI-supplied references in future style checks. Show source and exception marks; do not silently hide a waiver or reasoned departure.

## Judgment calls

| Ambiguity | Current call | Reviewer question |
|---|---|---|
| CONS-01 vs CONS-02 (stay consistent vs. depart for context) | A departure is a warning, never an error. Publishing it requires a recorded reason; CONS-02 clears it and the reason satisfies CONS-03 | Q11 |
| TERM-01 scope (rule says "the Divine"; checklist says "anywhere") | The rule text governs. A worldly lord or another tradition's deity passes once the LLM confirms the referent | Q2 |
| TERM-02 without a Divine-names table | Only names whose attribute is explicit in the word are checked (Kartar → Creator, the rule's own example). A collapse detector warns when 3+ different Divine names in one Sabad share one English word | Q3 |
| Gloss format (TERM-03/07 vs. LAYER-07) | In the transcreation the gloss follows a comma or dash, because parentheses aren't allowed | Q4 |
| LAYER-06 vs the "Register" gap | Archaisms (thee, thou, hath) are flagged. Plain vs. elevated register waits for the style guide | Q8 |
| TERM-08 on the transcreation | Not applied, because LAYER-08 frees the transcreation from mirroring the source | Q6 |
| Duplicates and umbrellas | TERM-09 merged into CONS-01. LAYER-10 never raises its own flag | |
| Precedence | PRIN rules win conflicts; a specific rule is cited over an umbrella rule | |

## How to change a rule decision

1. Edit the decision in `_docs/rules/resolve.py`. Never edit rule text in `rules.seed.json`.
2. Run `python3 _docs/rules/resolve.py`. It prints the active rules; check the list is what you expect.
3. Nothing to copy: the DATA seed and engine tests read `_docs/rules/rules.resolved.json` in place. Re-run the seed so the app's rules table picks up the change.
4. Update this file's tables if the active set or a severity changed.
5. Add a line to [07-decisions.md](07-decisions.md).
6. Update or add golden tests for the affected rule.

## Synthetic test cases

`rules/RULES_NOTES.md` §10 has 38 SYNTHETIC English sentences (pass and flag pairs) for golden tests and the model bake-off. Use only the transcreation cases for active rules. They contain no Gurbani.

## Rules for the video

- **TERM-01**: a code check, instant, no model call.
- **TERM-02**: Divine-name matching on the BaniDB line plus the LLM's judgment, with evidence cited.
- **LAYER-07**: a transcreation-specific rule.
- **An override with a reason** on a TERM-02 flag, then publishing: CONS-02/03 in action. With SikhRI's sample loaded, show it on a CONS-01 warning instead.
