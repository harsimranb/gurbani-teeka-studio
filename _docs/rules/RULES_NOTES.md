> **Note (Oct 16, 2026):** this analysis was written before the team removed TERM-04, TERM-05, PRIN-03 and EKO-PRON-01 and narrowed scope to the transcreation. Counts and scopes below reflect that earlier state. Where they differ, `rules.resolved.json` and `../04-ruleset.md` are authoritative. The tensions, precision notes and synthetic test cases (section 10) still apply.

# Eko rules seed: notes

Source: the team's draft ruleset (v0.1, from SikhRI's Approach and Methodology pages), supplied as a text attachment.
Seed file: `rules.seed.json`, with 66 rules. Rule text, levels and source tags are copied verbatim. Everything else is a **proposal** for the team to review: category, check_type, eko_scope, prefilter, confidence and ambiguities.

**Eko's demo scope.** Eko checks human-written English literal translations and transcreations against the Gurmukhi line from BaniDB. It has no SikhRI dictionary, no annotation data and no review history. Prefilter regexes are proposals. Their `action` values are:
- `flag`: report directly.
- `llm_confirm`: an LLM confirms the referent before anything is reported.
- `flag_if_*`: flag only when the named condition holds.

When several tiers hit the same span, the most specific action wins.

**Extra fields beyond the spec:**
- `subsection`: the LAYER group, or the ANNO field name.
- `needs_gurmukhi_line`: true when the check needs the BaniDB line.
- `related_rules`.

## 1. Counts

| Section | Rules | MUST | SHOULD | GUIDE |
|---|---|---|---|---|
| PRIN | 9 | 5 | 2 | 2 |
| TERM | 9 | 4 | 5 | 0 |
| FLOW | 7 | 4 | 3 | 0 |
| LAYER | 10 | 8 | 1 | 1 |
| CONS | 4 | 2 | 2 | 0 |
| ANNO | 11 | 8 | 3 | 0 |
| TRAN | 16 | 15 | 1 | 0 |
| **Total** | **66** | **46** | **17** | **3** |

| eko_scope | Count | Rules |
|---|---|---|
| p0_check | 14 | PRIN-04; TERM-01, 02, 03, 04, 05, 07, 08; LAYER-01, 03, 04, 06, 07, 08 |
| p1_check | 31 | PRIN-03; TERM-09; FLOW-01; LAYER-02; CONS-01, 03; ANNO-01 to 05, 07 to 10; TRAN-01 to 16 |
| review_lens | 12 | PRIN-01, 05, 06, 07, 08; TERM-06; LAYER-05, 09, 10; CONS-02, 04; ANNO-06 |
| out_of_scope | 9 | PRIN-02, 09; FLOW-02 to 07; ANNO-11 |

| check_type | Count |
|---|---|
| grammar_conditioned | 21 (15 of them TRAN) |
| manual | 14 |
| prefilter_llm | 13 |
| style_llm | 10 |
| glossary | 8 |

| category | Count |
|---|---|
| grammar | 19 |
| other | 17 |
| terminology | 10 |
| style | 9 |
| punctuation_format | 7 |
| divine_reference | 4 |

Confidence: 17 high, 18 medium, 31 low. Most high-confidence rules (TRAN, ANNO-04/05/07, LAYER-02) are p1, because Eko lacks the input data for them, not because the logic is hard. Only three p0 rules are high: TERM-01, TERM-04 and LAYER-07.

## 2. Tensions between rules

| Rules | Tension | Suggested handling in Eko |
|---|---|---|
| CONS-01 (SHOULD, default to the established rendering) vs CONS-02 (MUST, depart when context requires) | A consistency flag can be exactly what CONS-02 requires. | Treat a departure as a question ("is a reason logged?", CONS-03), never an error. CONS-02 suppresses the flag; it never raises one. |
| TERM-08 (SHOULD, same word gives the same rendering within a Sabad) vs CONS-02 | Within one Sabad, a repeated word may need a context-fit rendering. | Same as above. Also note that TERM-08 is SHOULD, sourced from Sabad notes, not the core pages. |
| TERM-08 vs LAYER-08 (transcreation need not mirror the source) | Applying TERM-08 to transcreations contradicts LAYER-08's freedom. | Run TERM-08 on the literal layer only, until SikhRI says otherwise. |
| PRIN-04 ("no single correct translation") vs Eko's "approved set" concept | Calling SikhRI renderings "approved" or "correct", and others "wrong", conflicts with PRIN-04 in spirit. | Use neutral wording in the UI and data: "published rendering", "reference rendering", "differs from reference". Never "incorrect translation". |
| TERM-03 / TERM-07 (gloss on first use) vs LAYER-03 (parentheses = added words) and LAYER-07 (no parentheses in the transcreation) | The draft's own gloss format "IkOankar (1Force, the One)" uses parentheses. In the literal they would read as "added words"; in the transcreation they are banned. | Ask SikhRI for the gloss format per layer. Until then, exclude known glosses from LAYER-03/07 hits. |
| LAYER-04 (word order may be rearranged) vs LAYER-01 (retain grammatical position) | "Grammatical position" could be read as word order. | Read it as grammatical role, not surface order. LAYER-04 suppresses order-based flags. |
| LAYER-08 (do not mirror) vs LAYER-09 (build on the literal) | The boundary between "builds on" and "mirrors" is undefined. | Use a similarity threshold calibrated on the SikhRI sample, as a soft flag only. |
| TRAN-03 (implicit "a" except word-final) vs TRAN-05 (may drop mid-word) vs TRAN-01 (pronunciation wins) | A strict TRAN-03 checker flags the draft's own TRAN-01 example (parmadbhutaṅ). | Needs a pronunciation lexicon, or SikhRI's transcriptions as a reference. |
| LAYER-06 (MUST contemporary English) vs Section 8 "Register: are archaisms (thee, thou) banned?" | The gap list treats as open what LAYER-06 appears to settle. | Confirm with SikhRI. Eko flags archaisms in transcreations only. |
| TERM-01 vs reviewer checklist "No God or Lord anywhere" | The rule targets rendering the Divine; the checklist bans the words everywhere. | Confirm scope with SikhRI. Prefilter tier 1 (capitalized) flags; tier 2 (lowercase/plural) asks the LLM. |

**Overlaps and duplicates.** None of these are conflicts.
- PRIN-09 duplicates FLOW-07.
- TERM-09 duplicates CONS-01.
- LAYER-10 is an umbrella over TERM-01 to 03. Eko should cite the specific TERM rule, to avoid double flags.
- PRIN-05 is the principle behind LAYER-07/08. Eko should cite the LAYER rule.
- LAYER-04's second clause restates LAYER-03.
- The draft says TERM-08 "states the same principle as TERM-02 at line level", but the two differ. TERM-02 is about fidelity to the attribute; TERM-08 is about consistency of repeated words.

## 3. Deterministic precision

**Likely high precision (deterministic or near-deterministic):**

| Rule | Why |
|---|---|
| LAYER-07 | Any `(` or `)` in a transcreation is a breach. No semantic judgment is needed. |
| TERM-01 (capitalized tier) | Capitalized "God" and "Lord" inside a rendering almost always refer to the Divine. Word boundaries already exclude "landlord" and "warlord". |
| TERM-04 / TERM-05 (co-occurrence tier) | "Guru Granth Sahib ... scripture/canon/Veda/shastra" and "Sikh scripture/canon/Veda" leave little room for another reading. |
| TERM-03 spelling | Variants such as Ik Onkar, Ek Onkar and Ikonkar are easy to match and compare against the exact "IkOankar". |
| TERM-07 spelling | Shabad/Shabd and Naam are cheap to catch: a fixed list of non-preferred spellings. |
| LAYER-03 format half | Balanced, non-empty, non-nested parentheses can be checked mechanically. Unmarked additions cannot (see below). |
| LAYER-02, ANNO-04/05/07, TRAN-04/06/07/10 to 16 | Mechanical, but p1: they need rich text, annotation fields or transcriptions. |

**Prone to false positives:**

| Rule | False-positive source |
|---|---|
| TERM-01 | "Lord" inside a quoted name or title, or a worldly lord/master in the source. "God" in commentary or footnotes that quote another translator. "gods" for deities the source itself names. |
| TERM-05 | The source frequently mentions the Vedas and Shastras, so a bare "Vedas" in a literal is usually faithful. Hits on bare terms must check the BaniDB line and confirm the referent. |
| TERM-04 | Bare "scriptures" for other traditions' books. "canonical" in an unrelated sense. |
| PRIN-04 | "true meaning" / "true friend" style phrases are common in content. Real claims mostly sit in commentary, which Eko does not ingest, so recall is low. |
| LAYER-06 | The "-eth/-est" suffix pattern hits "forest", "rest" and "best". "art", "ye" and "lo" are ambiguous. Only the closed archaism list is safe to auto-flag. |
| LAYER-01 / LAYER-03 (unmarked additions) | Without annotation data, Eko cannot tell an English word the grammar requires (a preposition from a case ending, an article) from a genuine addition. Expect many spurious "unmarked addition" flags. Keep these as low-confidence, reviewer-facing findings. |
| TERM-02 | There is no name-to-attribute table yet (a Section 8 gap), so the LLM's own idea of each name's meaning becomes the reference. |
| TERM-08 | Inflected forms of one lemma look like different words. Legitimate context departures (CONS-02) look like inconsistency. |

## 4. Rules that need the Gurmukhi line from BaniDB

`needs_gurmukhi_line: true` is set on the following rules.

- **p0, the line is required:**
  - TERM-02: which Divine name the line uses.
  - TERM-08: which words repeat in the Sabad. This needs every line of the Sabad, not just one.
  - LAYER-01: word coverage.
  - LAYER-03: what counts as added.
  - LAYER-04: order versus coverage.
  - LAYER-08: similarity of the transcreation to the source and the literal.
- **p0, the line is optional but improves precision:**
  - TERM-05: a "Vedas" mention in the source suppresses the flag.
  - TERM-03: the ੴ symbol on the line triggers the IkOankar check.
- **Later (p1 / review lens):** LAYER-10, CONS-01, ANNO-01/03/09, and every TRAN rule except TRAN-02.
- **Gurmukhi word features (ending matra, inflection):** TERM-02, TERM-08, LAYER-01, LAYER-03 and LAYER-04, plus ANNO-03/09 and TRAN at p1. Without them, "same word" and "grammatical position" can only be approximated.

## 5. The pronoun question is a gap, not a rule

The draft has no rule on how pronouns refer to the Divine: "You" or "you", and whether third-person references are gendered (He/His). It is listed only as an open question in Section 8 ("Pronouns"). Eko must not flag "He" or "You" for the Divine as a breach. At most, report it as an observation for reviewers until SikhRI answers. The same applies to:
- capitalization of terms such as Wisdom, Divine, Guru and Will (Section 8, "Capitalization");
- "loaded words" beyond the four named ones: soul, sin, heaven, salvation, worship, prayer, saint.

## 6. Questions for SikhRI

**From Section 8 of the draft (gaps to fill in v0.2):**
1. **Divine names.** Which English rendering does each name get (Hari, Ram, Prabh, Thakur, Sahib, Kartar, Gobind)? When is a name kept untranslated? This is the table TERM-02 needs.
2. **Pronouns.** Is the Divine "You" or "you"? Are third-person references gendered?
3. **Address and voice.** How are vocatives ("O mind", "O mother") and the first-person speaker rendered?
4. **Register.** Plain modern or elevated English? Are archaisms banned? Is this already settled by LAYER-06?
5. **Length.** How much longer than the literal may a transcreation run?
6. **Rahau.** Is the refrain treated or marked differently?
7. **Imagery.** Are metaphors kept, explained in-line, or moved to footnotes?
8. **Loaded words.** What about soul, sin, heaven, salvation, worship, prayer and saint, beyond God, Lord, scripture and canon?
9. **Capitalization.** Which terms are capitalized (Wisdom, Divine, Guru, Will)?
10. **Internal style record.** Is there one? The transcreator job posting implies documented creative reasoning.

**Raised while structuring the rules:**

11. **TERM-01 scope.** Rendering the Divine only, or no "God"/"Lord" anywhere, as the checklist says? This covers worldly lords, other traditions' deities, and lowercase or plural forms.
12. **LAYER-03.** Do grammar-required English words count as "added" and need parentheses? Examples are articles, copulas, and prepositions that express a case ending.
13. **Gloss format per layer.** How are glosses written (TERM-03/07) without clashing with LAYER-03 and LAYER-07? What is the "first use" scope: Sabad, Bani or publication? Are Bani and Gurmat glossed?
14. **TERM-08.** Same surface form or same lemma? Literal only, or the transcreation too?
15. **CONS-03.** Where are justifications for departures recorded (footnote vs term log), and can Eko read that record?
16. **LAYER-02.** How is italics represented in exports Eko would receive?
17. **TRAN-02.** Does "line meanings" mean the literal translation? Is there a list of common spellings for proper nouns?
18. **PRIN-03.** Is there canonical wording for the humility note, and at what level (Sabad, Bani, publication) is it attached?
19. **Sample data.** Can SikhRI share renderings with their review history, ideally including rejected drafts? Eko needs them to calibrate LAYER-08 and CONS-01, and for the minimal-pairs bake-off.

## 7. Reviewer checklist mapped to rule IDs

This is Section 9 of the draft, which is not stored in the JSON.

| Checklist item | Rule IDs | eko_scope |
|---|---|---|
| Every word annotated with meaning, grammar and etymology | FLOW-01, ANNO-01 to 11 | p1 |
| Literal in italics and drops no source word or grammatical position | LAYER-01, LAYER-02 | p0 (01, low confidence) / p1 (02) |
| Every added word in the literal is in parentheses | LAYER-03 | p0 (low confidence) |
| Transcreation has no parentheses and does not mirror line by line | LAYER-07, LAYER-08 | p0 |
| No "God" or "Lord" anywhere | TERM-01 | p0 |
| Each Divine attribute matches the original | TERM-02 (and LAYER-10) | p0 (low confidence) |
| No "scripture", "canon", "ved" or "shastra" for the GGS | TERM-04, TERM-05 | p0 |
| Repeated words rendered consistently | TERM-08 | p0 (literal layer) |
| Departures from established renderings have a logged reason | CONS-03 (with CONS-01/02) | p1 |
| Transcription follows TRAN; proper nouns use common spellings | TRAN-01 to 16 (TRAN-02) | p1 |
| Nothing claims to be the definitive or only correct meaning | PRIN-04 | p0 |
| Humility note attached | PRIN-03 (the "Standard disclaimer" under section 1) | p1 |

The checklist covers no FLOW-03 to 07 or PRIN-01/02/06 to 09 items. That fits, since those rules are deliberation or process rules. LAYER-06 (contemporary English) is a MUST that the checklist omits.

## 8. Other observations about the draft

- The draft claims "every rule traces to one of those pages", but TERM-08 comes from Sabad notes. The draft acknowledges this in a note under TERM-08.
- The layer table says the transcreation is set in Roman (upright) type, but no rule ID covers it.
- The draft refers to a "Site investigation (v0.2 suggestions)" page that was not included. It may hold more candidate rules.
- No text resembling instructions to an AI was found in the draft.

## 9. Gaps beyond Section 8

These are suggestions only and are not in the JSON.

- Numbers and units (spelled out vs digits) in English renderings.
- Consistency of English spelling (US vs UK).
- How quotations and direct speech are punctuated in the literal.
- Treatment of names of people and places in the literal versus the transcreation. TRAN-02 covers only transcription.
- Whether the literal may use contractions.
- Whether the transcreation may address the reader directly ("you").

## 10. SYNTHETIC test cases for p0_check rules

**SYNTHETIC.** These are English sentences written for the minimal-pairs bake-off. They are not SikhRI text and contain no Gurbani. Notes in brackets describe the assumed source context. "Expect" is the intended outcome, not a measured result.

| Rule | Layer | SYNTHETIC sentence | Expect |
|---|---|---|---|
| TERM-01 | transcreation | The Creator sustains all, and nothing lies outside the Creator's Command. | pass |
| TERM-01 | transcreation | The Lord sustains all, and nothing lies outside His Command. | flag "Lord" |
| TERM-01 | transcreation | Remembering God, the mind becomes still. | flag "God" |
| TERM-01 | literal | *The landlord (demanded) rent; the warlord took (the) harvest.* [source about worldly rulers] | pass: no false positive on substrings |
| TERM-02 | literal | [source uses a name meaning Creator] *The Creator made (all) forms.* | pass |
| TERM-02 | literal | [same source] *The Divine made (all) forms.* | flag: attribute collapsed |
| TERM-02 | literal | [source uses a name meaning Sustainer] *The Creator sustains all.* | flag: attribute changed |
| TERM-03 | transcreation | IkOankar, One Universal Integrative Force, pervades everything. | pass |
| TERM-03 | transcreation | Ik Onkar pervades everything. | flag: spelling |
| TERM-03 | transcreation | [first use in the Sabad] IkOankar pervades everything. | flag: no gloss on first use |
| TERM-04 | transcreation | The Guru Granth Sahib is the Guru-Wisdom that guides the Sikhs. | pass |
| TERM-04 | transcreation | The Guru Granth Sahib is the holy scripture of the Sikhs. | flag "scripture" |
| TERM-04 | transcreation | The Sikh canon was compiled in 1604. | flag "canon" |
| TERM-05 | literal | [source names the Vedas] *Reading the Vedas, the scholar remains (in) doubt.* | pass: faithful reference |
| TERM-05 | transcreation | The Guru Granth Sahib is the Veda of the Sikhs. | flag "Veda" |
| TERM-05 | transcreation | The Granth is the shastra by which Sikhs live. | flag "shastra" |
| TERM-07 | transcreation | Through Sabad, Infinite Wisdom, the mind is steadied. | pass |
| TERM-07 | transcreation | Through the Shabad, the mind is steadied. | flag: spelling |
| TERM-07 | transcreation | Meditate on Naam and be free. | flag: spelling (Nam) |
| TERM-08 | literal | [one word repeats in the Sabad] *Line 1: ... the Command ...; Line 3: ... the Command ...* | pass |
| TERM-08 | literal | [same word] *Line 1: ... the Command ...; Line 3: ... the Will ...* | flag: inconsistent, reason logged? (soft) |
| LAYER-01 | literal | [source: four words, "mind", "restless", "wisdom", "steady"] *The restless mind (is) steadied (by) wisdom.* | pass |
| LAYER-01 | literal | [same source] *The mind is steadied by wisdom.* | flag: "restless" dropped |
| LAYER-03 | literal | [source has no word for "always"] *The mind (always) wanders.* | pass |
| LAYER-03 | literal | [same source] *The mind always wanders.* | flag: unmarked addition |
| LAYER-03 | literal | *The mind (always wanders.* | flag: unbalanced parenthesis |
| LAYER-04 | literal | [source order: "wisdom" then "mind" then "steadied"] *The mind (is) steadied (by) wisdom.* | pass: reordering allowed |
| LAYER-04 | literal | [same source] *The mind is steadied by divine wisdom, its true home.* | flag: meaning added outside parentheses (cite LAYER-03) |
| LAYER-06 | transcreation | You are the Giver; Your gifts never run out. | pass |
| LAYER-06 | transcreation | Thou art the Giver; Thy gifts are endless. | flag: archaisms |
| LAYER-06 | transcreation | The best rest is found in the forest of contentment. | pass: false-positive control for -est |
| LAYER-07 | transcreation | The restless mind finds its rest in the Wisdom of the Guru. | pass |
| LAYER-07 | transcreation | The mind (which is restless) finds rest in Wisdom. | flag: parentheses |
| LAYER-08 | transcreation | [literal: "The restless mind (is) steadied (by) wisdom."] When the mind stops chasing, wisdom gives it a place to stand. | pass |
| LAYER-08 | transcreation | [same literal] The restless mind is steadied by wisdom. | flag: mirrors the literal |
| PRIN-04 | transcreation | Some read this line as fear; here it is read as awe. | pass |
| PRIN-04 | transcreation | This is the only correct translation of the line. | flag |
| PRIN-04 | transcreation | He was a true friend when it mattered. | pass: false-positive control |

**Measured with the proposed regexes** (a quick probe against similar sentences, before the LLM step):
- Every "flag" case for TERM-01 (capitalized), TERM-03 (spelling), TERM-04, TERM-05 (co-occurrence), TERM-07 (spelling) and LAYER-07 was caught.
- The landlord/warlord control produced no hit.
- These hits correctly went to `llm_confirm` rather than `flag`: "forest" (LAYER-06), "gods" (TERM-01), "Semitic scriptures" (TERM-04), and bare "Vedas"/"Shastras" (TERM-05).
