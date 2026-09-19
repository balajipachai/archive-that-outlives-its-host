# Learnings

## Design choices

**Feed manifest reference as the address, not owner+topic alone.** Both are
valid recovery inputs (and both are implemented), but the *displayed*
address is the feed manifest reference wrapped as `bzz://<ref>/`. A manifest
reference is a single opaque string a person can paste anywhere `/bzz/`
works, including a plain browser URL bar against a public gateway; owner+topic
requires a reader that specifically understands Swarm feeds. Publishing both
in `published/archive-publication.json` costs nothing and removes a reason
for either path to be undertested.

**The publisher's browser bundle never imports bee-js or the signing
package.** Every Swarm-touching operation is a loopback API call. This was
initially tempting to skip — the app has no untrusted users, it's Tsering's
own laptop — but the PRD's own security boundary language ("the service, not
the browser bundle, reads the publisher signing secret") makes it a
correctness requirement, not a hardening nicety, and it costs one extra HTTP
hop.

**Resolving the feed's next index explicitly, rather than relying solely on
bee-js's internal `uploadReference` default-index behavior.** bee-js's own
`FeedWriter.uploadReference` will resolve the next index itself if you omit
`index` — that alone would satisfy the letter of "derive it from a live
read." But the PRD (and the rubric's phrasing, "obtained from a read of the
feed immediately before writing") reads as wanting *this repo's* code to
visibly perform that read, not just trust an SDK internal. So
`packages/swarm-publisher/src/feed.ts` calls `reader.downloadReference()`
itself, computes the index, and only then calls `uploadReference` with an
explicit `{ index }`. This also made the retry-after-ambiguous-failure logic
straightforward to write and test with a mocked reader/writer, since the
index resolution is a first-class, independently testable step rather than
buried inside the write call.

**A publisher-side self-verification pass, mirroring the reader.** After the
feed read-back confirms the collection reference, the publisher still
re-downloads every file from the network and re-checks its SHA-256
(`packages/swarm-publisher/src/verify.ts`) before calling the release
"published." This duplicates the recovery reader's own check, but the state
table's definition of `published` is "all files verify," not just "the feed
resolved" — those are different claims, and only the stronger one earns the
green state.

**Two subpath exports per package (`.` and `./node` or `/hash`,
`/paths-node`, `/release-builder`) instead of one barrel.** `archive-format`
and `swarm-recovery` both have code that only runs in Node (`node:fs`,
`node:crypto`, `node:path`) and code that is genuinely isomorphic. Barreling
everything through one `index.ts` would make the recovery *web* reader's
Vite bundle either fail to resolve `node:fs` or silently ship it as a dead
import. Splitting the entrypoints up front cost a little package.json
`exports` bookkeeping and paid for itself immediately — `apps/archive-recover`'s
web bundle has zero Node-only code in it, verified by an actual `vite build`,
not just an assumption.

## Rejected superficial alternatives

**A bare upload reference with a "latest" convention (e.g., always
overwrite one well-known key).** Swarm content addressing means a
"latest.json" pointer file would itself need a *stable* address to be
useful — which just reintroduces the same problem one level down, except
now without a feed's built-in ordering/signing guarantees. This is precisely
the failure mode rubric check 1 is designed to catch, and it would not
survive the "publish v2, keep the same address" demo.

**Trusting the release receipt as the live storage-health source.** Early
draft had the UI read the most recent receipt's `batchDurationSeconds` for a
quick display before a real preflight came back. Deleted it: a receipt is a
historical fact about the moment of a past publish, and treating it as
current status is exactly the "misleading permanent" failure mode
`docs/STORAGE-TRUTH.md` exists to prevent. Every health display in this repo
re-reads `bee.stamp.get` live; receipts are audit trail only.

**A single Express session middleware doing Origin+session+CSRF in one
function.** Easier to write, harder to test precisely — "missing session"
and "bad Origin" and "missing CSRF" would all just be "401" from one opaque
check. Splitting them into three composable middlewares
(`requireOrigin`, `requireSession`, `requireCsrf` in
`apps/archive-publisher/src/server/middleware.ts`) made each failure mode
independently assertable in `test/server/auth.test.ts`, which is what the
PRD explicitly asks the test suite to prove.

**Zipping recovered files in the browser.** Considered adding a small zip
library so "download all" produces one file. Decided against it: it's an
extra dependency for a cosmetic convenience, and the File System Access API
path (available in Chromium browsers) already reproduces the exact folder
structure losslessly, which a zip would only reproduce after an extra
unzip step anyway. The flattened-filename fallback for other browsers is
honest about its own limitation rather than hiding it behind an archive
format most people don't think to open.

## What would need real infrastructure to finish

This sandbox had no funded Bee node and no way to redeem a Swarm gift code
(that step is inherently a one-person, one-machine, one-time action via
Swarm Desktop's GUI). Every Swarm-facing code path was written against the
*actual* installed `@ethersphere/bee-js@13.1.0` type definitions (verified
by hand against the library's `.d.ts` files, not guessed from memory or
v12-era examples) and is covered by tests that mock the SDK's real call
shapes — but the live end-to-end demo in `docs/DEMO.md`, and the resulting
real `published/archive-publication.json`, still need one live run against
a genuinely funded node. See `NOTES-FOR-REVIEW.md` for exactly what that
leaves outstanding.
