# Archive That Outlives Its Host

A local-first publishing console for a small collection of folio scans, plus
a completely separate recovery reader. Tsering publishes immutable releases
to Swarm and points one stable **archive address** at the latest release
through a Swarm feed. A stranger who has only that address — and nothing
else Tsering's laptop happens to have — can recover every file, even after
Tsering deletes this app.

See `PRD.md` for the full specification this repo implements, and
`NOTES-FOR-REVIEW.md` for the rubric-by-rubric evidence map.

## Quickstart

```bash
nvm use 22          # Node 22 LTS (minimum 20.12)
corepack enable
pnpm install
cp .env.example .env  # then fill in a locally-generated key + operator token — never commit .env
```

You need a running, **funded** Bee node for anything beyond the recovery
reader's degraded-state UI: install [Swarm Desktop](https://desktop.ethswarm.org/),
redeem your gift code *there* (never in this repo), and confirm
`curl localhost:1633` answers with the node in **light** mode. See
`docs/DEMO.md` for the full walkthrough.

```bash
pnpm typecheck && pnpm lint && pnpm build && pnpm test && pnpm secret-scan
```

## Two roles, two apps

### Tsering (publisher)

```bash
pnpm archive:preflight --endpoint http://localhost:1633 --batch-id <existing-batch-id>
pnpm archive:init      --topic spiti-folios-v1 --endpoint http://localhost:1633 --batch-id <existing-batch-id>
pnpm archive:publish   --input ./folios --endpoint http://localhost:1633 --batch-id <existing-batch-id> --title "Spiti Folios v1"

# or, the same flows through a local web console:
pnpm dev:publisher:server   # loopback API on http://127.0.0.1:4310
pnpm dev:publisher:web      # UI on http://localhost:5173
```

### A stranger (recovery)

```bash
pnpm archive:recover --manifest <archiveAddress-or-bare-manifest-ref> --endpoint <bee-or-gateway-endpoint> --out ./recovered
# or:
pnpm archive:recover --owner 0x<address> --topic <topic> --endpoint <endpoint> --out ./recovered

# or the web reader:
pnpm dev:recover:web         # UI on http://localhost:4320
```

Full runbook: `docs/RECOVERY-RUNBOOK.md`.

## Repository shape

```text
apps/
  archive-publisher/   local web UI + loopback server + CLI (preflight/init/publish)
  archive-recover/     standalone web reader + mandatory CLI
packages/
  archive-format/      release schema, validation, hash/path utilities — no Swarm dependency
  swarm-publisher/     v13 bee-js adapter: preflight, upload, feed advance — owns the key boundary
  swarm-recovery/      read-only v13 bee-js resolver/downloader — never imports publisher code
published/
  archive-publication.json   real public identifiers, committed after the first real publish
  releases/                  public, non-secret per-release receipts
docs/                 architecture, format, recovery runbook, storage truth, threat model, demo
```

## What this is not

- **Not encrypted or access-controlled storage.** Everything published is
  public. Do not put material here that must stay private.
- **Not a governance solution.** The feed-owner key can redirect the feed's
  future at will; key succession/rotation is out of scope for this exercise
  (it's the concern of a separate challenge).
- **Not a permanence guarantee.** Swarm postage is paid storage with a
  node-reported expiry, not eternal hosting. The app reports the real
  number and prompts renewal; it does not, and cannot, promise more. See
  `docs/STORAGE-TRUTH.md`.
- **Not a public upload gateway.** The publisher's Bee-facing service binds
  to loopback only and requires a local operator token, session, Origin
  check, and CSRF token for every write. See `docs/THREAT-MODEL.md`.

## Scale this app is designed for

A small personal or small-institutional collection — dozens to low
thousands of images/text files, not a bulk digitization pipeline. Defaults
(overridable in `.env`): 50 MiB per file, 512 MiB per release, 5000 files
per release (`packages/archive-format/src/limits.ts`). If a collection
outgrows a batch's capacity, buy a larger/deeper immutable batch and publish
a new release with the same feed — the address does not change.

## Known limitation in this snapshot

`published/archive-publication.json` is **not yet committed** in this
checkout, because doing so honestly requires a real `pnpm archive:init` run
against a genuinely funded Bee node (per PRD §4.1, a template or
runtime-only value does not satisfy the requirement, and this repo does not
fabricate one). Once you have redeemed a gift code in Swarm Desktop, run the
Quickstart above end-to-end — `archive:init` then `archive:publish` — and
commit the resulting `published/archive-publication.json`. See
`NOTES-FOR-REVIEW.md` for the full status of what is code-complete and
mocked-tested versus what needs one live run to produce real evidence.
