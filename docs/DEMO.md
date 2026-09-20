# Demo script

The point of this demo is stronger than "an upload returned a hash": publish
v1, publish a corrected v2, delete the publisher's local state, and recover
the *current* release from a separate reader using only public identifiers.
The address handed out never changes.

## Prerequisites

- Node 22 LTS (`nvm use 22`; minimum 20.12).
- `pnpm` (`corepack enable && corepack prepare pnpm@9.15.0 --activate`).
- Swarm Desktop installed and running, in **light** mode (redeem your gift
  code there — never in this repo). `curl localhost:1633` should answer.
- An **immutable** postage batch. Create one from the publisher UI ("Create
  immutable batch") or `bee.stamp.create(..., { immutableFlag: true })`
  directly.
- `.env` populated from `.env.example`, including a locally-generated
  `ARCHIVE_FEED_PRIVATE_KEY` (or `ARCHIVE_FEED_KEY_FILE`) and
  `LOCAL_OPERATOR_TOKEN`. Neither is ever committed.

```bash
pnpm install
cp .env.example .env
# edit .env: BEE_API_URL, ARCHIVE_FEED_PRIVATE_KEY (or _KEY_FILE), LOCAL_OPERATOR_TOKEN
```

## 1. Preflight

```bash
pnpm archive:preflight --endpoint http://localhost:1633 --batch-id <your-batch-id>
```

Expect `Status: Ready to publish` with the node-reported batch duration
printed. If instead you see `ultra-light-or-unfunded` or
`batch-not-immutable`, fix that first — publish will refuse to proceed past
those states too.

## 2. Initialize the feed (once, ever, per topic)

```bash
pnpm archive:init --topic master-of-all --endpoint http://localhost:1633 --batch-id <your-batch-id>
```

This creates the one feed manifest and writes
`published/archive-publication.json` with real values. **Review it, then
commit it:**

```bash
git add published/archive-publication.json
git commit -m "Record the public archive address"
```

Copy `archiveAddress` from that file — this is the string you'll hand to a
stranger, and the one value that must not change for the rest of this demo.

## 3. Publish v1

```bash
mkdir -p /tmp/folios-v1
cp your-sample-images/*.jpg /tmp/folios-v1/
echo "Field notes, v1" > /tmp/folios-v1/notes.txt

pnpm archive:publish --input /tmp/folios-v1 --endpoint http://localhost:1633 --batch-id <your-batch-id> --title "Spiti Folios v1"
```

Expect: uploading → advancing feed → verifying → `Published and
recoverable.`, with a printed collection reference, feed index (`0` on
first publish), and the *same* `archiveAddress` as step 2.

## 4. Publish a corrected v2

Edit or add a file, then publish again from the same (or a copied) input
directory:

```bash
echo "Corrected caption for page 3" >> /tmp/folios-v1/notes.txt
pnpm archive:publish --input /tmp/folios-v1 --endpoint http://localhost:1633 --batch-id <your-batch-id> --title "Spiti Folios v2"
```

Expect: a **new** release ID and collection reference, feed index advances
(e.g. `0` → `1`), and — this is the point — **`archiveAddress` is printed
identically to steps 2 and 3.**

## 5. Remove the publisher's local state

```bash
rm -rf state
# published/archive-publication.json and published/releases/*.json are the
# public record — leave those; a real stranger would only ever have the
# archiveAddress string anyway, not this repo's disk.
```

## 6. Recover, independently, using only the public address

```bash
pnpm archive:recover --manifest <archiveAddress-from-step-2> --endpoint http://localhost:1633 --out /tmp/recovered-v2
ls /tmp/recovered-v2
cat /tmp/recovered-v2/notes.txt   # should show the v2, corrected text
```

Expect every file from v2 (not v1), each with a confirmed SHA-256, and the
**same address** used in step 3. Cross-check `--owner`/`--topic` instead of
`--manifest`, using the values from `published/archive-publication.json`,
and confirm it resolves to the identical content.

## What "done" looks like

- Steps 3 and 4 print the same `archiveAddress`.
- Step 6 recovers v2's content, not v1's, using nothing but that address and
  a Bee endpoint.
- `pnpm test`, `pnpm typecheck`, `pnpm secret-scan` are all clean (see
  `docs/../README.md` quickstart).
- `published/archive-publication.json` is committed with real values (not a
  template) and contains no private key.
