# 05 · Data sources

What Eko reads, where it comes from, and the terms attached. Researched Oct 16, 2026; items marked *unverified* weren't confirmed against a live system.

## Summary

| Asset | Status | Used for |
|---|---|---|
| **BaniDB** (Khalis Foundation) | Local dev seed verified partial; complete private demo fixture from the documented API fallback | Gurmukhi, ang, raag, writer, line and Sabad IDs |
| **SikhRI sample** (reference transcreations, review history) | Promised by the brief; arrives on build day | Style and consistency checks, published-line replay, backtest |
| **SikhRI style guide** | Coming separately from SikhRI's team | Settling pronouns, capitalization, loaded words, register |
| **SikhRI Guru Granth Sahib Dictionary** | Web only, all rights reserved, no API | Not used. Link out at most |
| **SikhRI published translations** (gurugranthsahib.io) | Web only; terms forbid scraping and copying | Not used. Not in BaniDB either |
| **Mahan Kosh** | Inside BaniDB, Punjabi definitions only | Not needed for P0 |

## BaniDB: offline database

Ingest reads a local database rather than the hosted API: no rate limits, no network dependency during ingest.

- **How:** BaniDB's own repository ships a development database image, `khalisfoundation/banidb-dev` (MariaDB). Its compose file exposes port 3306 with database `khajana_dev_khajana`. Eko's `data/banidb/docker-compose.yml` runs it. A separately supplied private BaniDB SQLite copy now provides the complete local demo export from `tmp_Verse`; `scripts/app/ingest.ts` imports that ignored export into `eko.db`. The engine computes words and stems in memory.
- **Verified source limits (task P-05, 2026-10-16):** the pinned development image has 20,134 Guru Granth Sahib verses and 39,977 missing mapped verses. Covering all 1430 angs does not establish completeness. The user-supplied SQLite copy's `tmp_Verse` has 60,403 G-source rows, all 60,111 checked G-Sabad mappings, and Unicode parity with all 20,134 shared `Verse` rows. It yielded the private canonical five-line local demo fixture; the earlier API Sabad 55 fallback remains private. This verifies a demo source, not a current or independently audited full corpus. Reproduction and evidence: [C-03 setup](c03-banidb.md). No access request has been sent to Khalis Foundation.
- **Schema:** read the table names from the image, or from BaniDB-API's source (`api/controllers`, `api/lib/getJSON.js`). The API's per-verse fields include verse ID, Sabad ID, Gurmukhi (Unicode), page (ang) number, line number, writer, raag and source. Map these to Eko's `Line` record.
- **Translations in BaniDB:** English by Sant Singh Khalsa, Manmohan Singh and BaniDB volunteers. **No SikhRI translation is included.** These aren't SikhRI's voice, so never use them as references for style checks. They're fine as filler text for testing the pipeline, clearly labelled.
- **Normalize** all Gurmukhi to Unicode NFC at ingest. Watch for nukta forms, bindi vs. tippi, and adhak.

### BaniDB terms

From https://www.banidb.com/tos and https://www.banidb.com/nposl.

| Term | What it means for Eko |
|---|---|
| Written acknowledgement and the BaniDB logo | FR-21: attribution and logo in the app footer |
| Data under NPOSL-3.0 (non-profit, share-alike) | Fine for a non-profit hackathon build for SikhRI |
| A database copy must be refreshed every 90 days | Re-run the image pull and ingest if the build lives on |
| No redistribution without written permission | Don't commit BaniDB data or `eko.db` to the repo; the required ignore patterns are now present |
| Projects must contribute 20 submissions or votes a month, or pay $15/month | Unclear for a hackathon prototype; ask Khalis Foundation (task P-06) |

The BaniDB-API code itself is MIT-licensed: https://github.com/KhalisFoundation/BaniDB-API

## SikhRI sample (expected on build day)

The brief says teams work from a sample of SikhRI's ruleset, approved translations and review history. What Eko needs from it:

| Dataset | Used for | Fields needed | Minimum useful | If late or missing |
|---|---|---|---|---|
| A. Reference transcreations | Claims about SikhRI's established voice, cited style check, published-line replay; deterministic CONS-01 only with explicit term mapping | line or Sabad ID (or Gurmukhi text), English transcreation; term-to-rendering alignment or preferred-term glossary if available | 3–5 Sabads (about 50–100 tukks) | Eko-published references may exercise citation checks with source labels; do not claim comparison against SikhRI's historical corpus or infer term mappings from line-level English alone |
| B. Review history | Backtest (beat 6) | pre-edit draft, final text, line ID, reviewer note if any | 30–50 real corrections | Beat 6 can't be shown credibly. Top ask |
| C. Demo draft | The live demo | one Sabad's human-written draft with real or realistic issues | 1 Sabad | The team writes it with planted issues (task P-09); F0 seeds source lines only by user direction |

**Format risks:**
- **IDs:** SikhRI likely uses its own Sabad IDs, not BaniDB's. Fallback: match lines on normalized Gurmukhi text; repeated identical lines can make this ambiguous, so quarantine those rows for human mapping instead of choosing the first match.
- **Layer:** confirm the sample includes transcreations, not only literal translations.

Store the sample under `data/sikhri-sample/` (git-ignored). Never commit it.

## What we don't use, and why

| Asset | Where | Why not |
|---|---|---|
| SikhRI Guru Granth Sahib Dictionary | https://gurugranthsahibdictionary.io | Web only; "All Rights Reserved"; no API or export. Would have powered grammar hints and word meanings, which is why those are P1 |
| SikhRI published translations (TGGSP) | https://gurugranthsahib.io | Terms forbid automated access, copying and adaptation (https://gurugranthsahib.io/info/english/terms-of-use). Use only what SikhRI shares directly |
| Mahan Kosh | BaniDB `/kosh` tables | Punjabi-only definitions, no grammar tags; not needed for transcreation checks |

## Useful public reference

SikhRI's methodology page (https://gurugranthsahib.io/info/english/methodology) publishes conventions the ruleset draws on: terms like Sabad, Bani, pauri and salok stay untranslated; avoid "scripture" and "canon"; prefer "reasoned consistency" over rigid consistency. Read it; don't copy it into the repo.
