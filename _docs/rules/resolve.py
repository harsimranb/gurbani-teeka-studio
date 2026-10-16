"""Apply BJ13's judgment calls to rules.seed.json -> rules.resolved.json.

Rule text, level and source stay verbatim. Each rule gains a `resolution` block:
  active      : True if Eko runs it in the demo build
  scope       : p0_check | p0_by_design | p0_suppressor | p1_check | review_lens | out_of_scope | merged
  severity    : error | flag | warning | hint | lens | none
  blocks_publish : True if an open finding blocks publishing (until fixed or waived with a reason)
  layers      : which text layers Eko runs it on
  decision    : the judgment call, in plain words
"""
import json
from pathlib import Path

HERE = Path(__file__).parent
seed = json.loads((HERE / "rules.seed.json").read_text())

# Default severity from the draft's own strength table:
#   MUST  -> "Treat a breach as an error"            -> flag (blocks publish until fixed or waived)
#   SHOULD-> "Follow unless a documented reason"     -> warning (needs a reason, doesn't block)
#   GUIDE -> "Use as a review lens"                  -> lens (shown to reviewers, never flagged)
DEFAULT_SEV = {"MUST": "flag", "SHOULD": "warning", "GUIDE": "lens"}

R = {}  # id -> overrides


def res(rid, **kw):
    R[rid] = kw


# ---------- PRIN ----------
res("PRIN-03", scope="p0_check", severity="error", blocks_publish=True, layers=["publication"],
    decision="Publish gate: a Sabad can't be marked published without a humility note. "
             "Eko checks presence only; wording is not checked until SikhRI supplies canonical text.")
res("PRIN-04", scope="p0_check", severity="flag", layers=["literal", "transcreation"],
    decision="Prefilter + LLM confirm on claims of a single correct reading or that other renderings are wrong. "
             "Eko's own UI follows this rule too: flags say 'differs from reference rendering', never 'incorrect'.")
res("PRIN-09", decision="Duplicate of FLOW-07; out of scope for text checks.")

# ---------- TERM ----------
res("TERM-01", scope="p0_check", severity="error", layers=["literal", "transcreation"],
    decision="The rule text governs: it bans 'God'/'Lord' as renderings of the Divine. The checklist's 'anywhere' is read as shorthand. "
             "Capitalized God/Lord (and Godhead, Lordship, Lord-X) -> error, deterministic L1. "
             "Lowercase or plural (gods, lords, goddess) -> LLM confirms the referent with the BaniDB line; a worldly or other-tradition referent passes.")
res("TERM-02", scope="p0_check", severity="flag", layers=["literal", "transcreation"],
    decision="Narrowed until SikhRI supplies the Divine-name table (Section 8 gap). Two checks only: "
             "(a) names whose attribute is explicit in the word itself: the karta/kartar family must keep 'Creator' "
             "(the rule's own example) -> flag. "
             "(b) collapse detector: 3+ distinct Divine names in one Sabad all rendered by the same single English word -> warning for the reviewer. "
             "Eko does not judge other names' renderings yet.")
res("TERM-03", scope="p0_check", severity="warning", layers=["literal", "transcreation"],
    decision="Exact spelling 'IkOankar'; any variant -> warning. First use = first occurrence in the Sabad (Eko's review unit). "
             "Gloss 'One Universal Integrative Force' required at first use. In the transcreation the gloss is written as an apposition "
             "(comma or dash), because LAYER-07 bans parentheses; in the literal, parentheses are allowed for the gloss.")
res("TERM-04", scope="p0_check", severity="error", layers=["literal", "transcreation"],
    decision="'scripture'/'canon' tied to the Guru Granth Sahib, Gurbani or Sikhs (same sentence) -> error. "
             "Bare hits -> LLM confirms the referent; other traditions' books pass. The broader 'Judeo-Christian undertones' clause "
             "is a review lens until SikhRI answers the loaded-words question.")
res("TERM-05", scope="p0_check", severity="error", layers=["literal", "transcreation"],
    decision="Same structure as TERM-04. If the BaniDB line itself names the Vedas or Shastras, a bare 'Vedas'/'Shastras' is a faithful rendering and passes.")
res("TERM-06", decision="Review lens only.")
res("TERM-07", scope="p0_check", severity="warning", layers=["literal", "transcreation"],
    decision="Non-preferred spellings (Shabad, Naam, Padshah, Parkash Purab) -> warning; titles of Banis are proper nouns and exempt. "
             "English substitutes ('the Word', 'the Name', 'hymn') -> LLM confirm -> warning. "
             "Missing gloss at first use in the Sabad -> hint only.")
res("TERM-08", scope="p0_check", severity="warning", layers=["literal"],
    decision="Literal layer only (LAYER-08 frees the transcreation). 'Same word' = same stem key from the morphology analyzer "
             "within one Sabad, so inflected forms group together. Differing renderings -> warning, cleared by a reviewer reason "
             "(CONS-02/03).")
res("TERM-09", scope="merged", severity="none", decision="Merged into CONS-01 (same check).")

# ---------- FLOW ----------
res("FLOW-01", decision="Process rule. Eko has no annotation data, so this stays p1.")

# ---------- LAYER ----------
res("LAYER-01", scope="p0_check", severity="hint", layers=["literal"],
    decision="Possible omissions only: the LLM lists content words in the BaniDB line with no English counterpart. "
             "Non-blocking hint, because without annotation data Eko can't verify grammatical position. "
             "'Grammatical position' is read as grammatical role, not word order (see LAYER-04).")
res("LAYER-02", scope="p0_by_design", severity="none", layers=["literal"],
    decision="Satisfied by design: Eko stores each layer separately and always renders the literal in italics, "
             "so italics can't be wrong. The transcreation is rendered upright (the draft's layer table).")
res("LAYER-03", scope="p0_check", severity="error", layers=["literal"],
    decision="Two parts. (1) Parentheses must be balanced, non-empty and not nested -> error, deterministic. "
             "(2) Unmarked additions: the LLM flags added content words (nouns, verbs, adjectives, adverbs) with no source counterpart -> hint. "
             "Grammar-required function words (articles, copulas, case prepositions) are not flagged until annotation data exists. "
             "Parentheses holding a known gloss (TERM-03/07) are exempt.")
res("LAYER-04", scope="p0_suppressor", severity="none", layers=["literal"],
    decision="Suppressor: word-order changes are never flagged. Meaning added outside parentheses is reported under LAYER-03.")
res("LAYER-05", decision="Review lens only.")
res("LAYER-06", scope="p0_check", severity="flag", layers=["transcreation"],
    decision="Closed archaism list (thee, thou, thy, hath, unto ...) -> flag. Ambiguous words (art, ye, lo) and -eth/-est endings -> LLM confirm. "
             "Treats LAYER-06 as settling the archaism part of the Section 8 'Register' question; plain vs elevated register stays open.")
res("LAYER-07", scope="p0_check", severity="error", layers=["transcreation"],
    decision="Any parenthesis or square bracket in a transcreation -> error, deterministic. Brackets count, because they also mark text as added.")
res("LAYER-08", scope="p0_check", severity="warning", layers=["transcreation"],
    decision="Deterministic: token similarity between the transcreation and the literal (parentheses stripped) at or above 0.85 -> 'mirrors the literal'. "
             "Warning until the threshold is calibrated on the SikhRI sample, then promote to flag. Separates 'mirrors' (LAYER-08) from 'builds on' (LAYER-09).")
res("LAYER-09", decision="Review lens only; LAYER-08's check covers the measurable half.")
res("LAYER-10", scope="review_lens", severity="lens",
    decision="Umbrella over TERM-01 to 03. Never raises its own flag; Eko cites the specific TERM rule.")

# ---------- CONS ----------
res("CONS-01", scope="p0_check", severity="warning", layers=["literal", "transcreation"], conditional="needs applicable reference with explicit term-to-rendering mapping",
    publish_requires_reason=True,
    decision="Active only when an applicable SikhRI-supplied or Eko-published reference explicitly maps a source term to its English rendering: a differing draft rendering -> warning "
             "'differs from reference rendering, add a reason'. A departure must have a recorded reason before publish "
             "(CONS-03); the warning remains non-error severity. Absorbs TERM-09.")
res("CONS-02", scope="p0_suppressor", severity="none",
    decision="Precedence rule: a reviewer's context reason clears any consistency warning (TERM-08, CONS-01). It never raises a flag itself.")
res("CONS-03", scope="p0_by_design", severity="none",
    decision="Satisfied by workflow: Eko requires a written reason before publishing a CONS-01 departure and stores that reason as the log.")
res("CONS-04", decision="Review lens only.")

# ---------- ANNO / TRAN ----------
for r in seed:
    if r["id"].startswith(("ANNO-", "TRAN-")) and r["id"] not in R:
        R[r["id"]] = dict(decision="Out of the demo: Eko has no annotation or transcription input. Kept as p1.")

# ---------- Team decisions, Oct 16 (supersede the calls above) ----------
# 1. Eko reviews the transcreation only. Literal translation, annotation and transcription are out of scope.
# 2. The team removed TERM-04, TERM-05, PRIN-03 and the interim pronoun check from the demo build.
REMOVED_BY_TEAM = {
    "TERM-04": "Removed from automated checks by the team (Oct 16). Reviewer asked to confirm (Q1).",
    "TERM-05": "Removed from automated checks by the team (Oct 16). Reviewer asked to confirm (Q1).",
    "PRIN-03": "Removed from automated checks by the team (Oct 16). Reviewer asked to confirm (Q1).",
}
for rid, why in REMOVED_BY_TEAM.items():
    R[rid] = dict(scope="removed", severity="none", decision=why)

LITERAL_ONLY = ["TERM-08", "LAYER-01", "LAYER-02", "LAYER-03", "LAYER-04"]
for rid in LITERAL_ONLY:
    prev = R.get(rid, {}).get("decision", "")
    R[rid] = dict(scope="p1_check", severity="none",
                  decision="Inactive: applies to the literal translation, which is out of scope (transcreation only). "
                           "Earlier call kept for later: " + prev)

R["LAYER-08"] = dict(scope="p1_check", severity="none", layers=["transcreation"],
                     decision="Inactive: comparing against the literal needs a literal translation, which is out of scope. "
                              "Revisit if SikhRI's sample includes literals as context.")
R["PRIN-04"]["layers"] = ["transcreation"]
for rid in ["TERM-01", "TERM-02", "TERM-03", "TERM-07", "CONS-01", "CONS-02", "CONS-03"]:
    R[rid]["layers"] = ["transcreation"]
R["TERM-03"]["decision"] = ("Exact spelling 'IkOankar'; any variant -> warning. First use = first occurrence in the Sabad. "
                            "Gloss 'One Universal Integrative Force' at first use, written as an apposition (comma or dash), "
                            "because LAYER-07 bans parentheses in the transcreation.")

# Interim checks: none. EKO-PRON-01 was removed by the team; pronouns wait for SikhRI's style guide.
INTERIM = []

out = []
for r in seed:
    o = R.get(r["id"], {})
    scope = o.get("scope", r.get("eko_scope"))
    level = r.get("level")
    if "severity" in o:
        sev = o["severity"]
    elif scope in ("out_of_scope", "merged"):
        sev = "none"
    elif scope == "review_lens":
        sev = "lens"
    else:
        sev = DEFAULT_SEV.get(level, "warning")
    active = scope in ("p0_check", "p0_by_design", "p0_suppressor")
    blocks = o.get("blocks_publish", active and sev in ("error", "flag"))
    r2 = dict(r)
    resolution = {
        "active": active,
        "scope": scope,
        "severity": sev,
        "blocks_publish": blocks,
        "layers": o.get("layers", r.get("applies_to")),
        "conditional": o.get("conditional"),
        "decision": o.get("decision"),
    }
    if o.get("publish_requires_reason"):
        resolution["publish_requires_reason"] = True
    r2["resolution"] = resolution
    out.append(r2)

doc = {
    "version": "0.1-resolved",
    "global_decisions": [
        "Severity follows the draft's strength table: MUST -> flag (blocks publish until fixed or waived with a reason); "
        "SHOULD -> warning (needs a reason to dismiss; CONS-01 also needs a recorded reason before publish); "
        "GUIDE -> review lens (never flagged). Deterministic MUST checks with near-zero false positives are 'error'.",
        "Precedence: PRIN rules win conflicts (as the draft says); a specific rule is cited over an umbrella rule; "
        "a reviewer's context reason (CONS-02) clears consistency warnings.",
        "Review unit is the Sabad: 'first use' and 'same word' are scoped to one Sabad.",
        "Every rule runs only on the layers it applies to (literal, transcreation, publication).",
        "Wording (PRIN-04): flags say 'differs from reference rendering'. 'Approved' is used only as a workflow status, never as 'correct'.",
        "'Same word' grouping uses the stem key from BaniDB text; the ending matra is kept as a feature for grammar hints.",
        "Open SikhRI questions never become flags: Eko reports variation within a Sabad, not a choice it can't verify.",
        "Scope: Eko reviews the English transcreation only, and never generates translation text.",
        "No roles: anyone may resolve a finding, propose a rule, or approve one, always with a written reason.",
    ],
    "interim_checks": INTERIM,
    "rules": out,
}
(HERE / "rules.resolved.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2))

active = [r for r in out if r["resolution"]["active"]]
print("total", len(out), "active", len(active))
for r in active:
    x = r["resolution"]
    print(f'{r["id"]:9} {r["level"]:6} {x["scope"]:14} {x["severity"]:8} block={x["blocks_publish"]!s:5} {",".join(x["layers"] or [])}')
