# Formats

Three JSON formats are defined in `packages/archive-format/src/{types.ts,schema.ts}`
and validated with `zod` before they are ever written or trusted after being
read. All three are versioned (`version: 1`) so a future incompatible change
can be introduced as `version: 2` without breaking old releases.

## 1. `archive-release.json` — inside every collection

Written to the root of every uploaded collection by
`packages/archive-format/src/release-builder.ts`, and re-validated by the
recovery reader before it downloads a single file.

```jsonc
{
  "format": "org.road-to-devcon.archive-release",
  "version": 1,
  "releaseId": "b2b9b6b0-...",       // UUID, content-independent
  "title": "Spiti Folios v1",
  "publishedAt": "2026-01-01T00:00:00.000Z",
  "files": [
    {
      "path": "folios/page-001.jpg", // normalized relative POSIX path
      "contentType": "image/jpeg",
      "sizeBytes": 482113,
      "sha256": "<64-hex>",
      "description": "optional, public"
    }
  ]
}
```

Compatibility rules:

- `path` is validated with `normalizeRelativePath` (see
  `packages/archive-format/src/paths.ts`): no absolute paths, no `..`, no
  empty segments, no duplicates after normalization. Windows backslashes are
  normalized to `/` before validation.
- `files` must contain at least one entry — an empty collection is rejected
  before upload.
- `title` and any `description` are public by construction: the builder only
  ever includes what the operator explicitly selected.
- A future `version: 2` must remain parseable by old readers only if it adds
  optional fields; a breaking field change requires a new `format` value or
  a documented migration, not a silent shape change under `version: 1`.

## 2. `published/archive-publication.json` — the public record

Written once by `archive:init`, read (never modified) by `archive:publish`.
This is the file a reader copies identifiers out of.

```jsonc
{
  "format": "org.road-to-devcon.archive-publication",
  "version": 1,
  "feed": {
    "owner": "0x<20-byte-address>",   // EIP-55 checksummed
    "topic": "master-of-all",       // human-readable, hashed via Topic.fromString
    "manifestReference": "<64-hex>"   // the feed manifest reference
  },
  "initializationBatchId": "<64-hex>",
  "archiveAddress": "bzz://<manifestReference>/",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "recovery": {
    "inputOptions": ["archiveAddress/feed.manifestReference", "feed.owner + feed.topic"],
    "collectionEndpointFamily": "bzz",
    "addressGrammar": "bzz://<feed-manifest-reference>/"
  }
}
```

`archiveAddress` is exactly what the publisher UI labels **"Share this
stable archive address."** It is derived once from `feed.manifestReference`
and never recomputed from a release. See `packages/swarm-publisher/src/publish-flow.ts`
(`runInit`) for where this file is produced, and
`packages/swarm-publisher/src/publication-record.ts` for the fail-closed
check that refuses to overwrite it with a different owner/topic later.

## 3. `published/releases/<releaseId>.json` — per-release receipt (audit only)

Written after every successful publish
(`packages/swarm-publisher/src/receipts.ts`). Contains no secret, and is
**never** read back as a source of truth for a later health check — the
storage-health card always re-reads the node live (see
`docs/STORAGE-TRUTH.md`).

```jsonc
{
  "format": "org.road-to-devcon.archive-release-receipt",
  "version": 1,
  "releaseId": "...",
  "feedManifestReference": "<64-hex>",
  "collectionReference": "<64-hex>",
  "feedIndex": "1",
  "batchId": "<64-hex>",
  "immutableObservedAt": "2026-01-01T00:00:00.000Z",
  "batchDurationObservedAt": "2026-01-01T00:00:00.000Z",
  "batchDurationSeconds": 2592000,
  "publishedAt": "2026-01-01T00:00:00.000Z",
  "fileCount": 42,
  "totalSizeBytes": 123456789
}
```

## Public identifiers vs. secrets

Everything in all three formats above is safe to commit and safe to hand to
a stranger. The one value that must never appear in any of them, or in any
other tracked file, is the feed-owner **private key** — see
`docs/THREAT-MODEL.md` and the `.gitignore` / secret-scan setup in
`scripts/secret-scan.mjs`.
