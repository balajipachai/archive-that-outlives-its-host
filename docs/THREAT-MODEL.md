# Threat model

## Assets

| Asset | Where it lives | Sensitivity |
| --- | --- | --- |
| Feed-owner private key | `ARCHIVE_FEED_PRIVATE_KEY` env var, or a file named by `ARCHIVE_FEED_KEY_FILE` | Secret. Anyone who has it can redirect the feed. |
| Local operator token | `LOCAL_OPERATOR_TOKEN` env var | Secret, but low value — loopback-only, single machine. |
| Feed owner address, topic, manifest reference, batch IDs | `published/archive-publication.json`, release receipts | Public by design — safe and *intended* to be handed to a stranger. |
| Archive content (folio scans) | Swarm network, referenced by the collection | Public by design. This is not an encrypted-storage product — see README limitations. |

## Actors and boundaries (from PRD §3)

- **Tsering / publisher** — controls the signing key, the local machine, and
  batch selection. Cannot accidentally leak the key to the browser: the key
  is read only inside `packages/swarm-publisher` (Node), never sent over the
  publisher's own HTTP API, and never appears in the React bundle
  (`apps/archive-publisher/src/web` never imports `@archive/swarm-publisher`
  or `@ethersphere/bee-js`'s signing surface — it only calls its own
  loopback JSON API over `fetch`).
- **Reader / stranger** — holds only public identifiers and an endpoint.
  Structurally cannot reach the publisher's key, disk, or batch selection —
  enforced by the import-boundary test
  (`apps/archive-recover/test/import-boundary.test.ts`).
- **Bee node** — trusted for storage and retrieval, *not* trusted as proof
  of indefinite preservation (see `docs/STORAGE-TRUTH.md`).
- **Malicious/malformed archive content** — see "Malformed or hostile
  content" below.

## Key compromise

**Impact.** Whoever holds the feed-owner private key can publish a new feed
update at any time, redirecting every future reader of `archiveAddress` to
different content. They cannot rewrite history (any reader who already has a
specific collection reference, or read the feed at a specific index, still
has that exact content) but they own *the address's future*.

**Mitigations in this repo:**

- The key is read once, server-side, from an ignored `.env` value or an
  ignored key file (`packages/swarm-publisher/src/keys.ts`). It is never
  logged, never included in any HTTP response, and never written to
  `state/pending-publish.json` or any receipt.
- `.gitignore` excludes `.env*` (except `.env.example`), `*.key`, `*.pem`,
  and any `secrets/` directory.
- `scripts/secret-scan.mjs` scans every git-tracked file for hex-64
  sequences (outside the `published/` allowlist, where they are known
  public identifiers), mnemonic-shaped phrases, gift-code patterns, PEM
  blocks, and authenticated URLs, and fails the build if any are found.
- The publisher UI states the residual risk plainly (PRD §3): *"anyone with
  the feed signing key can redirect future readers until a different
  continuity arrangement is adopted."* This app does not attempt multi-party
  governance over the feed key — that is explicitly out of scope (see
  README limitations; challenge 3's concern).

**What is not mitigated, on purpose:** key backup, rotation, and succession
are operational procedures for Tsering to handle outside this repository
(e.g., a physical backup of the key material). No key backup mechanism is
built into or committed to this repo.

## Batch lapse

**Impact.** If the postage batch's paid duration expires and is not renewed,
the network may garbage-collect the content. The feed manifest and any
recovery attempt would then resolve to nothing.

**Mitigations:** `docs/STORAGE-TRUTH.md` — live duration reads, a
configurable warning threshold, and UI copy that never claims permanence.
This app cannot prevent a lapse it doesn't control; it can only make the
risk visible and actionable (prompt renewal via Swarm Desktop).

## Endpoint outage

**Impact.** If the configured Bee/gateway endpoint is unreachable, neither
publish nor recovery can proceed.

**Mitigations:** Preflight distinguishes `node-unavailable` from every other
failure mode (`packages/swarm-publisher/src/preflight.ts`); the recovery
path distinguishes `EndpointUnreachableError` the same way
(`packages/swarm-recovery/src/recover.ts`). Bounded exponential backoff with
jitter is used for feed *read* retries during an ambiguous write outcome
(`advanceFeedWithVerification` in `packages/swarm-publisher/src/feed.ts`) —
never a blind retry of a write whose real network outcome hasn't been
checked first.

## Malformed or hostile content

**Impact.** A manifest could claim paths that escape the output directory, a
file could be relabeled with a misleading content type, or downloaded HTML
could be opened as if it were trusted UI.

**Mitigations:**

- **Path traversal.** Every path is validated at write time
  (`packages/archive-format/src/paths.ts`,
  `release-builder.ts`) and again at read time
  (`packages/archive-format/src/paths-node.ts` → `safeJoin`, used by
  `packages/swarm-recovery/src/download.ts`). Absolute paths, `..`
  segments, and empty segments are rejected before any file touches disk on
  either side.
- **Symlinks.** The release builder's directory walk
  (`packages/archive-format/src/release-builder.ts`, `walkFiles`) never
  follows symlinks, in either direction.
- **Hash verification.** Every file's SHA-256 is checked against the
  manifest on both the publisher's own post-upload self-check
  (`packages/swarm-publisher/src/verify.ts`) and the recovery reader
  (`packages/swarm-recovery/src/download.ts`,
  `apps/archive-recover/src/web/lib/browser-recover.ts`). A mismatch is a
  hard failure (`HashMismatchError`), never a warning.
- **Content is never executed.** The recovery reader treats every file as
  inert bytes to save, never as markup to render. `packages/archive-format/src/mime.ts`
  maintains an explicit allowlist of content types safe to render inline
  (`isSafeToRenderInline`); HTML and SVG are deliberately excluded because
  they can carry script.
- **Schema validation.** `archive-release.json` is parsed through a strict
  zod schema (`packages/archive-format/src/schema.ts`) before any of its
  contents are trusted — malformed JSON or a schema violation is reported as
  `MalformedManifestError`/`MalformedManifestError`, distinct from a missing
  file or a hash mismatch.

## Local server abuse

**Impact.** The publisher's Node service holds the only code path capable of
spending the operator's postage and advancing the feed. If it were reachable
from the network, or from another site's script running in the operator's
browser, it would become an unauthenticated remote-write primitive.

**Mitigations (PRD §10):**

- The server binds to `127.0.0.1` only, never `0.0.0.0`
  (`apps/archive-publisher/src/server/index.ts`).
- It refuses to start at all without `LOCAL_OPERATOR_TOKEN` configured.
- Every state-changing route requires, in order: an allowed loopback Origin
  header, a valid HttpOnly/SameSite=Strict session cookie, and a CSRF token
  supplied out-of-band (never itself a cookie, so a cross-site request can't
  replay it) — see `apps/archive-publisher/src/server/middleware.ts`.
  Enforced with tests for all four states (missing session, bad Origin,
  missing/invalid CSRF, success) in
  `apps/archive-publisher/test/server/auth.test.ts`.
- Read-only status/recovery routes (`/api/status`, `/api/batches`,
  `/api/publication-record`, `/api/publish/progress`, `/api/recover-test`)
  are intentionally credential-free — they touch no secret and mutate
  nothing.
- The operator's raw token is never echoed back in any response; only a
  session-scoped CSRF token is returned.

## Explicitly out of scope

- Encryption or access control on the archive content — this is a public
  archive, and the README says so plainly.
- Multi-party governance of the feed key (succession, threshold signing) —
  that is the stated concern of a different, later exercise; this repo does
  not attempt it.
- Guaranteed availability/insurance beyond what the batch itself buys.
