---
title: Partial Replication in Radicle
description: How Radicle syncs refs, what partial seeding it supports today, why a namespace is all-or-nothing, and why COB embeds are the one case a filter could skip.
tags:
  - radicle
  - aigenerated
project: Radicle
---

Radicle replicates by fetch. A node that learns of new refs fetches them from a peer. This document describes how that fetch selects refs, what parts of a repository you can decline to hold, and where the limits come from.

The short answer: seeding is partial at the repository and the peer level. It is not partial inside a peer's namespace. Git refspecs play no part in this, because the fetch protocol does not send refspecs.

## How refs sync

Storage keeps one bare repository for each RID. Each peer owns a namespace below `refs/namespaces/<NID>/`.

Each peer signs `refs/rad/sigrefs`. This is a map of refname to object ID that covers all of that peer's refs. The `Refs` type in `radicle::storage::refs` writes the map as one canonical text blob. One signature covers the whole blob. The signed map, not a refspec, drives replication.

A fetch runs as staged roundtrips. The `ProtocolStage` implementations in `radicle_fetch::stage` define them:

1. `CanonicalId` fetches `refs/rad/id`. This is the trust anchor. A clone does this first.
2. `SpecialRefs` fetches `rad/id` and `rad/sigrefs` for each namespace in scope. When an announcement drives the fetch, `SigrefsAt` fetches the sigrefs of the announced peers only.
3. `DataRefs` sends no `ls-refs` request. It computes the wants and haves directly from the signed maps, then receives a packfile. It also prunes local refs that the sigrefs no longer list.

The wire carries two selectors only. The first is the `ls-refs` `ref-prefix`, held by the `RefPrefix` enum in `radicle_fetch::stage`. The second is the set of want and have object IDs. The client filters the `ls-refs` result again, because protocol v2 treats `ref-prefix` as a hint.

Refspecs do occur in Radicle, but only on local operations: between the working copy and storage in `radicle::rad`, in the remote helper, and in `Namespaces::to_refspecs`.

## What partial seeding exists today

Two axes:

- The repository. `SeedingPolicy` is `Allow` or `Block`.
- The peer. `Scope::Followed` limits the fetch to followed peers and delegates. `Scope::All` asks for every namespace. The follow block list removes peers from either set. See `radicle_fetch::policy`.

The announcement path adds a third, narrower selection. A pull with `refs_at` fetches the sigrefs of named peers only.

## Why a namespace is all-or-nothing

Three things stack up. Only the first is cryptographic, and it is the weakest of the three.

### The signature covers the whole map

`Refs::canonical` writes every `<oid> <refname>` line into one blob. A single signature covers it. There is no per-ref proof that you can show for a subset.

This alone does not forbid a partial replica. The sigrefs commit is small, so you can verify the signature while you hold almost none of the objects it names. The next two constraints are the binding ones.

### Storage compares the two sets exactly

`validate_remote` diffs the refs below `refs/namespaces/<NID>/` against the signed map in both directions:

- Signed but absent gives `Validation::MissingRef`.
- Present but unsigned gives `Validation::UnsignedRef`.
- Present with a different tip gives `Validation::MismatchedRef`.

A subset produces one `MissingRef` for each ref you left out. Storage has no way to record which subset you meant to hold.

### The outcome is per namespace

`FetchState::run` validates after the data fetch and before the write to the production repository. On any failure it calls `prune` for that peer and drops all of its tips. For a delegate it also removes the peer from the voter set. If the remaining delegates fall below the threshold, the fetch fails. The code has one lever for each peer, and that lever is binary.

### The reason the rule is strict

A seed must re-serve what it holds. A peer that fetches from you computes its wants straight from your copy of the sigrefs. It sends no `ls-refs` for data refs, so it never asks what you actually have.

`RefsAt` holds a peer ID and one object ID. It is the only unit of announcement, and it asserts the whole set. If you held a subset and announced that object ID, the peer would ask for objects you do not have and get a "wanted object not found" error. The protocol has no way to say "I have these sigrefs, but only part of them".

`SignedRefs::load` also compares sigrefs by commit ancestry. A partial copy at a given commit looks the same as a complete copy at that commit.

## Verification without replication

You can verify much of a repository with very few objects.

| Check | Objects needed |
| --- | --- |
| A peer's sigrefs signature | the sigrefs commit and its `refs` and `signature` blobs |
| Identity and delegate set | the `refs/rad/id` history: commits, trees, small document blobs |
| Canonical branch quorum | the delegates' branch tip commits, plus merge-base traversal |
| Diff, browse, build | the full object closure |

The first two cost metadata only. Their size does not grow with the repository. The third needs commits, but no trees and no blobs.

The code already models partial knowledge at one layer. `Canonical::find_objects` returns a `Missing` set of refs and objects that it could not find. It computes a quorum from the delegate tips it does hold, and `Canonical::found_objects` fills the gaps later.

Three gaps stop a verify-only node today, and none of them is cryptographic:

1. No resting state. `validate_remote` is an unconditional diff. A metadata-only namespace gives one `MissingRef` for each data ref, and the fetch prunes the peer. This needs a third outcome beside "applied" and "pruned", and `validate_remote` must know which namespaces use it.
2. No honest announcement. `RefsAt` asserts the whole set. A metadata-only node that announces normally will fail the peers that fetch from it. Such a node must stay a leaf, or the protocol needs a new announcement.
3. Git friction. A ref whose objects are absent gives a repository that fails a connectivity check. Git's answer is a promisor remote with `filter=blob:none`. The fetch refuses this today: `radicle_fetch::transport::fetch` sets `reject_shallow_remote` to true and `Shallow::NoChange`, and it negotiates no `filter` capability.

## Example: COB embeds

Embeds are the strongest case for a filter, because they are leaf blobs that no check reads.

`write_manifest` in `radicle_cob::backend::git::change` builds the tree of a COB change commit:

- a `manifest` blob,
- one blob for each operation, named `0`, `1`, and so on,
- an `embeds` subtree, when the change has embeds. Each entry maps a file name to a blob.

The signature is over the root tree object ID. `change::Storage::store` signs `revision`, which is that tree. So the tree commits to the embed blob ID, and the signature commits to the tree.

Three facts follow:

- You can verify the change without the embed bytes. The `embeds` tree object gives you the name and the object ID, and the signature covers them.
- Nothing reads the embeds during evaluation. `load_contents` walks the root tree and keeps blobs whose name parses as an integer. It skips `manifest`, and it skips `embeds`, which is a tree. The `Entry` type has no embeds field.
- The COB payload points at embeds by hash. `Embed<Uri>` in `radicle::cob::thread` holds a `git:<oid>` URI, not the content. See `Uri` in `radicle::cob::common`.

So an embed is a content-addressed leaf. Drop it and the COB still loads, still verifies, and still evaluates. You lose only the ability to show the file.

`validate_remote` would also pass. It compares ref names to object IDs. The COB ref still exists and still points at the right commit, so a missing blob inside the tree is invisible to it. This is the one case where the existing validation does not stand in the way.

Two things still block it:

- No refspec can express this. The embed is a blob inside the tree of a ref that sigrefs lists. Refspecs select refs, not paths inside a tree. You need an object filter: `blob:none` keeps commits and trees but no blobs, `blob:limit=<n>` skips large blobs, and `sparse:oid` selects by path. Large embeds fit `blob:limit` well. The fetch negotiates none of these.
- A seed must still re-serve. A node that skips embeds cannot satisfy a peer that wants them, and it has no way to say so.

## Summary

- Refspecs are a local tool in Radicle. The fetch protocol does not use them.
- Seeding is partial for a repository and for a peer. It is not partial inside a peer's namespace.
- The limit comes from the duty to re-serve and from the single-object-ID announcement, not from the signature scheme.
- COB embeds are the clearest candidate for a filter. They verify without their bytes, no check reads them, and the ref-level validation already tolerates their absence.
