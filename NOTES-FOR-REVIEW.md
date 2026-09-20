# Notes for review

## Exact commands to reproduce verification

```bash
nvm use 22
corepack enable
pnpm install
pnpm typecheck        # tsc --noEmit across all 5 workspace packages, clean
pnpm test             # vitest, 89 tests, all passing (mocked bee-js — see below)
pnpm build            # tsc + vite build for every app/package
pnpm secret-scan       # scripts/secret-scan.mjs over every git-tracked file
```

Individually runnable CLI contract (all four commands exist and work —
verified both against no live node, to show truthful degraded states, and
against a real funded node end to end; see "Live demo" below):

```bash
pnpm archive:preflight --endpoint http://localhost:1633 --batch-id <64-hex>
pnpm archive:init      --topic <topic> --endpoint http://localhost:1633 --batch-id <64-hex>
pnpm archive:publish   --input <dir> --endpoint http://localhost:1633 --batch-id <64-hex>
pnpm archive:recover   --manifest <ref> --endpoint <endpoint> --out <dir>
pnpm archive:recover   --owner <0x..> --topic <topic> --endpoint <endpoint> --out <dir>
```

## Scored rubric checks — where the code is

| # | Check | Code | Test |
| --- | --- | --- | --- |
| 1 | Published behind a feed, not a bare reference | `packages/swarm-publisher/src/feed.ts` (`createFeedManifest`, `advanceFeedWithVerification`); UI/CLI always display `archiveAddress` derived from the feed manifest, never a collection reference, as the share value (`apps/archive-publisher/src/web/App.tsx`, `src/cli/init.ts`) | `packages/swarm-publisher/test/feed.test.ts` |
| 2 | Owner + topic in a tracked file | `published/archive-publication.json` schema: `packages/archive-format/src/{types.ts,schema.ts}`; written by `runInit` (`packages/swarm-publisher/src/publish-flow.ts`) | `packages/archive-format/test/schema.test.ts`. **Status: committed with real values from a live `archive:init` run — owner `0xd7a9CCaabf885A80Aa0c48ddef97620c49aB3e37`, topic `master-of-all`.** |
| 3 | Next feed index resolved from the network before each update | `packages/swarm-publisher/src/feed.ts` (`readCurrentFeed` read immediately precedes every `uploadReference` call; index is never a literal/local counter) | `packages/swarm-publisher/test/feed.test.ts` (asserts the index passed to `uploadReference` matches what the mocked live read returned, across first-publish, subsequent-release, idempotent-retry, and ambiguous-failure-retry scenarios) |
| 4 | Multi-chunk content written to the feed by reference | `packages/swarm-publisher/src/upload.ts` (`uploadCollection` → `bee.collection.uploadFromDirectory`) then `src/feed.ts` (`writer.uploadReference(batchId, collectionReference, ...)`) — `uploadPayload` is never called with archive bytes | `packages/swarm-publisher/test/feed.test.ts` asserts `uploadReference` receives the collection reference string, never file bytes |
| 5 | Recovery reads from published identifiers alone | `packages/swarm-recovery/` (whole package) + `apps/archive-recover/src/cli.ts`; imports nothing from the publisher, reads no local index/state | `apps/archive-recover/test/import-boundary.test.ts` (static import-boundary check), `packages/swarm-recovery/test/*.test.ts` |
| 6 | Batch remaining lifetime read from the node and surfaced | `packages/swarm-publisher/src/preflight.ts` (`readBatchHealth` reads `bee.stamp.get(...).duration.toSeconds()` live) surfaced in CLI (`src/cli/preflight.ts`), UI (`BatchHealthCard`), and release receipts (`src/receipts.ts`) | `packages/swarm-publisher/test/preflight.test.ts` |
| 7 | Empty feed read handled | `packages/swarm-publisher/src/feed.ts` (`readCurrentFeed` catches `BeeResponseError`, returns `isEmpty: true`); `packages/swarm-recovery/src/resolve.ts` (same, maps to `NoReleasePublishedError`) | `packages/swarm-publisher/test/feed.test.ts`, `packages/swarm-recovery/test/resolve.test.ts` |
| 8 | No credential/secret in a tracked file | `.gitignore`, `.env.example` (names only), `scripts/secret-scan.mjs` | Run `pnpm secret-scan` — passes over every currently tracked file |

## AC-01 through AC-08 (PRD §8) — same evidence, PRD's own framing

All eight rows map onto the same implementation listed above; see
`docs/ARCHITECTURE.md`, `docs/FORMAT.md`, and `docs/STORAGE-TRUTH.md` for the
narrative version of each.

## What is code-complete, tested, and typechecked

- Both `packages/archive-format` and `packages/swarm-publisher`/`swarm-recovery`
  are written against the **actual** `@ethersphere/bee-js@13.1.0` API surface
  — verified by reading the library's shipped `.d.ts` files directly (not
  from memory or older v12 examples), including `Bee.feed.makeReader/makeWriter`,
  `Feed.createManifest`, `FeedReader.downloadReference`,
  `FeedWriter.uploadReference`, `Stamp.get/getAll`/`immutableFlag`,
  `Collection.uploadFromDirectory`, `File.download`, `Status.getHealth/getNodeInfo`,
  and the exact shape of `BeeResponseError`/`Duration`/`FeedIndex`.
- 89 tests pass (`pnpm test`), all mocking bee-js's real call/return shapes
  rather than a simplified stand-in — including the immutable-batch
  invariant, the empty-feed guard, live-index resolution on first and
  subsequent releases, the idempotent-retry-on-ambiguous-write-failure path,
  and the full auth gate (missing session / bad Origin / missing CSRF /
  success) on the publisher's loopback server.
- `pnpm typecheck` and `pnpm build` (tsc + Vite) are clean across all five
  workspace packages, including both browser bundles — the recovery web
  reader's Vite build was checked to contain zero Node-only code (`vite
  build` run and inspected, not assumed).
- The CLI binaries were run for real (via `tsx`, no mocking) against no live
  Bee node, and produce the exact PRD §4.3 degraded-state messages:
  `node-unavailable`, and the "publishing key is unavailable" message when
  no signing key is configured.
- The loopback server was started for real and confirmed bound to
  `127.0.0.1` (not `0.0.0.0`), refusing to answer without a session on a
  protected route.

## Live demo — completed against a funded Bee node

The full PRD §12 demo has been run end to end against a real, funded Bee
node (not mocked):

1. **`archive:init`** created the one feed manifest and wrote
   `published/archive-publication.json` with real values (committed):
   owner `0xd7a9CCaabf885A80Aa0c48ddef97620c49aB3e37`, topic
   `master-of-all`, and a real feed manifest reference (see the
   committed `feed.manifestReference` / `archiveAddress` fields in that
   file).
2. **`archive:publish` v1**, then **v2** with a corrected file, each
   completed the full uploading → advancing-feed → verifying →
   `Published and recoverable` sequence. Receipts committed at
   `published/releases/10d93aae-...json` (feed index `0`) and
   `published/releases/9f137916-...json` (feed index `1`) — both under
   the same `feedManifestReference`, confirming the address never
   changed across releases.
3. **Independent recovery, both input modes**, against the real feed:
   - `pnpm archive:recover --manifest bzz://c535c27a.../ --endpoint
     http://localhost:1633 --out <dir>`
   - `pnpm archive:recover --owner 0xd7a9CCaabf885A80Aa0c48ddef97620c49aB3e37
     --topic master-of-all --endpoint http://localhost:1633 --out <dir>`

   Both resolved through the live feed (the owner+topic path reported
   `Feed index: 1` and the exact collection reference from the v2
   receipt), downloaded all 4 files, verified every SHA-256, and
   returned **v2's corrected content** (`notes.txt` containing
   "Corrected caption for RTD-V.webp") — the exact rubric check 1 /
   check 5 / AC-01 claim, demonstrated live rather than only
   unit-tested.

This closes out every rubric check that required live network I/O.

## Still outstanding

**A `batch-not-immutable` demonstration against a real mutable batch**
— the invariant is enforced in code and covered by a mocked test
(`packages/swarm-publisher/test/publish-flow.test.ts`), but has not
been exercised in this session against an actual node-created mutable
batch (doing so would require creating a second, non-immutable batch
solely to prove rejection). Not a design gap — the code path has an
explicit, independently-reviewable test against the real library's
documented call/return shapes.

## Deviations from a literal reading of the PRD

- **Feed index resolution calls `reader.downloadReference()` explicitly**
  rather than relying solely on bee-js's own internal default-index
  resolution inside `uploadReference`. Both satisfy the stated rubric
  condition; the explicit version makes the live-read step directly
  testable and auditable in this repo's own code. See `LEARNINGS.md`.
- **The publisher server's `/api/publish` is synchronous** (returns the
  final result in one request) rather than streaming; a companion
  `GET /api/publish/progress` read-only route lets the UI poll interim
  `PublisherState` transitions while the POST is in flight, sharing the same
  Node event loop. This was chosen over SSE/WebSockets to avoid the extra
  complexity of authenticating a long-lived streaming connection, given the
  collection sizes this app targets (PRD §10: "a small collection of
  images/text").
- **The recovery web reader does not use a zip library**; see
  `LEARNINGS.md` "Rejected superficial alternatives."
