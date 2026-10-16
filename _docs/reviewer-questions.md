> Shared with the reviewer as a Claude Doc: https://claude.ai/code/artifact/aaf9f606-969e-4bd3-b453-30992b387995 (private until shared). This Markdown copy may lag behind the doc if the reviewer edits it; their answers live in the doc.

# Eko Ruleset Review

Oct 16, 2026 · Team BJ13

## How to use this document

Eko is a review assistant that Team BJ13 is building for Sarbat Build Day (SikhRI problem statement sikhri-1). It reads a human-written English transcreation of a line of Gurbani, alongside the Gurmukhi from BaniDB, and points out places that may not follow SikhRI's translation rules, quoting the rule and the exact words. Eko never writes or suggests translation text; people make every change.

This document lists the 66 rules Eko is built from, then asks 15 questions about choices we made in turning those rules into checks. Each question shows **our current call**. If you leave a question unanswered, the current call stands.

To answer, write under **Your answer**, or give the option letter (for example "B"). Short answers are fine, and you can comment on any rule in the tables. SikhRI's style guide is reaching us separately, so there is no need to restate it here.

## Severity in plain words

Every issue Eko raises has one of three strengths. The rule's level (MUST, SHOULD, GUIDE) sets the strength.

| Strength | What it means | Comes from |
| --- | --- | --- |
| **Must-fix** | Blocks publishing until the text is changed, or someone overrides it with a written reason. | MUST rules |
| **Needs a reason** | A warning. The text can be published, but the person keeping it writes a short reason. | SHOULD rules |
| **Guidance** | Shown to reviewers as something to keep in mind. Eko never raises it as an issue. | GUIDE rules, and rules no automated check can judge |

Anyone on the team can resolve an issue, always with a written reason.

## The rules

All 66 rules, with their text exactly as in the team's draft (v0.1, drawn from SikhRI's Approach and Methodology pages). Eight are checked in this build, and two more (CONS-02, CONS-03) shape how those checks behave. The rest are not checked yet because Eko reviews the transcreation only; literal translation, word annotation and transcription come later.

### Foundational principles (PRIN)

| ID | Rule | Level | In this build |
| --- | --- | --- | --- |
| PRIN-01 | Interpret according to Gurmat, the principles of the Guru's Wisdom. | MUST | Reviewer guidance |
| PRIN-02 | Treat internal evidence from the Guru Granth Sahib itself as the primary authority. Outside resources are consulted but rank below it. | MUST | Process only |
| PRIN-03 | Present every rendering as the team's current understanding, not a final one. Understanding is expected to change as the relationship with Sabad deepens. | MUST | Removed by team |
| PRIN-04 | Never label a rendering as the single correct translation, or other translations as wrong. Multiple renderings can coexist. | MUST | Checked: Must-fix |
| PRIN-05 | Keep transcreation distinct from translation. They are separate deliverables with separate rules (see LAYER). | MUST | Reviewer guidance |
| PRIN-06 | Aim for closeness and intimacy, so the reader can engage personally with the Guru's teachings. | GUIDE | Reviewer guidance |
| PRIN-07 | Connect contemporary readers to Sabad within their present social, cultural and linguistic context. | GUIDE | Reviewer guidance |
| PRIN-08 | Assume a global reader with no prior knowledge; supply context and clarification accordingly. | SHOULD | Reviewer guidance |
| PRIN-09 | Draw on, and openly acknowledge, diverse schools of thought; name where interpretations diverge rather than hiding it. | SHOULD | Process only |

### Terminology (TERM)

| ID | Rule | Level | In this build |
| --- | --- | --- | --- |
| TERM-01 | Do not render the Divine as "God" or "Lord". These terms project connotations onto the Guru-Wisdom that the original does not carry. | MUST | Checked: Must-fix |
| TERM-02 | Retain the specific Divine attribute the original Sabad uses (for example, a name meaning Creator stays Creator) rather than collapsing every name into one English word. | MUST | Checked: Must-fix (the "same word for many names" part: Needs a reason) |
| TERM-03 | Use "IkOankar" for the core Divine concept, glossed on first use as One Universal Integrative Force (1Force, the One). | SHOULD | Checked: Needs a reason |
| TERM-04 | Avoid English terms with Judeo-Christian undertones when describing Sikh concepts. The named example: do not call the Guru Granth Sahib "scripture" or "canon". | MUST | Removed by team |
| TERM-05 | Equally avoid Hindu or Indological terms that misframe Sikh concepts. The named example: do not call the Guru Granth Sahib "ved" or "shastra". | MUST | Removed by team |
| TERM-06 | Before choosing an English equivalent for any term, check what the English word's own history implies; near-equivalents are not neutral. | SHOULD | Reviewer guidance |
| TERM-07 | Keep core Sikh terms in transcribed form, with a gloss, where English has no faithful equivalent. Terms SikhRI uses this way include Sabad (Infinite Wisdom), Nam (Identification with IkOankar), Bani, Gurmat, Panth (Collective), Patshah (Sovereign) and Prakash Purab (Illumination Day). | SHOULD | Checked: Needs a reason |
| TERM-08 | When the same word repeats in a Sabad, render it with the same English word throughout that Sabad. | SHOULD | Later |
| TERM-09 | Check the project glossary and prior renderings before introducing a new English equivalent (see CONS). | SHOULD | Merged into CONS-01 |

### Workflow and layers of meaning (FLOW)

| ID | Rule | Level | In this build |
| --- | --- | --- | --- |
| FLOW-01 | Do not write a transcreation for a line until its words have been annotated and its literal translation exists. | MUST | Later |
| FLOW-02 | Organize work by Bani (composition) rather than linearly through the volume. | SHOULD | Process only |
| FLOW-03 | For every term, weigh layer 1, words and terms: each word carries multiple meanings, connotations and history that cannot fully cross into English. | MUST | Process only |
| FLOW-04 | Weigh layer 2, historical implications: near-equivalent English terms carry their own developed connotations (see TERM-04 to 06). | MUST | Process only |
| FLOW-05 | Weigh layer 3, the audience: decide how much prior knowledge to assume, and how much added context the English needs to be intelligible. | MUST | Process only |
| FLOW-06 | Decide, per passage, where to sit between strict literal faithfulness and smooth, meaningful English. Record the choice. | SHOULD | Process only |
| FLOW-07 | Ground the commentary in a range of interpretive schools and discuss where they diverge. | SHOULD | Process only |

### Literal translation vs transcreation (LAYER)

| ID | Rule | Level | In this build |
| --- | --- | --- | --- |
| LAYER-01 | Retain every word, meaning, grammatical position and context present in the source line. | MUST | Later |
| LAYER-02 | Set the literal translation in italics. | MUST | Later |
| LAYER-03 | Put any English word added for readability, clarity or poetic balance inside parentheses, so it is visibly not in the source. | MUST | Later |
| LAYER-04 | Sentence order may be rearranged when needed for comprehension; meaning may not be added outside parentheses. | SHOULD | Later |
| LAYER-05 | Where possible, preserve the poetic balance and beauty of the line despite English lacking the source languages' oral roots. | GUIDE | Reviewer guidance |
| LAYER-06 | Write in contemporary English; the aim is resonance with today's reader. | MUST | Checked: Must-fix |
| LAYER-07 | Do not use parentheses; the transcreation is not a translation and nothing in it is marked as added. | MUST | Checked: Must-fix |
| LAYER-08 | Do not force the transcreation to mirror the original line, the literal translation or the Panjabi transcreation. | MUST | Later |
| LAYER-09 | Use the transcreation to elaborate, contextualize and expound the line, building on the literal translation. | MUST | Reviewer guidance |
| LAYER-10 | Capture the essence of the attributes of IkOankar as they appear in the original (TERM-01 to 03 apply here with full force). | MUST | Reviewer guidance |

### Consistency (CONS)

| ID | Rule | Level | In this build |
| --- | --- | --- | --- |
| CONS-01 | Default to the English rendering already used for the same or a similar term elsewhere in the project. | SHOULD | Checked: Needs a reason (once SikhRI reference renderings are loaded) |
| CONS-02 | Depart from the default when context requires it. Rigid consistency that ignores context is a misrepresentation. | MUST | Guides other checks |
| CONS-03 | Never vary a rendering without a reason. Each departure from the default needs a recorded justification. | MUST | Met by design |
| CONS-04 | Decide, per case, whether an explanatory footnote is needed, weighing the audience's expectations. | SHOULD | Reviewer guidance |

### Annotation fields (ANNO)

| ID | Rule | Level | In this build |
| --- | --- | --- | --- |
| ANNO-01 | List all literal meanings and the implied meaning of the word. | MUST | Later |
| ANNO-02 | Separate one literal meaning set from another with a comma; separate literal sets from the implied set with a semicolon. | MUST | Later |
| ANNO-03 | List every grammatical function: part of speech plus its aspects (case, person, gender, number, tense as applicable). | MUST | Later |
| ANNO-04 | Use a semicolon between the part-of-speech designation and its person, gender and number. | MUST | Later |
| ANNO-05 | Use the project's word classes: noun, pronoun, adjective or pronominal adjective, verb, adverb, particle, participle, postposition, conjunction, exclamatory. | MUST | Later |
| ANNO-06 | Trace forms back through source languages where possible (for example Old Panjabi, Lehndi, Braj, Sindhi, Apbhransh, Prakrit, Pali, Sanskrit, Arabic, Persian). | SHOULD | Reviewer guidance |
| ANNO-07 | Write Sanskrit and Arabic/Persian forms in both Gurmukhi and their own script; write other languages in Gurmukhi only. | MUST | Later |
| ANNO-08 | Use a slash between variants within one language, a semicolon between languages or changes of meaning, and quotation marks for text cited from a source. | MUST | Later |
| ANNO-09 | Give Sanskrit verb meanings in the masculine form; match singular or plural to the source form where an equivalent exists. | MUST | Later |
| ANNO-10 | Omit a language's meaning if it is the same as the Sanskrit, Pali or Arabic meaning already given. Put sources in footnotes only when needed. | SHOULD | Later |
| ANNO-11 | Consult both contemporary and historical dictionaries and literary sources. | SHOULD | Process only |

### Transcription (TRAN)

| ID | Rule | Level | In this build |
| --- | --- | --- | --- |
| TRAN-01 | Use transcription, not transliteration. Pronunciation takes precedence over pattern rules. | MUST | Later |
| TRAN-02 | In proper nouns outside line meanings and footnotes, use the common spelling. | MUST | Later |
| TRAN-03 | A consonant with no vowel sign carries an implicit "a", except when it is the last letter of a multi-letter word. | MUST | Later |
| TRAN-04 | A single-letter word keeps its implicit "a". | MUST | Later |
| TRAN-05 | The implicit "a" may be dropped mid-word where natural pronunciation drops it. | SHOULD | Later |
| TRAN-06 | Mark ਉ or ਇ following a short-"a" consonant with a dieresis. | MUST | Later |
| TRAN-07 | Vowel signs map to a, ā, i, ī, u, ū, e, ai, o, au. | MUST | Later |
| TRAN-08 | A ṭippī takes the nasal of the following consonant's row (ṇ, ṅ, ñ, n, m); word-final it defaults to "aṅ". | MUST | Later |
| TRAN-09 | Write all vowel nasalization as ṁ (ṭippī or bindī). | MUST | Later |
| TRAN-10 | Write visarg as ḥ, preceded by an implicit "a". | MUST | Later |
| TRAN-11 | Pronounce a subscript directly after its consonant, with no implicit "a" between them. | MUST | Later |
| TRAN-12 | Represent the halant-like sign with the same mark in Roman. | MUST | Later |
| TRAN-13 | Word-final ਅ after a vowel marks prolongation. | MUST | Later |
| TRAN-14 | Transcribe Gurmukhi numerals as Roman digits, unless the number is spelled out in the original. | MUST | Later |
| TRAN-15 | Farsi-derived letters use their Roman equivalent (ਫ਼ → f, ਜ਼ → z), or an underlined letter where Roman has none. | MUST | Later |
| TRAN-16 | Double the letter marked by adhak (only the first letter of a digraph). Adhak does not occur in the Guru Granth Sahib itself. | MUST | Later |

## Questions on our judgment calls

These 15 questions cover the places where we had to interpret a rule to turn it into a check. Questions with several parts number them (1), (2), and so on; an answer like "1A, 2C" is enough.

### Q1. Scope: transcreation only

**Rules:** TERM-04, TERM-05, PRIN-03

**In brief:** TERM-04 and TERM-05 say not to call the Guru Granth Sahib "scripture", "canon", "ved" or "shastra". PRIN-03 says every rendering is presented as the team's current understanding.

**Our current call:** Eko reviews the English transcreation only. Literal translation, word annotation and transcription rules are marked "Later". We removed TERM-04 and TERM-05 from Eko's checks because a single line's transcreation rarely describes the Guru Granth Sahib itself. We removed PRIN-03 because the humility note belongs to the publication, not to the transcreation text. The rules still apply to the team's work; Eko just does not check them.

**Question:** Do you agree with this scope?

- **A.** Yes, transcreation only, with these three rules removed from Eko's checks. (current)
- **B.** Yes to transcreation only, but keep TERM-04 and TERM-05: Eko should still catch "scripture", "canon", "ved" or "shastra" when a transcreation uses them for Gurbani or the Guru Granth Sahib.
- **C.** Something else (please explain).

**Your answer:**

 

### Q2. "God" and "Lord"

**Rules:** TERM-01

**In brief:** Do not render the Divine as "God" or "Lord".

**Our current call:** Eko reads this as a rule about how the Divine is rendered. Capitalized "God" or "Lord" (and forms like "Godhead" or "Lordship") is Must-fix. Lowercase or plural forms ("gods", "lords", "goddess") are checked against the Gurmukhi line: if the line speaks of worldly rulers or of deities it names itself, they pass. Words like "landlord" never trigger the check. The draft's reviewer checklist says "No God or Lord anywhere"; we read that as shorthand for the rule.

**Question:**

(1) Where does the ban apply?

- **A.** Only when the word refers to the Divine. (current)
- **B.** To any use of "God" or "Lord" in a transcreation, whatever it refers to.

(2) Lowercase or plural "gods", "lords", "lord" or "master", when the line speaks of other deities or worldly rulers:

- **A.** Acceptable. (current)
- **B.** Should be raised; the transcreator should choose another word.
- **C.** Depends on the word (please say which).

**Your answer:**

 

### Q3. Divine names and their attributes

**Rules:** TERM-02 (and LAYER-10)

**In brief:** Keep the specific Divine attribute the original uses, rather than collapsing every name into one English word.

**Our current call:** Until we have SikhRI's list of Divine names, Eko checks only two things. First, Kartar and Karta, whose meaning is in the word itself, must be rendered with "Creator" (the rule's own example); anything else is Must-fix. Second, if three or more different Divine names in one Sabad are all rendered with the same English word, Eko raises Needs a reason. Eko does not judge other names yet.

**Question:**

(1) Please fill in what you can. Leave a row blank if the style guide covers it.

| Name | English rendering or attribute SikhRI uses | Ever kept untranslated? |
| --- | --- | --- |
| Hari |  |  |
| Ram |  |  |
| Prabh |  |  |
| Thakur |  |  |
| Sahib |  |  |
| Kartar / Karta | Creator (our assumption) |  |
| Gobind |  |  |

(2) Kartar and Karta always become "Creator"?

- **A.** Yes. (current)
- **B.** Not always (please explain when not).

(3) The "same word for many names" warning:

- **A.** Raise it when 3 or more different names in one Sabad get the same English word. (current)
- **B.** Raise it at 2 or more.
- **C.** Do not raise it; leave it to reviewers.

**Your answer:**

 

### Q4. IkOankar

**Rules:** TERM-03

**In brief:** Use "IkOankar", glossed on first use as One Universal Integrative Force (1Force, the One).

**Our current call:** The spelling must be exactly "IkOankar"; variants such as "Ik Onkar", "Ek Onkar" or "Ikonkar" are Needs a reason. "First use" means the first time it appears in each Sabad. Because LAYER-07 allows no parentheses in a transcreation, we expect the gloss to follow the word after a comma or dash, for example: "IkOankar, One Universal Integrative Force, ..." (format only, not a suggested rendering). We expect "One Universal Integrative Force" in the gloss; "1Force, the One" is not required.

**Question:**

(1) First use is counted within:

- **A.** each Sabad. (current)
- **B.** each Bani.
- **C.** the whole publication.

(2) Gloss format in a transcreation:

- **A.** After a comma or dash, as above. (current)
- **B.** In a footnote, not in the line.
- **C.** Not needed in the transcreation at all.
- **D.** Other (please describe).

(3) Should "1Force, the One" also appear in the gloss? Yes / No (current)

(4) Is "IkOankar" (one word, capital O) the only accepted spelling? Yes (current) / No, also: ___

**Your answer:**

 

### Q5. Core Sikh terms kept in transcribed form

**Rules:** TERM-07

**In brief:** Keep core Sikh terms in transcribed form, with a gloss, where English has no faithful equivalent.

**Our current call:** Eko expects these spellings: Sabad (not Shabad or Shabd), Nam (not Naam), Patshah (not Padshah), Prakash Purab (not Parkash Purab). Other spellings are Needs a reason. Titles of Banis are proper nouns and are not checked for spelling. When an English word such as "the Word", "the Name" or "hymn" stands in for one of these terms, Eko raises Needs a reason. A missing gloss on first use in a Sabad gets a gentle note only, not an issue.

**Question:**

(1) Are the terms and spellings right?

- **A.** Yes, as listed. (current)
- **B.** Changes or additions: ___

(2) Are Bani titles exempt from these spelling checks?

- **A.** Yes. (current)
- **B.** No.

(3) English substitutes such as "the Word", "the Name", "hymn":

- **A.** Needs a reason. (current)
- **B.** Must-fix.
- **C.** Acceptable; do not raise.
- **D.** Depends on the word (please say which).

(4) A gloss on first use in the transcreation is:

- **A.** nice to have; a gentle note only. (current)
- **B.** expected; Needs a reason if missing.
- **C.** not expected in the transcreation.

**Your answer:**

 

### Q6. Repeated words within a Sabad

**Rules:** TERM-08 (with LAYER-08)

**In brief:** When the same word repeats in a Sabad, render it with the same English word throughout.

**Our current call:** Not applied to the transcreation. LAYER-08 frees the transcreation from mirroring the original, so we read TERM-08 as a literal-translation rule, which is outside this build.

**Question:** Should repeated words also be rendered consistently in a transcreation?

- **A.** No, the transcreation is free here. (current)
- **B.** Yes: Needs a reason when a repeated word gets different English words.
- **C.** Only for Divine names and core terms (TERM-02, TERM-07).

**Your answer:**

 

### Q7. Claims of a single correct reading

**Rules:** PRIN-04

**In brief:** Never label a rendering as the single correct translation, or other translations as wrong.

**Our current call:** Must-fix when the transcreation claims a single correct reading or calls other renderings wrong, such as "the only correct meaning" or "other translations are wrong". Phrases like "the true meaning" are checked in context, so everyday uses like "a true friend" pass.

**Question:** Which of these should Eko raise in a transcreation? Mark each Yes or No, and add any wording we missed.

| Wording | Raise it? |
| --- | --- |
| "the only correct meaning / translation" | Yes (current) |
| "other translations are wrong / mistaken" | Yes (current) |
| "the true meaning of this line" | Checked in context (current) |
| "the real meaning is" | Checked in context (current) |
| "this clearly means" |  |
| "properly understood, ..." |  |
| Other: |  |

**Your answer:**

 

### Q8. Contemporary English and archaic words

**Rules:** LAYER-06

**In brief:** Write the transcreation in contemporary English.

**Our current call:** We read this rule as ruling out archaic words. A fixed list (thee, thou, thy, thine, hath, doth, unto) is Must-fix. Words that may or may not be archaic ("art", "ye", "lo", "-eth" endings) are checked in context, so "forest" or "best" never trigger. Eko does not judge plain versus elevated register.

**Question:**

(1) Archaic words in a transcreation are:

- **A.** not allowed; Must-fix. (current)
- **B.** discouraged; Needs a reason.
- **C.** allowed in some cases (please say which).

(2) Register:

- **A.** plain, everyday English.
- **B.** elevated but contemporary English.
- **C.** either; leave it to the transcreator, no check. (current)

**Your answer:**

 

### Q9. No parentheses or brackets

**Rules:** LAYER-07

**In brief:** Do not use parentheses in the transcreation; nothing in it is marked as added.

**Our current call:** Any round bracket or square bracket in a transcreation is Must-fix, with no exceptions. Square brackets count because they also mark words as added.

**Question:**

(1) Square brackets:

- **A.** count, same as parentheses. (current)
- **B.** are allowed.

(2) Exceptions (for example, line or page references):

- **A.** None. (current)
- **B.** Yes: ___

**Your answer:**

 

### Q10. Mirroring the literal translation

**Rules:** LAYER-08 (with LAYER-09)

**In brief:** Do not force the transcreation to mirror the original line, the literal translation or the Panjabi transcreation.

**Our current call:** Not checked. Eko sees the transcreation and the Gurmukhi line, but no literal translation, so it cannot tell when a transcreation follows the literal too closely.

**Question:** Where SikhRI has a published literal translation of the line, should Eko compare against it?

- **A.** No; leave this to reviewers. (current)
- **B.** Yes, shown to reviewers as Guidance only.
- **C.** Yes, as Needs a reason.

If B or C: can SikhRI share its published literals for this?

**Your answer:**

 

### Q11. Departing from the reference rendering

**Rules:** CONS-01, CONS-02, CONS-03 (CONS-01 absorbs TERM-09)

**In brief:** Default to the rendering already used in the project; depart when context requires it; record a reason for every departure.

**Our current call:** Once SikhRI's reference renderings are loaded, Eko raises Needs a reason when a transcreation renders a term differently: "differs from reference rendering, add a reason". Writing a reason clears it (CONS-02). Eko keeps the reason as the record (CONS-03).

**Question:**

(1) Is this the right handling?

- **A.** Yes; a written reason clears it. (current)
- **B.** A second person should accept the reason before it clears.
- **C.** Other (please explain).

(2) Where does SikhRI record such reasons today?

- **A.** A footnote in the publication.
- **B.** An internal term log or glossary.
- **C.** Both.
- **D.** Not recorded formally.

(3) If there is such a record, could Eko read it?

**Your answer:**

 

### Q12. How strict each level is

**Rules:** All rules, by level

**In brief:** The draft rules are MUST, SHOULD or GUIDE.

**Our current call:** MUST rules are Must-fix: they block publishing until fixed or overridden with a written reason. SHOULD rules are Needs a reason: they never block. GUIDE rules are Guidance and are never raised.

**Question:**

- **A.** Agree. (current)
- **B.** Some MUST rules should not block (which?).
- **C.** Some SHOULD rules should block (which?).

**Your answer:**

 

### Q13. Eko's own wording

**Rules:** PRIN-04

**In brief:** No rendering is the single correct one.

**Our current call:** Eko's messages say "differs from reference rendering", never "incorrect" or "wrong". "Approved" is used only as a workflow status (for example, "approved for publishing"), never to mean "correct".

**Question:**

- **A.** Acceptable as is. (current)
- **B.** Prefer "differs from published rendering".
- **C.** Other wording: ___

**Your answer:**

 

### Q14. Gaps that affect checks

**Rules:** None yet (gaps in the draft)

**In brief:** The draft has no rule on these, so Eko raises nothing about them.

**Our current call:** No checks. Eko will at most show an observation to reviewers until SikhRI decides. If the style guide covers any of these, "see style guide" is a full answer.

**Question:**

(1) Pronouns for the Divine:

- **A.** "You" capitalized; no gendered third person (no He or His).
- **B.** "you" lowercase; no gendered third person.
- **C.** Other: ___
- **D.** No preference; no check. (current)

(2) Capitalization: which of these are capitalized? Wisdom, Divine, Guru, Will, others: ___

(3) Loaded words beyond God, Lord, scripture and canon. For each, write Avoid, Use with care, or Fine:

| Word | Avoid / Use with care / Fine | Note |
| --- | --- | --- |
| soul |  |  |
| sin |  |  |
| heaven |  |  |
| salvation |  |  |
| worship |  |  |
| prayer |  |  |
| saint |  |  |

**Your answer:**

 

### Q15. Anything we missed

**Rules:** Any

**In brief:** Eko checks only a small set of rules in this build.

**Our current call:** The checks listed above.

**Question:** Is there anything Eko should check in a transcreation that this document does not cover?

**Your answer:**

## Thank you

Thank you for your time and care with these questions. Partial answers are welcome; any question left blank keeps our current call. Reply to Team BJ13.
