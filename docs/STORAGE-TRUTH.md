# Storage truth

## What Swarm postage actually buys

A postage batch pays for a *storage window*, not permanence. When that
window lapses and isn't renewed, the network is free to garbage-collect the
data. Nothing about "decentralized" changes that arithmetic. This app treats
that as a fact to surface, not a flaw to hide.

## Where the number comes from

`bee.stamp.get(batchId)` returns a live `PostageBatch` object whose
`duration` field (a `Duration` instance from bee-js) is the node's own
estimate of remaining storage time, computed from the batch's paid amount,
its depth, and current chain block time. This app never computes that number
itself and never hardcodes a "days remaining" constant.

Implementation: `packages/swarm-publisher/src/preflight.ts` →
`readBatchHealth`. It calls `batch.duration.toSeconds()` and returns the raw
seconds value plus an `observedAt` timestamp — the exact instant that number
was read. It is read:

- on every page load / `pnpm archive:preflight` run,
- immediately before every publish,
- immediately after every publish (the release receipt in
  `published/releases/<releaseId>.json` stores this observation for audit).

## Where it is surfaced

- **Publisher UI** — the "Storage health" card
  (`apps/archive-publisher/src/web/App.tsx`, `BatchHealthCard`) always shows
  the raw duration in seconds *and* a derived days figure, labeled as an
  estimate, next to the timestamp it was observed at.
- **CLI** — `pnpm archive:preflight` prints the same numbers
  (`apps/archive-publisher/src/cli/preflight.ts`).
- **Release receipt** — `batchDurationSeconds` and
  `batchDurationObservedAt` in `published/releases/<releaseId>.json`, for a
  reviewer to compare against what the node reports *now*.

## Warning threshold

Configurable via `BATCH_WARNING_THRESHOLD_DAYS` in `.env` (default: 14
days; see `.env.example`). When remaining duration drops below the
threshold, the state machine reports `batch-warning` instead of `ready`
(still publishable, but flagged) — see
`packages/swarm-publisher/src/types.ts` and `preflight.ts`. This threshold
lives in configuration, not in a compiled constant, so an operator can
tighten or loosen it without a code change.

## What this app cannot do, and does not claim to

- It cannot renew a batch automatically. Renewal happens through the node's
  own wallet/batch workflow (Swarm Desktop), never inside this app.
- It cannot predict an exact expiry *date* with certainty — chain block time
  can drift, and the estimate is exactly that: an estimate derived from the
  node's own current view.
- It cannot insure or replicate data outside of what the batch and the
  node's neighborhood already provide.
- A **release receipt is never treated as current truth**. It is a
  timestamped historical observation. Every live health check re-reads the
  node; nothing in this app ever answers "is the batch still funded?" by
  reading a file instead of the network.

The exact copy shown in the UI: *"This release is paid for through the
node-reported storage window. Keep renewing the batch; this app cannot
promise permanent access."*
