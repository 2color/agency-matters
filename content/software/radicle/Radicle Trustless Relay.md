---
title: Trustless Radicle Relay — design/spec
description: |-
  A stateless HTTP endpoint that lets short-lived environments (e.g. CI runners) hold a stable Radicle identity, create COBs, and propagate them to the network by posting already-signed changes. The relay is not trusted: it only validates and forwards public, signed bytes, and
  every receiving node re-validates independently.
tags:
  - radicle
project: Radicle
---
## Summary

A stateless HTTP endpoint that lets short-lived environments (e.g. CI runners) hold a stable Radicle identity, create COBs, and propagate them to the network by posting already-signed changes. The relay is not trusted: it only validates and forwards public, signed bytes, and
every receiving node re-validates independently.

Scope of this spec:
- Generic COBs (any type, create + update), not issues-only.
- Portable client state format: JSON manifest + base64 loose git objects (constructible in a browser).

## Context

The POC (`poc/passkey-issue/relay-server.mjs`) lets a browser sign a Radicle issue COB with
a passkey-derived Ed25519 key and relay it through a node that announces it. That relay is
**stateful and node-coupled**: it reads the current sigrefs head from local node storage
(`GET /head`), holds a per-identity in-memory lock, writes objects into `~/.radicle/storage`,
runs `rad issue cache`, and pokes the node control socket. The identity is also **pinned to
one relay** by mixing the relay's home NID into HKDF key derivation (`webauthn.ts`), which is
what currently makes cross-relay forks impossible.

The goal is to generalize this so short-lived environments can create COBs and propagate them
via an HTTP endpoint that accepts already-signed changes, with three shifts from the POC:

- **Stateless relay** holding no per-client state.
- **Client owns its state** (key + full namespace) in a portable file on any blob/KV store.
- **Relay-agnostic client** not pinned to one relay.

## Trust model (the core argument)

Nothing about the relay needs to be trusted. Every receiving node re-validates a fetched
namespace independently, so a forged or malformed relay write is rejected network-wide:

- COB change signatures are checked (raw Ed25519 over the tree OID) in `ChangeGraph`;
  bad branches are dropped (`radicle-cob/src/change_graph.rs`, `change/store.rs:129`).
- Sigrefs are re-verified: signature over the canonical listing, `refs/rad/root` must embed
  the repo's RID, and the embedded `refs/rad/sigrefs-parent` must equal the real commit
  parent (`radicle/src/storage/refs.rs`, `.../sigrefs/read.rs`).
- Namespace layout is validated: every ref present must be in the signed set with a matching
  OID, no unsigned refs, no signed-but-missing refs
  (`ValidateRepository::validate_remote`, `radicle/src/storage/git.rs:655`).
- Divergence is detected on fetch: a forked sigrefs chain is a hard `Diverged` error
  (`radicle-fetch/src/state.rs:580`).

The relay's own gossip signature only authenticates **who relayed**, not who authored
(`radicle-protocol/src/service.rs:2094`). Announcing a foreign namespace requires only that
the namespace's `rad/sigrefs` ref exists in the relay's storage; `announce_refs_for` accepts
arbitrary namespace keys.

### Fork-safety without the HKDF home-NID binding

The POC prevents forks by deriving a different NID per relay. Removing that binding, fork-
safety instead rests on: **the client owns a single linear sigrefs head and always chains the
next sigrefs off it** (the signed `sigrefs-parent` entry). Because the client is the sole
author of its namespace, if it serializes its own updates there is exactly one lineage and no
fork exists. If a misbehaving or state-lost client ever chains off a stale head, the result is
a `Diverged` namespace that the network rejects; the only consequence is that the client fails
to publish. No relay is trusted and the worst-case is a liveness failure for that client, not
a safety failure for the repo. This is what makes it genuinely trustless.

Liveness/recovery: the durable source of truth is the client's portable file plus the network.
If the file is lost, the client can re-read its current sigrefs head/refs from any seed (see
the optional read endpoint) and resume chaining.

## Architecture

```
CI env (short-lived)                         Relay (stateless httpd, a seed of the repo)
  key (env-managed)
  portable namespace file  ──POST signed──▶   validate signed bytes (no local per-client state)
  (objects + refs + head)                      write namespace objects + refs into storage
        ▲                                      announce_refs_for(rid, [nid])
        └── update head after 200 ──────────   200 { sigrefsHead, announced }
                                                        │
                                              network peers fetch + re-validate (arbiter)
```

- The relay is **stateless per client**: each request is self-contained; the relay derives
  nothing about the client from prior requests. It does write to its node storage, but only as
  a seed replica; the client's portable file plus the network are the source of truth, so any
  relay seeding the repo is interchangeable.
- **Assumption:** the relay is a seed node that already replicates the target repo, so it holds
  the canonical identity objects (`refs/rad/root`, the `xyz.radicle.id` COB) and can resolve
  the repo's real `rad/id` head for resource anchoring. The client picks any relay that seeds
  the repo.

## Portable namespace file format

JSON, browser-constructible (extends the POC's in-browser object building in
`src/lib/passkey/cob.ts`). One file per (identity, repo). Carries the client's **full
cumulative** contribution so any seeding relay can materialize a complete namespace; canonical
repo objects are referenced by OID only (the relay already has them as a seed).

```jsonc
{
  "version": 1,
  "did": "did:key:z6Mk…",
  "pubkey": "<base64 32-byte Ed25519 pubkey>",
  "rid": "rad:z…",
  "resource": "<40-hex>",        // repo's rad/id head (cached; refreshable from relay/httpd)
  "root": "<40-hex>",            // repo's refs/rad/root oid (for the sigrefs rad/root entry)
  "sigrefsHead": "<40-hex>|null",// client's current sigrefs commit; null before first publish
  "refs": [                      // full signed set this namespace carries
    { "name": "refs/rad/root", "oid": "<40-hex>" },
    { "name": "refs/cobs/xyz.radicle.id/<id>", "oid": "<40-hex>" },
    { "name": "refs/cobs/<type>/<cobId>", "oid": "<40-hex>" }
    // …every COB this identity has authored in this repo
  ],
  "objects": {                   // client-authored objects only (COB + sigrefs graph)
    "<oid>": { "type": "commit|tree|blob", "data": "<base64 object content, no header>" }
  }
}
```

Notes:
- `objects` is an OID-keyed map, so it dedupes naturally and grows only by the small COB and
  sigrefs objects. Canonical identity objects are omitted (relay resolves them).
- The file is pure data on any blob/KV store; the environment's key is stored separately by the
  environment (out of scope for the format).

## Relay HTTP endpoint (in radicle-httpd)

New write path in httpd (today httpd is 100% read-only; git-receive-pack is rejected in
`src/git.rs:107`). Model the handler after `src/api/v1/repos.rs`, register with
`axum::routing::post`, apply `DefaultBodyLimit`.

`POST /v1/repos/{rid}/namespace`

Request body: the signed delta for one publish. It is the portable file's new/changed pieces:
identity (`did`, `pubkey`), the new/updated COB objects (base64), the new `refs` listing the
sigrefs will cover, and the new sigrefs (`parent`, canonical listing, signature, objects,
`commitOid`). Shape mirrors the POC `/relay` payload generalized to any COB type and to
create+update (see COB semantics below).

Relay steps (all pure validation needs no per-client state):
1. `pubkey` decodes to and matches the `did`/NID.
2. For each COB change entry: recompute the tree OID from the supplied tree bytes and verify
   the Ed25519 signature is over that raw tree OID (`Entry::valid_signatures`,
   `radicle-cob/src/change/store.rs:133`).
3. Resource anchoring: the change commit's `Rad-Resource` trailer/parent equals the repo's
   real `rad/id` head, read from the relay's storage via the existing `identity` field
   (`repo::Info.identity`, `src/api.rs`).
4. Sigrefs: reconstruct the sigrefs commit and run full verification
   (`SignedRefs::load_at`, `radicle/src/storage/refs.rs:433`): signature over the canonical
   listing, `rad/root` RID match, `sigrefs-parent` equals the supplied parent, monotonic
   `FeatureLevel`. Reject if `parent` != the current sigrefs tip in storage (anti-fork CAS).
5. Layout: the new `refs` set covers exactly the namespace refs being written
   (`ValidateRepository::validate_remote`, `radicle/src/storage/git.rs:655`).
6. Write objects + refs under `refs/namespaces/<nid>/…` via git2 on `repo.backend`, using the
   existing writer trait impls (`radicle/src/storage/refs/sigrefs/git.rs`,
   `storage/git/cob.rs:149`); `write_reference` already does a compare-and-swap on the sigrefs
   parent for concurrency.
7. Announce: `Node::new(ctx.profile.socket_from_env()).announce_refs_for(rid, [nid])` on a
   `spawn_blocking` task (pattern in `src/api/v1/node.rs:83`).

Response: `{ ok, rid, nid, sigrefsHead, announced }`; the client persists `sigrefsHead` back
into its portable file.

Concurrency: writes to the same repo need serialization the read-only httpd lacks today. Use a
per-repo/per-NID async lock in `Context` (e.g. `Arc<Mutex<…>>` map) plus the ref-write CAS.

### Optional read/recovery endpoint

`GET /v1/repos/{rid}/namespace/{nid}` → `{ sigrefsHead, refs }` from storage, so a client that
lost its portable file can rebuild its head and ref listing before chaining the next sigrefs.
Advisory only; not authoritative (the client remains the source of truth).

## Generic COB semantics (create + update)

Confirmed against `radicle-cob/src/backend/git/change.rs` and `object/collaboration/update.rs`:

- **Change tree**: `manifest` blob (`{ typeName, version }`) + one blob per CRDT op named by
  index `0,1,…` + optional `embeds/` subtree. Signature is raw Ed25519 over the tree OID.
- **Create**: commit parents = `resource`; the COB id is the first commit's OID.
- **Update**: commit parents = the COB's current DAG tips (`object.history.tips()`) plus
  `related` plus `resource`; the COB ref (`refs/cobs/<type>/<cobId>`) advances to the new head
  while `cobId` stays the root OID. The client must know the current tips it chains off (its
  own for single-author COBs; others' tips must already be in the relay's storage as a seed).
- **Trailers**: `Rad-Resource` (the identity anchor) and `Rad-Related` are unsigned; the
  signature covers only the tree, so the relay validates the resource against real storage.
- The relay does **not** evaluate the CRDT; receivers do that on fetch. The relay only checks
  signatures, resource anchor, sigrefs, and layout.

## Reuse map (existing primitives, do not reinvent)

| Need | Reuse | Location |
|---|---|---|
| COB signature check | `Entry::valid_signatures` | `radicle-cob/src/change/store.rs:133` |
| Sigrefs verify | `SignedRefs::load_at` | `radicle/src/storage/refs.rs:433` |
| Namespace layout check | `ValidateRepository::validate_remote` | `radicle/src/storage/git.rs:655` |
| Write objects/refs | git2 writer trait impls | `radicle/src/storage/refs/sigrefs/git.rs`, `storage/git/cob.rs:149` |
| Resource anchor | `repo::Info.identity` / `DocAt.commit` | `radicle-httpd/src/api.rs` |
| Announce foreign ns | `Node::announce_refs_for` | `radicle/src/node.rs:1093` |
| Handler/body/limit patterns | existing GET handlers | `radicle-httpd/src/api/v1/repos.rs` |
| Browser object building | `cob.ts` (SHA-1 + base64) | `src/lib/passkey/cob.ts` |

## Assumptions and known limitations

- The relay must be seeding the target repo (needs canonical identity objects + real `rad/id`).
- Announcing requires the relay's node to be running; otherwise it is Phase-A (local write only).
- No alias on public seeds: the alias lives in a signed `NodeAnnouncement`, which a keys-only
  identity has no node to emit, so it displays as a bare DID/NID (unchanged from the POC).
- Private repos are out of scope (httpd rejects them today).

## Open questions

- Endpoint naming/shape: single `POST …/namespace` vs a more COB-oriented route.
- Whether to spec the optional read/recovery endpoint now or defer.
- Delta-only vs full-cumulative in the on-the-wire request (the portable file is cumulative;
  the request can be a delta since the relay already seeds prior objects, but full-cumulative
  is simplest for relay-agnosticism). Recommend documenting delta request + cumulative file.

## Verification (of the eventual implementation)

Since this is a spec, verification is about the design's soundness and the path to prove it
later:

- The issue-create path is already proven end-to-end by the POC's `two-node-test.sh`
  (write → announce → replicate → `rad cob log` on a second node) and `prove.sh`. The generic
  COB create+update path is a strict extension of the same mechanics (same signature, sigrefs,
  and announce), so the trust argument carries over.
- When implemented: extend a two-node test to (a) create a non-issue COB and (b) update it
  (append a change), then confirm node B fetches and re-validates both, and that a deliberately
  forked sigrefs is rejected as `Diverged`.