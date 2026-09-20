# Recovery runbook

This is the runbook for **a stranger who has never seen this repository run**
— the exact scenario the demo in `docs/DEMO.md` exercises: the publisher's
app and local state are gone, and only two things survive:

1. The `archiveAddress` (or the `owner` + `topic` pair) from
   `published/archive-publication.json`.
2. A Bee node or public Swarm content-gateway endpoint to talk to.

Nothing else is required. No source code from `apps/archive-publisher`, no
`ARCHIVE_FEED_PRIVATE_KEY`, no local database, no index file.

## Option A — command line (mandatory entrypoint)

```bash
# From a clean checkout / clean machine:
git clone <this-repo>
cd <this-repo>
pnpm install

# Using the stable address (or its bare manifest reference):
pnpm archive:recover \
  --manifest <feed-manifest-reference-or-bzz-address> \
  --endpoint http://localhost:1633 \
  --out ./recovered

# Or using the owner + topic pair instead:
pnpm archive:recover \
  --owner 0x<public-feed-owner-address> \
  --topic master-of-all \
  --endpoint http://localhost:1633 \
  --out ./recovered
```

`--manifest` accepts either the exact `bzz://<64-hex>/` address shown by the
publisher, or the bare 64-character hex reference. `--endpoint` is any Bee
node or content-gateway that can resolve `/bzz/...` paths — it does not have
to be the publisher's own node. `--out` must be a directory the process can
write to; it does not need to pre-exist.

On success, the CLI prints:

- the release title, ID, and publish timestamp,
- exactly what input resolved to what collection reference (and feed index,
  if resolved via owner+topic),
- one line per file with its size and a confirmed SHA-256 match,
- the final output directory.

On failure, it prints one of these specific messages and exits non-zero
(implementation: `apps/archive-recover/src/cli.ts`,
`packages/swarm-recovery/src/types.ts`):

| Condition | Message |
| --- | --- |
| No release published yet | "No release has been published yet at this address." |
| Endpoint down | "Cannot reach the endpoint. Check that a Bee node or content gateway is running and reachable: ..." |
| Malformed input | "Invalid input: ..." |
| Malformed manifest | "The release manifest is malformed: ..." |
| A listed file is missing from the collection | "A required file is missing from the collection: \<path\>" |
| Hash mismatch | "Hash mismatch — the downloaded content does not match the published manifest: \<path\>" |

## Option B — web reader

```bash
pnpm --filter archive-recover run dev:web
```

Opens a small React SPA (`apps/archive-recover/src/web`). Paste the same
inputs as above, acknowledge that this downloads public content, and click
**Recover archive**. It shows progress per file, an inventory table with a
verified checkmark per file, and either:

- **Save all to a folder** (Chromium-based browsers, via the File System
  Access API — preserves the manifest's relative paths exactly), or
- **Download all files** (any browser — flattens each path into its
  filename, e.g. `folios/page-001.jpg` → `folios__page-001.jpg`, since the
  plain download attribute cannot create subfolders).

The web reader runs bee-js directly in the browser (no server in the
middle) and verifies each file's SHA-256 with the Web Crypto API before
offering it for save — see `apps/archive-recover/src/web/lib/browser-recover.ts`.

## Verifying you actually got a clean-room recovery

To convince yourself (or a reviewer) that recovery has no hidden dependency
on the publisher's machine:

```bash
rm -rf apps/archive-publisher/node_modules state published/releases
# (do NOT remove published/archive-publication.json — that's the public
#  record a stranger is handed; removing it just simulates "I only have the
#  string I was given," which is exactly the CLI invocation above)
pnpm --filter archive-recover install
pnpm archive:recover --manifest <address> --endpoint <endpoint> --out ./clean-room-test
```

The import-boundary test (`apps/archive-recover/test/import-boundary.test.ts`)
makes this structural, not just procedural: the recovery app's source code
cannot reference `@archive/swarm-publisher`, the publisher app, or any
`state/*.json` / `archive-publication.json` path — the build fails if it
ever does.
