# C-03 · Local BaniDB and private demo export

## Verified on 2026-10-16

Docker Desktop 29.6.1 runs the official `khalisfoundation/banidb-dev` image using its upstream database name, `khajana_dev_khajana`. Compose pins the observed digest `sha256:a4198a3c66f6bdfa3dedf77e53f5f90923205f5630353e5cafe757e52c02ef0f`. The image is amd64, built 2020-06-04; Apple Silicon uses Docker's amd64 emulation. Its 642 MB initialization SQL imports into a Docker-managed named volume, `eko-banidb_mysql-data`. Only `127.0.0.1:3307` is exposed by default.

**The development seed is partial.** Source `G` is Sri Guru Granth Sahib Ji. It contains 20,134 stored verses over all 1,430 angs, IDs 3–60,402, all divisible by three. Ang coverage does not establish completeness. Even clean observed-map checks could miss wholly omitted Sabads, so the exporter reports completeness as `false` when gaps are proven and `unknown` otherwise; it never certifies a full corpus from range/count checks alone. The `Shabad` mapping table retains source IDs for absent verses: Sabad 55 maps 15 lines, while its local `Verse` join returns only five. Only Sabads 3250, 3658 and 4762 have complete G-source mappings, each one line, and all three lack writer metadata. No complete local Sabad satisfies the agreed source/metadata contract.

The canonical private fixture therefore uses the **explicit one-time API fallback**, not a mix of API and local lines: Sabad 55, 15 lines (IDs 604–618), Rahao line 609. It is a canonical `Sabad` object with string IDs and NFC Unicode; provenance is separate. Its SHA-256 is `ff2c4dbeb428d821e80fd151fa3d689355e6316d67b2af944341652486f39f82`. The canonical fixture omits English renderings and translations. The ignored raw API response retains upstream fields, including translations; none are generated or used as SikhRI references.

**Acceptance gap:** local service startup and source assessment pass; a complete metadata-valid fixture exported from the local database cannot pass with this seed. The API fixture unblocks source-based development. A fuller/current database from Khalis Foundation remains necessary for local-export acceptance and full browsing. No request has been sent to Khalis Foundation.

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

Only `data/banidb/docker-compose.yml` may be tracked under `data/banidb/`. Both exporters verify Git ignores before writing. Database data stays in Docker's volume outside Git. Stop the service without deleting its volume:

```text
docker compose --env-file data/banidb/.env -f data/banidb/docker-compose.yml down
```

`down -v` deletes the private database and is unnecessary for normal shutdown. Pulling a new image does not refresh an existing volume; a future refresh needs an explicit backup/re-import procedure and source verification.

## Upstream evidence and terms

The [official BaniDB API repository](https://github.com/KhalisFoundation/banidb-api/tree/dev), its [development compose file](https://github.com/KhalisFoundation/banidb-api/blob/dev/bin/docker-compose.yml), [Sabad SQL controller](https://github.com/KhalisFoundation/banidb-api/blob/dev/api/controllers/shabads.js), [response mapper](https://github.com/KhalisFoundation/banidb-api/blob/dev/api/lib/getJSON.js), and [endpoint specification](https://github.com/KhalisFoundation/banidb-api/blob/dev/swagger.json) establish the image, table joins, source field mapping and `GET /v2/shabads/{shabadID}` fallback. The [live Sabad 55 endpoint](https://api.banidb.com/v2/shabads/55) was verified on 2026-10-16.

The [published BaniDB terms](https://www.banidb.com/tos/) require entire-data use, acknowledgement/logo, database refresh within 90 days, and contributions or payment; redistribution needs written permission. The hackathon/subset interpretation and contribution requirement remain unresolved (P-06/OQ-04/05). Private development exports do not establish redistribution permission, current data freshness, or production readiness. The 2020 image is a reproducible development snapshot, not a current production database.
