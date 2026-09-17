---
title: RIP #2 vs. the identity implementation
description: Where RIP #2 (Identity) no longer matches heartwood. Delegate signatures moved from stacked gpgsig commit headers into identity COB operations, and adoption uses an absolute majority instead of the threshold field.
tags:
  - radicle
  - aigenerated
project: Radicle
---

RIP #2 (Identity) describes how delegates sign a change to a repository's identity document. The cryptographic model in the RIP still holds: a change needs a set of delegate signatures, and the delegate set comes from the previous valid version of the document. But the storage format changed. Heartwood now keeps the identity in a collaborative object (`xyz.radicle.id`), so the RIP text about commit headers is out of date.

## Gap 1: where the signatures live

The RIP puts all delegate signatures on one commit. Each delegate adds one more `gpgsig` header to the same `rad/id` commit:

```
tree c66cc435f83ed0fba90ed4500e9b4b96e9bd001b
parent af06ad645133f580a87895353508053c5de60716
author Buck Mulligan <buck@mulligan.xyz> 1664467633 +0200
gpgsig -----BEGIN SSH SIGNATURE-----
 ...
gpgsig -----BEGIN SSH SIGNATURE-----
 ...
```

The implementation does not do this. A vote is a COB operation, and each operation is its own commit:

|                               | RIP #2                                     | Implementation                                                                                    |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Signature location            | Two or more `gpgsig` headers on one commit | One vote per operation, each operation its own commit with one `gpgsig`                           |
| What the signature covers     | The commit                                 | The identity document blob OID                                                                    |
| Where the signature is stored | Commit header                              | The operation's JSON payload                                                                      |
| History shape                 | Linear chain of document commits           | Identity COB with revisions, sibling votes, and redaction                                         |
| Canonical head                | `refs/rad/id` reset to the newest commit   | Per-delegate `refs/rad/id` COB heads; canonical `refs/rad/id` derived from the accepted revisions |

The relevant parts of the implementation:

- `Action::RevisionAccept` and `Action::RevisionReject` in `radicle::cob::identity` are the vote operations. `RevisionAccept` carries a `signature` field.
- `Doc::sign` in `radicle::identity::doc` signs the canonical JSON blob OID, not a commit. `Doc::verify_signature` checks that signature and rejects any key that is not a delegate.
- Votes accumulate in a per-revision verdict map as `Verdict::Accept(Signature)`.
- `write_commit` in `radicle_cob::backend::git::change` writes exactly one `gpgsig` header per COB entry. That signature belongs to the author of the operation and covers the entry itself. It is not a delegate quorum.
- `Repository::identity_head` returns the canonical `refs/rad/id`, and falls back to `canonical_identity_head`, which walks the remotes and finds the identity COB that goes back to the correct root.

So the signatures are still there, and they still cover the document. They are siblings in a COB history instead of headers on a shared commit.

## Gap 2: adoption uses a majority, not the threshold

The RIP says a change is valid when the number of signatures is greater than or equal to the `threshold` of the previous document. The implementation instead requires an absolute majority of the delegate set, with `Doc::majority` (`delegates.len() / 2 + 1`). The `threshold` field does not control adoption. See [[identity-document-quorum|Identity document quorum rules]].

## What the RIP still gets right

- The RID derivation: canonical JSON, `git hash-object`, then multibase `base58-btc` with the `rad:` prefix.
- The `payload` model, payload IDs in reverse domain-name notation, and the validation rules.
- The trust rule: verify each version with the `delegates` and `threshold` of the parent version, and verify the root against the RID.
- The security properties, including the stale-document attack and why one honest peer defeats it.
