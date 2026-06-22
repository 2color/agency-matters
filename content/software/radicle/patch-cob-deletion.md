---
title: COB Deletion in Radicle
description: Why deleting a collaborative object is a soft delete that only drops your local signed ref, not the underlying git data.
tags:
  - radicle
project: Radicle
---

## The CLI gap

`rad cob` has no `delete` subcommand, but the plumbing exists:

- `cob::store::Store::remove` — `crates/radicle/src/cob/store.rs:306`
- `Issues::remove` and `Patches::remove` (via `Cache`) are already used by `rad issue delete` and `rad patch delete`.

Adding `rad cob delete --repo <RID> --type <TYPENAME> --object <OID>` is just CLI wiring. Identity COBs should be rejected, matching the behavior of Create/Update.

### Existing code paths for patches

- **Library entry point**: `radicle::cob::patch::Cache::remove` at `crates/radicle/src/cob/patch/cache.rs:172`.
  - Calls `store::Store::remove` at `crates/radicle/src/cob/store.rs:361`, which drops the COB ref from storage and re-signs `rad/sigrefs`.
  - Then removes the cache entry via `Remove<Patch>`.
- **CLI surface**: `rad patch delete` in `crates/radicle-cli/src/commands/patch/delete.rs:9`, via `term::cob::patches_mut(...).remove(patch_id)`.
- `Patches` itself does not expose a `remove`; deletion must go through the `Cache` wrapper. By contrast, `Issues::remove` is available directly at `crates/radicle/src/cob/issue.rs:842`.

## Why the git object survives deletion — it's a soft delete

`Storage::remove` (`crates/radicle/src/storage/git/cob.rs:169-180`) only deletes the git *reference*:

```
refs/namespaces/<nid>/refs/cobs/<typename>/<oid>
```

```rust
fn remove(&self, ...) -> Result<(), ...> {
    let mut reference = self.backend.find_reference(...)?;
    reference.delete() // deletes the ref, not the objects
}
```

`Store::remove` then calls `self.repo.sign_refs(signer)` to update the signed refs.

The underlying commits, trees, and blobs of the COB's operation history remain in the object store as unreachable objects.

## Consequences

- `rad cob list` hides the COB (no ref to discover), but the data is recoverable if you know the OID.
- Radicle storage is a bare repo, so unreachable objects persist until `git gc` is run explicitly. Even then, if any other ref reaches them, they survive.
- **Deletion is local to your namespace only.** Removal drops *your* namespaced ref (`refs/cobs/<type>/<id>` under your NID) and re-signs `rad/sigrefs`. Other peers who replicated the COB still have their own refs under their own namespaces, so their copies are unaffected — and the COB may reappear on fetch.

## Takeaway

"Delete" in a COB context means "drop my local signed ref," not "destroy the data." This is consistent with a gossip-replicated git model: you cannot unilaterally erase history that other peers may have replicated.
