# Architecture

## Trust boundary

```text
Tsering's browser (publisher UI)
  │  fetch, same-origin only
  ▼
apps/archive-publisher/src/server   ── loopback only (127.0.0.1) ──┐
  │  reads ARCHIVE_FEED_PRIVATE_KEY from env/ignored file          │
  │  never sends it to the browser                                 │
  ▼                                                                 │
packages/swarm-publisher  ──(bee-js 13.1.0)──►  Bee node  ◄─────────┘
  │  uploadFromDirectory, feed.createManifest,
  │  feed.makeWriter().uploadReference, stamp.get/getAll
  ▼
published/archive-publication.json  (committed, public-only)
  { feed: { owner, topic, manifestReference }, archiveAddress, ... }
                        │
                        │  handed to a stranger — no other channel
                        ▼
apps/archive-recover (CLI or browser SPA)
  │  packages/swarm-recovery (read-only bee-js adapter)
  ▼
Bee / content-gateway endpoint ──► collection ──► archive-release.json + files
```

The publisher and the recovery reader share exactly one thing: the public
identifiers in `published/archive-publication.json` (or the `archiveAddress`
string copied out of it). They do not share code paths that touch secrets,
they do not share a database, and they do not share process state.
`apps/archive-recover` cannot import `apps/archive-publisher` or
`packages/swarm-publisher` — this is enforced by
`apps/archive-recover/test/import-boundary.test.ts`, which statically scans
every source file for forbidden import specifiers and fails the build if one
appears.

## Why a feed, not a bare upload reference

A Swarm collection upload returns a content-addressed reference: hand it out,
and it is permanently tied to those exact bytes. Publish a corrected v2 and
the address a stranger was given now resolves to the *old*, wrong content —
there is no way to point the same address at new bytes, because the address
*is* a hash of the bytes.

A **feed** breaks that coupling. A feed is identified by `(owner, topic)` —
not by content — and its "current value" is a small, signed record telling
readers which content reference to fetch right now. The **feed manifest**
(`feed.createManifest`) is a stable Swarm reference that, when resolved
through `/bzz/<manifestRef>/...`, transparently follows the feed to whatever
collection reference is *currently* published. That manifest reference is
`archiveAddress` — the only address the publisher UI labels "share this."

```text
archiveAddress (feed manifest, NEVER changes)
   │
   ▼ resolves via (owner, topic) feed lookup, live, on every request
current feed value → collection reference (changes on every release)
   │
   ▼
archive-release.json + every listed file
```

Concretely:

- `packages/swarm-publisher/src/feed.ts` — `createFeedManifest` (init, once),
  `readCurrentFeed` (live read, guarded for the empty-feed case),
  `advanceFeedWithVerification` (resolve next index live → write → read back
  and confirm).
- `packages/swarm-recovery/src/resolve.ts` — the same feed indirection from
  the reader's side: either follow the manifest reference through `/bzz`
  transparently, or construct a real `FeedReader` from owner+topic and read
  the current value directly.

## Release format and the collection/feed split

Every release is a directory (a Swarm *collection*) containing every
selected file plus a root `archive-release.json` inventory (schema in
`docs/FORMAT.md`). The collection is uploaded first
(`bee.collection.uploadFromDirectory`); *its resulting reference* — not the
file bytes — is what gets written to the feed
(`writer.uploadReference(batchId, collectionReference, { index })`). The feed
never carries payload bytes directly; see `packages/swarm-publisher/src/upload.ts`
and `src/feed.ts`.

## Process boundaries

| Component | Runs where | Touches the network | Touches secrets |
| --- | --- | --- | --- |
| `apps/archive-publisher` web UI | Browser | No — only calls its own loopback API | No |
| `apps/archive-publisher` server | Node, bound to `127.0.0.1` | Yes (Bee node) | Yes — the only place `ARCHIVE_FEED_PRIVATE_KEY` is read |
| `apps/archive-publisher` CLI | Node, operator's terminal | Yes | Yes |
| `apps/archive-recover` web UI | Browser (any machine) | Yes — directly to the Bee/gateway endpoint the person supplies | No |
| `apps/archive-recover` CLI | Node, anyone's terminal | Yes | No |

The recovery web UI talks to Swarm directly from the browser (bee-js's
download path is isomorphic) — it does not proxy through the publisher's
server, and it does not need to, because recovery never needs a private key.

## State machine

`packages/swarm-publisher/src/types.ts` (`PublisherState`) and
`packages/swarm-publisher/src/preflight.ts` / `feed.ts` implement the named
states from the PRD's state table: `node-unavailable`,
`ultra-light-or-unfunded`, `batch-not-immutable`, `ready`, `batch-warning`,
`uploading-release`, `advancing-feed`, `verifying`, `published`,
`uploaded-not-published`. No fixed timeout ever promotes a state to
`published` — only an independent feed read-back that resolves to the
submitted collection reference does that (`advanceFeedWithVerification`).
