# PRD — Archive That Outlives Its Host

**Status:** Implementation source of truth  
**Input specification:** [`Implementations.md`](./Implementations.md)  
**Shared quality bar:** [`../JUDGMENT_HARDENING.md`](../JUDGMENT_HARDENING.md)  
**Implementation boundary:** this challenge directory only

## 1. Product outcome

Tsering needs a public digital archive that does not disappear when a grant,
cloud account, laptop, or the publishing application disappears. The product is
a local-first publishing console for a small collection of folio scans and a
separate recovery reader. The publisher creates immutable releases on Swarm,
then points one stable **archive address** at the latest release through a
Swarm feed. A stranger can use only that published address (or its public feed
owner and topic) and a Bee endpoint to recover every file.

The primary demonstration is deliberately stronger than “an upload returned a
hash”: publish a first release, publish a corrected second release, remove the
publisher's local state, and recover the current release in a separate reader.
The address shared with the stranger remains unchanged.

### Story-specific judgment call

The problem is not only durable bytes; it is **durable discovery plus honest
maintenance information**. A bare immutable reference changes after each
release, while a claim that content is “permanent” hides the real postage-batch
expiry risk. The feed is therefore load-bearing for continuity, and the
node-reported batch lifetime is a first-class product status. A static upload
hash, a local index, or an expiry value invented in code is a failed design even
if a demo download succeeds.

### In scope

- A polished local web publishing console backed by a local Node/TypeScript
  service that talks to a funded Bee node.
- Versioned, immutable multi-file archive releases and a stable feed manifest
  that resolves to the latest release.
- A separately buildable/runnable recovery reader (web form plus CLI is
  preferred; the CLI is mandatory) with no publisher-state dependency.
- Actual network preflight, batch-health display, release verification, and
  recovery verification.
- Clear public identifiers, operator runbooks, tests, and reviewer evidence.

### Out of scope and honest limitations

- This is a public-access archive, not encrypted or access-controlled storage.
  Do not upload source material that must remain private.
- A feed owner key can update its feed; it is not a multi-party governance
  solution. Key succession is intentionally the concern of challenge 3.
- Swarm postage is paid storage, not a promise of eternal availability. The app
  can report node facts and prompt renewal; it cannot guarantee a precise
  deletion date or independently insure the data.
- The app must not turn a local Bee API into a public upload service. Bind its
  server to loopback and treat a public content gateway separately.

## 2. Locked technical decisions

| Area | Decision |
| --- | --- |
| Runtime | Node.js 22 LTS (minimum 20.12) and TypeScript with strict checking. |
| Swarm SDK | Pin `@ethersphere/bee-js` **`13.1.0`** exactly (no floating range) in both manifest and lockfile. The only SDK adapter uses v13 `collection.uploadFromDirectory`/`uploadFromFileList`, `feed.makeReader`/`makeWriter`, `feed.createManifest`, `FeedWriter.uploadReference`, `FeedReader.download`, `file.download`, `stamp.get`, and `stamp.getAll` after verifying their 13.1.0 signatures; do not copy deprecated v12 flat-method examples. Every canonical write receives the one effective `batchId` explicitly; SDK defaults/latest-batch selection are prohibited. |
| Publisher surface | A local React/TypeScript web UI and loopback-only Node service. The service, not the browser bundle, reads the publisher signing secret. |
| Recovery surface | `apps/archive-recover` is independently runnable and has a CLI entrypoint. It may use only `packages/archive-format` and its own Swarm adapter—never publisher storage, code, credentials, or a shared database. |
| Stable address | The user-facing address is the immutable **feed manifest reference**. It resolves via the feed owner + topic and remains stable while releases change. It is never the current release reference. |
| Archive release | A directory/collection containing `archive-release.json` and every selected file. The feed payload is the collection reference, not archive bytes. |
| Public record | `published/archive-publication.json` is committed after initialization and contains copyable public owner, topic, and feed manifest reference. It contains no private key or authenticated endpoint. |
| Source of truth | The network feed is the only source of the next feed index and current release. The recovery reader may write recovered files to an output directory, but never uses a local state/index file to discover content. The required `--batch-id` is the sole canonical-write batch selection for one command/UI operation. |

## 3. Actors, assets, and trust boundaries

| Actor | Holds or controls | Can do | Must not be able to do | Enforcement |
| --- | --- | --- | --- | --- |
| Tsering / publisher | Local Bee endpoint, selected batch, feed-owner private key supplied at runtime | Upload a release and advance the feed | Accidentally publish a release without seeing its real storage status; expose the private key in a browser bundle or tracked file | Server-only secret loading, preflight, confirmation screen, secret scan |
| Reader / stranger | A feed-manifest reference **or** public owner + topic, and any Bee/content endpoint | Resolve and download the latest public collection | Need the publisher's disk, account, batch ID, or private key | Standalone reader contract and clean-room integration test |
| Bee node | Node wallet and postage batch | Report readiness, store/releases, report batch details | Be treated as proof of indefinite preservation | Live status/TTL read and explicit limitation copy |
| Malicious/malformed archive content | A public collection reference | Be downloaded as inert bytes | Escape the recovery output directory, execute automatically, or silently masquerade as a valid release | Strict schema/path validation, hash verification, safe filename handling |

**Security boundary:** the signing private key is the only secret necessary to
advance the feed. It is read only from an ignored environment file, OS secret
store, or an ignored local key path. A public owner address, topic, feed
manifest reference, content reference, batch ID, and feed index are safe to
commit as evidence. The publisher must display the residual risk: anyone with
the feed signing key can redirect future readers until a different continuity
arrangement is adopted.

## 4. Domain model and invariants

### 4.1 Public publication record

After the first successful publish, commit this file with real, public values;
a template or runtime-only values do not meet the requirement.

```json
{
  "format": "org.road-to-devcon.archive-publication",
  "version": 1,
  "feed": {
    "owner": "0x<public-feed-owner-address>",
    "topic": "spiti-folios-v1",
    "manifestReference": "<64-hex-feed-manifest-reference>"
  },
  "initializationBatchId": "<64-hex-public-batch-id>",
  "archiveAddress": "bzz://<64-hex-feed-manifest-reference>/",
  "createdAt": "<ISO-8601 timestamp>",
  "recovery": {
    "inputOptions": ["archiveAddress/feed.manifestReference", "feed.owner + feed.topic"],
    "collectionEndpointFamily": "bzz",
    "addressGrammar": "bzz://<feed-manifest-reference>/"
  }
}
```

`archiveAddress` is the exact value the UI labels **Share this stable archive
address**. The UI may show the current immutable release reference as a
secondary audit detail only; it must never present it as the replacement for the
stable archive address.

### 4.1a Feed-key lifecycle and crash-safe operation journal

Use one explicit lifecycle; do not silently generate a new publishing identity
on an update:

1. `ARCHIVE_FEED_PRIVATE_KEY` is supplied from an ignored local secret store,
   ignored key file, or OS secret manager. `archive:init` derives its public
   owner address before any network call.
2. On a fresh setup, `archive:init --topic … --batch-id …` creates the one feed manifest,
   atomically writes a public-only `published/archive-publication.json` (write
   temporary file, fsync, rename), and asks the operator to commit that file
   after a live read-back. The final submitted file must contain real values.
3. On an existing setup, `archive:init` and `archive:publish` load that public
   record and fail closed if its owner/topic/manifest does not match the
   derived key and requested configuration. They must not replace the manifest
   or topic merely because a key is missing or different.
4. A missing signing key produces “The archive's publishing key is unavailable;
   recovery reading still works” and cannot advance the feed. Key backup and
   rotation/succession procedures are documented outside the repository; no
   key backup is ever committed.

Maintain an ignored, atomically written `state/pending-publish.json` while a
release is in progress. It contains only non-secret operation metadata:
release ID, effective batch ID, collection reference, expected/current feed index, stage, and
timestamps. It is a **resume aid**, never a recovery/discovery index. On
restart, the publisher first reads the live feed: if it already resolves to the
recorded collection it completes idempotently; otherwise it resolves a fresh
network index before retrying the feed update. Delete the journal only after
the independent read-back succeeds.

### 4.2 Immutable release format

Every collection contains a root `archive-release.json` before upload:

```ts
type ArchiveReleaseV1 = {
  format: 'org.road-to-devcon.archive-release'
  version: 1
  releaseId: string                 // UUID or deterministic content-independent ID
  title: string
  publishedAt: string               // ISO-8601
  files: Array<{
    path: string                    // normalized relative POSIX path
    contentType: string
    sizeBytes: number
    sha256: string
    description?: string
  }>
}
```

Rules:

- Reject absolute paths, `..`, empty names, duplicate normalized paths, files
  outside the chosen input directory, and an empty collection.
- Preserve paths and MIME types in the uploaded collection. Set practical,
  documented per-file and total-size limits; show validation errors before an
  upload begins.
- The release manifest inventories every file and its hash. Recovery fetches
  this manifest from the collection and verifies every listed file before
  reporting success.
- The release manifest contains no private data beyond what Tsering explicitly
  chose to publish. `title` and descriptions must be treated as public.

### 4.3 State model

| State | Trigger / durable fact | UI wording | Safe next action |
| --- | --- | --- | --- |
| `node-unavailable` | Bee health/readiness request fails | “Cannot reach this Bee node” | Check that Swarm Desktop/Bee is running locally; retry. |
| `ultra-light-or-unfunded` | Node cannot upload or reports unsuitable mode/batch absence | “This node can read but cannot publish yet” | Fund/redeem through Swarm Desktop; do not paste a code into the app. |
| `batch-not-immutable` | Selected batch is not reported as immutable | “This batch cannot be used for a preservation release” | Select or create an immutable batch; do not publish canonically with it. |
| `ready` | Node reachable, a usable batch selected, batch detail read | “Ready to publish” | Select files. |
| `batch-warning` | Node-reported lifetime is below configured warning threshold | “Storage payment needs attention” | Renew/top up in the node workflow; see runbook. |
| `uploading-release` | Collection upload is in progress | “Uploading immutable release…” | Keep page open; cancellation leaves no false success. |
| `advancing-feed` | Collection reference exists; live next-index read has just completed | “Updating the stable archive address…” | Wait; on ambiguous result, read back before retrying. |
| `verifying` | Feed write returned | “Checking the public recovery path…” | Wait for feed/read-back retry window. |
| `published` | Independent feed read resolves to the submitted collection ref and all files verify | “Published and recoverable” | Copy stable address and recovery kit. |
| `uploaded-not-published` | Collection upload succeeded but feed update failed | “Release uploaded, but the public address still points to the previous release” | Retry only feed advancement after live read; never claim publication. |
| `recovery-failed` | Reader cannot resolve, validate, or download | Specific cause, e.g. “No release has been published” or “File hash mismatch” | Use the displayed input/endpoint correction or retry guidance. |

No fixed timeout may turn a state into success. An ambiguous feed-update network
failure must first read the feed: if it already points to the submitted
collection, mark success; otherwise re-read the live next index and retry under
the documented retry policy. Never reuse an index stored locally.

## 5. Architecture and repository shape

```text
Tsering's browser
  └─ publisher UI ──loopback API──> publisher service ──> Bee node
                                        │                    │
                                  ignored signing key     batch + feed
                                        │                    │
                                      release collection <───┘
                                        │
                              feed manifest (stable archive address)
                                        │
Stranger's reader/CLI ─────────> public manifest or owner+topic ──> Bee/content endpoint
                                                                    └─> collection + every file
```

Create this shape (equivalent names are acceptable only when the boundary is
preserved):

```text
apps/
  archive-publisher/        # local web UI and loopback server routes
  archive-recover/          # separate web reader and mandatory CLI
packages/
  archive-format/           # release schema, validation, hash/path utilities only
  swarm-publisher/          # v13 upload/feed/batch adapter; private-key boundary
  swarm-recovery/           # read-only v13 resolver/downloader; no publisher import
published/
  archive-publication.json  # real public identifiers after initial publish
  releases/                 # public, non-secret release receipts (optional but recommended)
docs/
  ARCHITECTURE.md
  RECOVERY-RUNBOOK.md
  STORAGE-TRUTH.md
  THREAT-MODEL.md
  FORMAT.md
  DEMO.md
README.md
LEARNINGS.md
NOTES-FOR-REVIEW.md
.env.example
.gitignore
```

The recovery package may import `packages/archive-format` but must not import
`apps/archive-publisher`, `packages/swarm-publisher`, browser local storage,
or a publisher-generated local database/index. Add an import-boundary test that
fails if it does.

### Required command contract

Provide documented package scripts with equivalent behavior:

```text
pnpm archive:preflight --endpoint <bee-endpoint> --batch-id <existing-batch-id>
pnpm archive:init --topic <human-readable-topic> --endpoint <bee-endpoint> --batch-id <existing-batch-id>
pnpm archive:publish --input <directory> --endpoint <bee-endpoint> --batch-id <existing-batch-id>
pnpm archive:recover --manifest <feed-manifest-ref> --endpoint <bee-or-gateway-endpoint> --out <empty-dir>
pnpm archive:recover --owner <0x-address> --topic <topic> --endpoint <bee-or-gateway-endpoint> --out <empty-dir>
```

The UI may call the same service logic, but the CLI commands must be real,
documented, and testable. `--batch-id` is required for every canonical write;
the UI sends its chosen public batch ID as that same one explicit operation
input. There is no environment/default/latest-batch fallback. `archive:init`
creates a feed manifest once and writes only public identifiers to
`published/archive-publication.json`; it does not commit or print secret
material.

### Normative recovery resolver

The reader accepts the exact address shown to Tsering, a raw manifest reference,
or the owner/topic pair. It normalizes input before resolution; no input form
depends on a publisher-domain URL, local file, or hidden lookup service.

| Input | Normalization and resolution | Collection/file reads |
| --- | --- | --- |
| `bzz://<feed-manifest-ref>/` (the displayed `archiveAddress`) | Strip only the scheme/trailing slash and validate the 64-hex reference. Request the feed manifest through the configured endpoint's `/bzz/<feed-manifest-ref>/` path; Bee resolves the manifest to the current collection. | Read `archive-release.json` and listed files under that resolved `/bzz` collection. |
| `<feed-manifest-ref>` | Treat as the same feed-manifest reference as above; it is the value accepted by `--manifest`. | Same `/bzz` path as the displayed address. |
| `--owner <address> --topic <topic>` | Construct a read-only `FeedReader`, download the current feed reference, and validate the no-update case. | Read `archive-release.json` and listed files from `/bzz/<collection-ref>/…`. |

The reader's result screen echoes the normalized input and the resolved current
collection reference so a stranger can see what was actually recovered. A
manifest read that has no update, is malformed, or cannot resolve has its own
defined error; it never falls back to a local release receipt.

## 6. Functional requirements

### FR-01 — Node and batch preflight

Before a write, query the configured Bee endpoint and determine whether it is
reachable and able to upload. Read the selected batch from the node, including
its live duration/TTL (or the v13/Bee equivalent), and render the raw
node-returned value plus a clearly labelled estimate if the UI derives a date.
Do not hard-code a number of days or call the result permanent.

The publisher has a batch selection/create flow appropriate to a funded light
node. It must explain that a new ultra-light node can download but cannot
publish, without collecting a gift code. Preflight runs on page load, before
publish, and after publish; it is not a one-time startup assumption.

Canonical preservation releases require a batch whose live v13
`stamp.get`/`stamp.getAll` result has `immutableFlag === true`. The adapter
exposes that property; preflight blocks canonical publishing when it is
false/unknown and offers an explicit immutable-batch selection/creation action.
A test must prove that a mutable batch cannot reach collection upload or feed
advancement. This is a storage invariant, not a marketing label.

The effective `--batch-id` is read once into an operation object, revalidated
immediately before the first write, and then passed unchanged to **every**
canonical write: `feed.createManifest` during `archive:init`, collection/file
upload during `archive:publish`, and `FeedWriter.uploadReference` for the feed
advance. The adapter must accept the batch ID as an explicit argument for each
of those calls and must not call a Bee default/latest-batch helper. If that
exact batch becomes unavailable or loses `immutableFlag === true`, abort before
the next write; do not substitute another batch. Store the effective batch ID
and immutable-observation timestamp in the pending journal and in the public,
non-secret release receipt.

### FR-02 — Create an immutable multi-file release

On selection, validate the directory, build `archive-release.json`, and upload
the full directory/collection with the operation's exact verified batch ID
before attempting a feed update. Use the v13 file/collection API appropriate to
the selected Bee endpoint. Capture the resulting immutable collection reference
and batch ID in the active operation's ignored pending journal and a public
receipt after success.

The implementation must make it obvious in code and tests that the feed receives
the resulting **reference**, not the archive payload. Use the feed writer's
`uploadReference` semantic/API (or the documented v13 equivalent), never an
`uploadPayload` call with archive bytes.

### FR-03 — Stable feed update with live index resolution

Every release update must:

1. Construct the feed reader/writer from the public topic and runtime-only
   owner key.
2. Read the network feed immediately before writing.
3. Resolve the next index using `feedIndexNext` (or the pinned v13 API's
   documented automatic append that performs this resolution). The source code
   and test must demonstrate that no index is a literal, local-file value,
   database value, or in-memory counter.
4. Write the immutable collection reference at that network-derived index.
5. Read the feed back and verify that it resolves to that same reference.

An empty/no-update feed is an expected first-publish case. Catch the read error
at the feed boundary, return `nextIndex = 0` (or use the documented append
behavior), and show “No release has been published yet” rather than throwing an
unhandled rejection.

`FeedWriter.uploadReference` receives the same effective batch ID that created
the manifest and uploaded the collection. The success receipt contains at least
`releaseId`, feed manifest reference, collection reference, feed index,
`batchId`, and immutable-batch observation timestamp so a reviewer can compare
the IDs without learning any credential.

### FR-04 — Public recovery contract

The recovery reader accepts exactly one of:

- `--manifest <feed-manifest-reference>`, or
- `--owner <public address> --topic <public topic>`,

plus a Bee/content endpoint and output directory. It applies the normative
resolver table above, reads the current collection, parses and validates
`archive-release.json`, downloads each listed file using the collection's
endpoint family, verifies SHA-256, and prints a human-readable inventory and
final location. It must work from an empty working directory after the
publisher's app/state folder is deleted.

Its web UI has the same two input modes, a copy/paste-friendly form, progress
by file, a warning before downloading public content, and specific errors for
invalid identifiers, empty feed, unreachable endpoint, malformed manifest,
missing file, and hash mismatch.

### FR-05 — Truthful storage communication

The publisher dashboard includes a visible “Storage health” card showing:

- selected public batch ID (if safe/available),
- node-reported remaining duration/TTL and retrieval timestamp,
- a warning threshold configurable outside source code,
- concise copy: “This release is paid for through the node-reported storage
  window. Keep renewing the batch; this app cannot promise permanent access.”

The release receipt stores the observed value and timestamp for audit, but a
receipt never becomes the source of truth for later health checks.

## 7. User journeys

### Publisher: first publish

1. Tsering opens the publisher and sees a plain-language explanation of the
   stable address and storage-payment limitation.
2. The app checks Bee. If it is unavailable or ultra-light, it identifies that
   fact and gives a safe local setup action; it does not show an enabled Publish
   button.
3. The app shows live batch status. Tsering selects a folio directory and sees
   file count, total size, and public-data confirmation.
4. On Publish, the UI shows real upload, feed-advance, and read-back stages.
5. Only after read-back succeeds, it shows the stable feed-manifest address,
   public owner/topic, current release reference (secondary), storage-health
   facts, and a “Test independent recovery” action.

### Publisher: update after a correction

1. Tsering edits/adds a file and selects the directory again.
2. The app creates a new immutable release, obtains the next index live, and
   advances the existing stable feed.
3. The shared address is unchanged; the public receipt identifies the new
   reference/index. A failed update never overwrites the prior visible success.

### Stranger: recovery after the publisher app is gone

1. The stranger receives `archiveAddress` or public owner/topic from the
   committed publication record, not a private key or local path.
2. In the separate reader they paste it, choose an endpoint, inspect the public
   inventory, and download all verified files.
3. If the feed has no update, is unreachable, or points at malformed content,
   the reader tells them exactly which condition occurred and how to report or
   retry it.

## 8. Rubric coverage matrix

| ID | Required check | Load-bearing implementation | Automated proof | Visible/reviewer evidence |
| --- | --- | --- | --- | --- |
| AC-01 | Published archive is behind a feed, not only a bare upload reference | Feed writer + feed manifest; share UI uses `archiveAddress` from the manifest | Static/integration test asserts feed construction and share value is manifest-based | Stable address remains unchanged across v1 → v2. |
| AC-02 | Feed owner and topic are tracked/copyable | Committed `published/archive-publication.json` with real public values | Schema/test verifies valid owner + nonempty topic | Recovery kit and repository file show both. |
| AC-03 | Next index comes from network before every update | Feed reader's live `feedIndexNext`/documented append immediately precedes write | Unit test rejects local counter; integration spy asserts live lookup | Receipt records returned feed index. |
| AC-04 | Multi-chunk content is written to feed by reference | Upload collection first, feed `uploadReference(collectionRef)` second | Test asserts reference argument, never bytes/payload | Release receipt shows collection reference and inventory. |
| AC-05 | Recovery needs public identifiers only | Separate read-only package/CLI resolves feed → collection → manifest → files | Clean-room test deletes publisher state and recovers fixture collection | `RECOVERY-RUNBOOK.md` and reader form. |
| AC-06 | Remaining batch lifetime is read and surfaced | Node batch query on preflight/publish/inspect, health card/receipt | Adapter test ensures value reaches UI/result | Timestamped Storage health card. |
| AC-07 | Empty feed reads are handled | Guarded feed read maps absence to first-run state | Test covers first publish and reader's no-release message | Defined “No release published yet” state. |
| AC-08 | No credentials or secrets are tracked | Ignored runtime secrets, scrubbed fixtures/docs | Secret-scan CI plus temporary-only negative-input tests | `.env.example`, `.gitignore`, and review notes. |

## 9. Judgment-readiness matrix

| Concern | Design response | Evidence a judge can inspect | Failure prevented |
| --- | --- | --- | --- |
| Durable discovery | Feed manifest is the only share address and is read back after every update | v1/v2 demo, public record, reader test | A changing content hash strands future readers. |
| Honest permanence | TTL/duration comes from node and is visibly caveated | Storage card, receipt, `STORAGE-TRUTH.md` | Misleading “permanent” marketing hides a lapsed batch. |
| Nontechnical recovery | Separate reader provides a form and CLI, inventory, progress, and errors | Clean-room demo and runbook | Recovery depends on source code or publisher disk. |
| Real state/recovery | Feed/update state machine handles ambiguous writes and partial success | Tests and UI screenshots in `NOTES-FOR-REVIEW.md` | A toast claims success before public resolution works. |
| Security boundary | Key stays server-side; content/path validation is enforced | Threat model and boundary tests | Key leakage or malicious output-path writes. |
| Scope honesty | Explicitly names no encryption, governance, or availability guarantee | README limitations | Unjustified decentralization/security claim. |

## 10. Security, privacy, and operational rules

- `.gitignore` must cover `.env*` except `.env.example`, secret key files,
  generated local publisher state, download output, and OS artifacts.
- `.env.example` contains variable names and non-secret local defaults only,
  such as `BEE_API_URL`; it must never include a private key, mnemonic, gift
  code, authenticated URL, or plausible secret-shaped sample.
- Run a tracked-file secret scan in CI and immediately before submission.
- The loopback publisher service starts only with an ignored
  `LOCAL_OPERATOR_TOKEN`. The operator enters that token once into a local
  bootstrap form; the server compares it, creates an HttpOnly/SameSite=Strict
  local session, and never sends the raw token back to the browser. Every
  state-changing route requires that session, an allowed loopback Origin, and a
  CSRF token. Read-only status/recovery routes remain credential-free. Add
  tests for missing session, bad Origin, missing CSRF token, and successful
  local publish.
- Validate all recovery paths with a safe path join and refuse symlinks/path
  traversal. Treat downloaded text/HTML as a download by default, not trusted
  executable UI markup.
- Use bounded retry with exponential backoff and jitter for transient read
  failures. Retry only operations whose real network state has been checked;
  do not blindly retry a feed write.
- Document approximate expected scale (a small collection of images/text),
  total size limits, batch-cost caveat, and what to do when a collection outgrows
  the configured batch.

## 11. Operations and required final artifacts

`README.md` must provide a concise quickstart and role-based demo. The documents
below are mandatory:

- `docs/ARCHITECTURE.md`: feed/collection resolution diagram and exact trust
  boundary.
- `docs/FORMAT.md`: release schema, compatibility rules, and public identifiers.
- `docs/RECOVERY-RUNBOOK.md`: public-input-only recovery from a clean machine.
- `docs/STORAGE-TRUTH.md`: how batch health is read, warning threshold, and
  what the app cannot guarantee.
- `docs/THREAT-MODEL.md`: key compromise, batch lapse, endpoint outage,
  malformed content, and residual risks.
- `docs/DEMO.md`: publish v1, publish v2, remove local state, recover exactly
  the expected files.
- `LEARNINGS.md`: design choices and rejected superficial alternatives.
- `NOTES-FOR-REVIEW.md`: exact commands, rubric map, public evidence links,
  deviations, and known limitations.

## 12. Verification plan and definition of done

Run and document `typecheck`, lint, build, unit tests, import-boundary tests,
secret scan, mocked adapter tests, and a live Bee smoke test when a funded node
is available. The live/demo test must prove all of the following:

1. First publish works when an empty feed is encountered.
2. A second release advances a network-derived index and leaves the share
   address unchanged.
3. Feed read-back resolves to the submitted collection reference.
4. The standalone recovery command runs from a clean directory using only the
   manifest reference or owner/topic and returns every expected file with hashes.
5. A missing Bee, unsuitable node, expired/low-lifetime batch, malformed
   manifest, and ambiguous feed-write failure all produce truthful, distinct
   messages.
6. The displayed `bzz://` address, raw manifest reference, and owner/topic
   inputs each resolve through their prescribed independent paths.
7. A mutable/unknown batch cannot publish a canonical release; an ignored
   pending journal safely resumes an interrupted feed update without becoming a
   recovery dependency.
8. A tracked-file secret scan is clean, and unauthenticated/CSRF-invalid local
   write requests are denied.

The implementation is complete only when every AC-01–AC-08 row has working
code, an automated test, and a manual/reviewer proof; every user journey has a
visible degraded-state path; and the final public record contains actual
copyable identifiers generated from a real publish without exposing any secret.
