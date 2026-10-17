# C-03 · Local BaniDB and private demo export

## Local SQLite source supplied on 2026-10-16

The user supplied a private, ignored `data/banidb/banidb.sqlite`. Its main `Verse` table has the same 20,134 G-source rows and 39,977 missing mapped rows as the pinned Docker development image. Its `tmp_Verse` table has 60,403 G-source rows with IDs 1–60,403, source text on every G-Sabad mapping (60,403 mapping rows in the current coverage report; an earlier pass recorded 60,111 checked mappings with a narrower query), and no missing Unicode. All 20,134 G-source Unicode strings shared with `Verse` match exactly. This establishes a usable **local source for a demo Sabad**; table coverage and overlap are not an independent textual audit or proof that the database is current or contains every composition.

The read-only SQLite exporter validates mapping coverage, overlap, source IDs, metadata, NFC, and Rahao notation before replacing the canonical private fixture. It exported Sabad 1356: five lines, one Rahao line, SHA-256 `548b315ef87aa0aeecb6462c9a933b6199a73c36cdaba64fea3c32b85d54553e`. The earlier complete API Sabad 55 fixture and provenance remain ignored as `data/banidb/sabad.api-fallback.json` and `data/banidb/export-metadata.api-fallback.json`. No Gurmukhi or BaniDB database content is committed.

With the supplied SQLite copy in place, run these repository-relative commands from the root. The exporter selects Sabad 1356 unless an ID is given; it never reads English translations. Ingest writes source lines and the verbatim 66-rule version 1 seed to the app's local `eko.db`, creates the app migration if needed, and is repeatable without duplicates.

```text
node --import tsx scripts/app/export-banidb-sqlite-demo.ts
node --import tsx scripts/app/ingest.ts
node --import tsx scripts/app/seed-demo.ts
```

`seed-demo.ts` deliberately seeds the source Sabad only. It adds no English draft or review decision; a human-authored demo draft is a later P-09/F1 input (D-75).

**Full-corpus ingest (D-86).** When `data/banidb/banidb.sqlite` exists and is Git-ignored, `ingest.ts` and `seed-demo.ts` load every G Sabad (5,542 Sabads, 60,403 lines) from `tmp_Verse` after the exporter's coverage gate, in one transaction. A repeat run inserts nothing, and a changed line or line set is refused rather than silently replaced. Only source ID, ang, raag, writer, Rahao and Unicode Gurmukhi are read; no English, translation, transliteration or Punjabi column. A line without a writer or raag takes its Sabad's single distinct value; when the Sabad has none or several, it stores the literal label `Not recorded in BaniDB` (40 lines today). Set `BANIDB_SOURCE=fixture` (exact value) to force the fixture path below.

**App startup on an empty database.** `pnpm dev` (`lib/server/services/context.ts`) bootstraps an empty `eko.db` with the same source selection as `pnpm ingest`: the full corpus from `data/banidb/banidb.sqlite` when it exists (about 6 s once, in one transaction), else the demo fixture. Both read the same lines, so a later `pnpm ingest` finds them identical and inserts nothing. An existing database that was bootstrapped from the fixture before this change is not rewritten; if a later ingest refuses a changed line there, move `eko.db` aside (it also holds drafts and decisions) or point `DATABASE_URL` at a fresh file.

**Fixture fallback.** Without the SQLite copy, or with `BANIDB_SOURCE=fixture`, both scripts load the single canonical fixture and verify its SHA-256, Sabad/line IDs, Rahao IDs, and `tmp_Verse` provenance against the ignored export metadata before writing. Ingest accepts either provenance record (the local SQLite export or the D-70 hosted-API fallback), verifies both by SHA-256 and Sabad/line/Rahao IDs, and reports which kind it used as `provenance` (`local_sqlite` or `banidb_api_fallback`) beside `mode: "demo_fixture"`. A custom `DATABASE_URL` inside the repository is accepted only if Git ignores that path; the BaniDB source directory is never an app-database target. Outside-repository database paths are allowed for temporary tests.

## P-05 coverage audit (2026-10-16)

`node --import tsx scripts/app/audit-banidb-coverage.ts` opens `data/banidb/banidb.sqlite` read-only, checks internal consistency of the G-source `tmp_Verse` rows and their `Shabad` mappings, and spot-checks a deterministic sample against the public BaniDB API (`GET /v2/shabads/{id}`, sequential, 250 ms apart). It writes the ignored `data/banidb/coverage-audit.json` (counts and IDs only; no Gurmukhi) and prints a short summary. Its tests use an in-memory database with placeholder ASCII and a stubbed fetch.

**Internal consistency: pass.** 60,403 G rows with continuous IDs 1–60,403; all 1,430 angs present, none out of range; 5,542 Sabads (`ShabadID` below 5,000,000), every one fully mapped (mapped count equals joined count) with no unmapped G verse; no verse mapped to more than one Sabad; no missing Unicode and no string that differs from its NFC form. `LineNo` is the printed line on the ang, so verses legitimately share a value on every ang; no ang has a missing or decreasing value. 1,120 Sabads span more than one ang. 2,621 Sabads carry a Rahao marker under the exporter's detection.

**Metadata gaps.** 5,194 G lines have no writer; 20 Sabads have no writer on any line (IDs are listed in the report) and 15 have more than one writer. Every line has a raag, and every writer and raag ID resolves. Ingest handles these with the inherit-else-label rule above (Harsimran's decision, D-86).

**Live sample parity: 43 of 44 Sabads.** The sample is every 138th Sabad plus those on ang 1 and ang 1430. For 43 the ordered verse ID list and NFC Unicode match the API exactly. Sabad 4281 has the same seven verse IDs, but lines 51850 and 51852 differ: the same code points, with two adjacent combining marks (U+0A40 and U+0A02) in the opposite order in the API. Exact-string comparison of this copy with the live API can therefore differ for such lines; which order is intended is not established here.

**Currency.** Every G `Updated` stamp is 2019-12-03 (60,399 rows at one time, four at another). The sample shows the copy agrees with the API today for 43 of 44 Sabads, but that does not show the copy is current; it is not a full comparison.

**Remaining limitation.** The audit proves internal consistency and sampled parity for roughly 0.8% of the Sabads. It does not prove the text is correct, that every composition is present, or that the copy meets BaniDB's 90-day refresh term; the sample covers 44 of 5,542 Sabads.

## Demo Sabads (P-07, D-87, D-88)

`node --import tsx scripts/app/find-demo-sabads.ts` needs the SQLite copy. It takes the Kartar/Karta forms from the TERM-02 seed prefilter and the opening glyph from the TERM-03 keywords, keeps complete Sabads with a Rahao line and recorded writer/raag, and writes IDs and English metadata only to the ignored `data/banidb/demo-sabads.json`. Harsimran confirmed the picks (D-88): 1356 (ang 339, kept), 1568 (ang 404, Kartar/Karta form) and 693 (ang 219, opens with the Ik Onkar glyph).

## Earlier Docker-image assessment on 2026-10-16

Docker Desktop 29.6.1 runs the official `khalisfoundation/banidb-dev` image using its upstream database name, `khajana_dev_khajana`. Compose pins the observed digest `sha256:a4198a3c66f6bdfa3dedf77e53f5f90923205f5630353e5cafe757e52c02ef0f`. The image is amd64, built 2020-06-04; Apple Silicon uses Docker's amd64 emulation. Its 642 MB initialization SQL imports into a Docker-managed named volume, `eko-banidb_mysql-data`. Only `127.0.0.1:3307` is exposed by default.

**The development seed is partial.** Source `G` is Sri Guru Granth Sahib Ji. It contains 20,134 stored verses over all 1,430 angs, IDs 3–60,402, all divisible by three. Ang coverage does not establish completeness. Even clean observed-map checks could miss wholly omitted Sabads, so the exporter reports completeness as `false` when gaps are proven and `unknown` otherwise; it never certifies a full corpus from range/count checks alone. The `Shabad` mapping table retains source IDs for absent verses: Sabad 55 maps 15 lines, while its local `Verse` join returns only five. Only Sabads 3250, 3658 and 4762 have complete G-source mappings, each one line, and all three lack writer metadata. No complete local Sabad satisfies the agreed source/metadata contract.

Before the separate SQLite copy arrived, the canonical private fixture used the **explicit one-time API fallback**, not a mix of API and local lines: Sabad 55, 15 lines (IDs 604–618), Rahao line 609. It is a canonical `Sabad` object with string IDs and NFC Unicode; provenance is separate. Its SHA-256 is `ff2c4dbeb428d821e80fd151fa3d689355e6316d67b2af944341652486f39f82`. The current canonical fixture is the local SQLite export described above. Both fixtures omit English renderings and translations. The ignored raw API response retains upstream fields, including translations; none are generated or used as SikhRI references.

**Docker image limit:** local service startup and source assessment pass, but a complete metadata-valid fixture still cannot be exported from that image's `Verse` table. The supplied SQLite copy provides a separate local export path for the demo; full browsing and production freshness remain unverified. No request has been sent to Khalis Foundation.

## Reproduce privately

Run from the repository root with Node 22, Docker Desktop running and the pinned project dependencies installed separately on this machine. The recorded verification above ran on macOS; Windows runtime verification remains outstanding. On Windows, Docker Desktop must use Linux containers. The pinned Linux/amd64 image runs natively on x64 hosts and through emulation on ARM hosts where Docker supports it.

Create credentials once with this command, which works in macOS shells and Windows PowerShell and refuses to overwrite an existing env file. Unix mode bits apply on macOS; Windows file permissions follow its ACLs. Keep this private file in the local clone. Keep the env file with its initialized volume, because changing its password does not change an initialized MariaDB password. Do not copy Docker storage or `node_modules` across operating systems.

```text
node --input-type=module -e "import { mkdirSync, writeFileSync } from 'node:fs'; import { randomBytes } from 'node:crypto'; mkdirSync('data/banidb', { recursive: true }); writeFileSync('data/banidb/.env', 'BANIDB_ROOT_PASSWORD=' + randomBytes(24).toString('hex') + '\nBANIDB_PORT=3307\n', { flag: 'wx', mode: 0o600 });"
docker compose --env-file data/banidb/.env -f data/banidb/docker-compose.yml up -d --wait
```

The local exporter reads only source text/metadata, records corpus and missing-map evidence, and checks every Sabad mapping before writing. It prefers a complete compact Sabad, with Rahao when available. With the verified partial seed, the default fails clearly and writes only the ignored coverage report; requesting 55 rejects its 5/15 line mismatch without overwriting the fixture.

```text
node --env-file=data/banidb/.env --import tsx scripts/app/export-banidb-demo.ts
# For a fuller database, optionally pass a BaniDB Sabad ID:
node --env-file=data/banidb/.env --import tsx scripts/app/export-banidb-demo.ts 55
```

Use the fallback deliberately for this partial seed. It makes one request to the official endpoint, validates the source ID, response count, Sabad ID, line IDs and metadata, then copies Unicode and normalizes NFC. Writer and raag come from BaniDB's Sabad metadata. Rahao is detected from the standalone legacy source marker in BaniDB's unmodified source field, without generating or converting Gurmukhi.

```text
node --import tsx scripts/app/export-banidb-api-demo.ts 55
pnpm typecheck
pnpm test
```

Ignored private artifacts:

- `lib/contracts/fixtures/sabad.demo.json`: canonical fixture; never commit it.
- `data/banidb/local-coverage.json`: local source counts, ang coverage and missing source mappings.
- `data/banidb/export-metadata.json`: provenance, source IDs, normalization and hashes of the current canonical fixture.
- `data/banidb/api-sabad-55.json`: original API response, private and ignored; includes upstream fields the fixture deliberately omits.
- `data/banidb/.env`: generated local credentials, private and ignored.
- `data/banidb/banidb.sqlite`: user-provided local BaniDB copy, private and ignored; its source assessment is separate from the pinned Docker image.
- `data/banidb/sqlite-coverage.json`: local staging-table coverage and overlap counts, private and ignored.
- `data/banidb/sabad.api-fallback.json` and `export-metadata.api-fallback.json`: retained API fallback and provenance, private and ignored.

Only `data/banidb/docker-compose.yml` may be tracked under `data/banidb/`. Both exporters verify Git ignores before writing. Database data stays in Docker's volume outside Git. Stop the service without deleting its volume:

On macOS, C-05 checked the ignored paths above, SQLite sidecar files, `.env.local`, nested SikhRI samples, cache and eval output, and local app database names with `git check-ignore`. `git status` offered none of the existing private files, and `git ls-files` showed only `docker-compose.yml` under `data/banidb/`. Windows clone validation remains open by user direction.

```text
docker compose --env-file data/banidb/.env -f data/banidb/docker-compose.yml down
```

`down -v` deletes the private database and is unnecessary for normal shutdown. Pulling a new image does not refresh an existing volume; a future refresh needs an explicit backup/re-import procedure and source verification.

## Upstream evidence and terms

The [official BaniDB API repository](https://github.com/KhalisFoundation/banidb-api/tree/dev), its [development compose file](https://github.com/KhalisFoundation/banidb-api/blob/dev/bin/docker-compose.yml), [Sabad SQL controller](https://github.com/KhalisFoundation/banidb-api/blob/dev/api/controllers/shabads.js), [response mapper](https://github.com/KhalisFoundation/banidb-api/blob/dev/api/lib/getJSON.js), and [endpoint specification](https://github.com/KhalisFoundation/banidb-api/blob/dev/swagger.json) establish the image, table joins, source field mapping and `GET /v2/shabads/{shabadID}` fallback. The [live Sabad 55 endpoint](https://api.banidb.com/v2/shabads/55) was verified on 2026-10-16.

The [published BaniDB terms](https://www.banidb.com/tos/) require entire-data use, acknowledgement/logo, database refresh within 90 days, and contributions or payment; redistribution needs written permission. The hackathon/subset interpretation and contribution requirement remain unresolved (P-06/OQ-04/05). Private development exports do not establish redistribution permission, current data freshness, or production readiness. The 2020 image is a reproducible development snapshot, not a current production database.
