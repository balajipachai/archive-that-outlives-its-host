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

Individually runnable CLI contract (all four commands exist and work,
verified against no live node to show truthful degraded states):

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
| 2 | Owner + topic in a tracked file | `published/archive-publication.json` schema: `packages/archive-format/src/{types.ts,schema.ts}`; written by `runInit` (`packages/swarm-publisher/src/publish-flow.ts`) | `packages/archive-format/test/schema.test.ts`. **Status: schema/writer code complete and tested; the actual file is not yet committed in this checkout — see "Outstanding" below.** |
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

## Outstanding — needs one live run against a funded Bee node

This sandboxed environment has no funded Bee node and no way to redeem a
Swarm gift code (that is an inherently manual, one-machine, one-person step
via the Swarm Desktop GUI — not something that can be scripted or delegated
here, and not something this session had credentials for). As a result:

1. **`published/archive-publication.json` is not committed yet.** Per PRD
   §4.1, a template or runtime-only value does not satisfy this
   requirement, and this repo does not fabricate a fake owner address —
   doing so would be exactly the kind of dishonest placeholder the PRD's own
   design philosophy argues against. Run `pnpm archive:init` (see
   `docs/DEMO.md` step 2) once a funded node is available, then commit the
   resulting file. Rubric check 2 will not pass until that happens.
2. **The live/demo verification in PRD §12** (publish v1 → v2 → delete
   state → recover v2 via a separate process) has a fully written script
   (`docs/DEMO.md`) and every function it calls is unit-tested against the
   real SDK shapes, but has not been run end-to-end against genuine network
   I/O in this session.
3. **A `batch-not-immutable` demonstration against a real mutable batch** —
   the invariant is enforced in code and covered by a mocked test
   (`packages/swarm-publisher/test/publish-flow.test.ts`), but has not been
   exercised against an actual node-created mutable batch.

None of this is a design gap — every function involved has explicit,
independently-reviewable tests against the real library's documented
call/return shapes. It's a one-time manual setup step (Swarm Desktop + gift
code redemption) that only the person holding that gift code can perform.

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
