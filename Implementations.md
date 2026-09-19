---
title: "Road To Devcon - V"
source: "https://www.loops.house/road-to-devcon-v/workspace"
author:
published:
created: 2026-09-19
description: "Build, launch, and evaluate projects with Loops House."
tags:
  - "clippings"
---
Time left

42

Hrs

02

Mins

44

Secs

Problems

## ETH Swarm GiftCode

`0x7141f3d0…84a9c72708`

Time left

42

Hrs

02

Mins

44

Secs

## Eight hundred winters, one lapsed invoice

In a stone vault above the Spiti valley, birch-bark folios have survived eight hundred winters. Cold, dry, dark, and largely left alone, the conditions turned out to be close to ideal, and nobody designed them.

Tsering spent two winters photographing them. Eleven thousand images: Bhojpatra scrolls, palm-leaf folios, a medical compendium with margin notes in three hands. Page by page, in gloves, by window light.

The photographs live in a cloud account a visiting researcher opened in 2019 under a grant. The grant ended. The researcher moved institutions. Last March the account was suspended for non-payment, and it took five weeks and four emails to someone who no longer works there to get it back.

The manuscripts lasted eight centuries in a room with no electricity. The scans nearly died in six years. Tsering does not want a better hosting account, he wants the scans reachable by anyone who knows where to look, long after the grant, the committee, and Tsering himself have moved on.

What you'll learn

Content addressing and why a hash is not an address you can publish. Postage stamps, and the fact that "permanent" on Swarm is a payment schedule with an end date. Feeds, and how a stable address can point at changing content.

Setup required: you need a running, funded Bee node for this problem.

Two steps, and both matter. A fresh node runs in *ultra-light* mode, which can only download; redeeming your gift code funds it into *light* mode, which is what lets you buy a postage stamp and upload anything at all.

Step 1 — get a node running. Download and install [Swarm Desktop](https://desktop.ethswarm.org/). It bundles Bee, so there is nothing else to install, and it exposes the API your code will talk to at `http://localhost:1633`.

Step 2 — redeem your gift code. Import it in the Desktop app.

The command sweeps the xBZZ and xDAI out of the gift wallet into your node's wallet, so your node must already be running for it to find the destination.

Pin your bee-js version before you write anything. v13 moved the flat methods into namespaces,`bee.uploadData` is now `bee.data.upload`, `bee.getAllPostageBatch` is now `bee.stamp.getAll` and nearly every example online, along with most code an AI assistant will write, is still v12. The migration page in the resources below has the full table. Do this at check-in if you can, first boot has to deploy a chequebook and sync the postage batch store, which is slow on venue wifi, and forty people doing it at once is slower still. If your node genuinely will not start, `/swarm-troubleshoot` in the Quickstart Skills is the fastest route to a diagnosis; Beeport is a fallback for uploads but will not give you the batch information this problem asks for.

What to do

1. Confirm your node is up and funded: `curl localhost:1633` should answer, and Swarm Desktop should report the node in light mode. Ultra-light means the gift code has not landed yet and nothing you upload will work.
2. Buy a postage batch and put a small collection of files on Swarm. Any files stand in for the folios; a handful of images and text is plenty.
3. Give the collection an address that stays the same when the contents change.
4. Make it possible for a stranger to recover the whole collection later, knowing only what you chose to publish about it, not what your app happens to have stored on disk.
5. Be honest in the interface about how long the data is actually paid for.

Don't paste your gift code into the repo. It belongs in Swarm Desktop and nowhere else.

Deliverable. A GitHub repo containing your publishing tool and whatever a stranger needs to read the archive without it.

Acceptance criteria

- Tsering can hand someone a single address, delete the app, and that person still gets every folio back.

8 scored test cases · 80 points are read straight off your code — open the Test cases tab to see exactly what they are before you build.

Suggested stack

Swarm Desktopbee-jsswarm-cliNode.jsTypeScript

## Get started

`npx loopshouse add road-to-devcon-v`

Before you run it

Needs `Node 20.12+` (22 LTS recommended) — check with `node -v`, and switch with `nvm use 22` if you're older. Sign-in opens in your browser (Google, GitHub, or an email code) — nothing to copy or paste.

Run it in your project directory — it installs this battle's agent skill and signs you in, then you build with your own coding agent.

## How to use

### Via CLI

Query this problem's knowledge graph straight from your terminal:

`loops knowledge query --event road-to-devcon-v --problem archive-that-outlives-its-host -q "<your question>"`

### Via IDE

Once the skill is installed, your coding agent knows this battle — just ask it in plain English inside your IDE:

`Ask the "Eight hundred winters, one lapsed invoice" knowledge graph: <your question>`

Test cases

8

Points from checks

80 /100

Points from judgment

20

Each check is answered by reading the repo you submit — pass it, bank its points.

- 1.Content is published behind a feed, not only as a bare upload reference
	8
	Passes if A feed writer or feed manifest is created and the address the app publishes or displays as the archive address is the feed's, not a single upload's reference.
	Fails if The app only ever produces upload references with no feed writer or manifest anywhere, or there is no publishing code at all.
- 2.The feed's owner address and topic are recorded in a tracked file
	6
	Passes if Both the owner address and the topic appear in a tracked file in a form a reader could copy and use.
	Fails if Either value is generated at runtime and never written to a tracked file, exists only in an untracked env file, or does not appear anywhere in the repo.
- 3.The next feed index is resolved from the network before each update
	16
	Passes if Each update either omits the index so the writer appends by default, or derives it from feedIndexNext (or equivalent) obtained from a read of the feed immediately before writing.
	Fails if The index is a literal, is read from a local file, database or in-memory counter, or is otherwise computed without consulting the feed — or there is no feed update code at all.
- 4.Content that exceeds one chunk is written to the feed by reference
	12
	Passes if Archive contents are uploaded separately and the resulting reference is written to the feed with uploadReference (or the deprecated upload used unambiguously for a reference).
	Fails if Archive file contents are passed to uploadPayload as the feed payload, or the contents are never uploaded to Swarm at all.
- 5.A recovery path reads the archive from the published identifiers alone
	14
	Passes if An entrypoint exists whose only inputs are the published identifiers (owner and topic, or a manifest reference) plus a Bee endpoint, and which reads no local index, database or app state file to enumerate the archive.
	Fails if Recovery requires a local index, database, state file or the app's own stored records, requires credentials only the original publisher holds, or no such entrypoint exists.
- 6.The batch's remaining lifetime is read from the node
	8
	Passes if Code reads the batch's duration or TTL from the node and surfaces it in output, UI or a generated file.
	Fails if Batch lifetime is never read, is hardcoded as a constant, or is read but discarded without reaching any output.
- 7.Reading a feed with no updates yet is handled
	8
	Passes if At least one feed read is wrapped in a catch or guard that produces a defined first-run behaviour, such as starting at index 0 or reporting that no updates exist.
	Fails if Every feed read is unguarded so an empty feed propagates an unhandled rejection, or there is no feed read anywhere in the repo.
- 8.No credential, private key, mnemonic, gift code or authenticated URL appears in any tracked file
	8
	Passes if No private key, mnemonic, gift code or authenticated URL appears in any tracked file; secrets are read from environment variables or from files excluded by.gitignore.
	Fails if Any private key, mnemonic, gift code, API key or authenticated endpoint URL appears in a tracked file, including in documentation, comments or fixtures.