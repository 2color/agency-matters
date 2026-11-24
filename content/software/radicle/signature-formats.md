---
title: Signature formats
description: How Radicle packages its ed25519 signatures, from bare 64-byte sigrefs to the non-standard SSHSIG-armored COB commits, and what a COB change signature does and does not protect.
tags:
  - radicle
project: Radicle
---

Radicle uses ed25519 for all cryptographic signatures. The signing primitive is the same everywhere: a plain ed25519 signature over the raw payload bytes, produced via `signature::Signer::try_sign` (the `Signer` trait in `crates/radicle-crypto/src/lib.rs`). The 64 resulting bytes are packaged differently depending on where they are stored.

## Where the signatures come from

Two production `Signer` implementations produce the underlying 64-byte signature:

- **`AgentSigner`** (`radicle_crypto::ssh::agent`). Signs via ssh-agent IPC. The agent receives the raw payload bytes and returns the raw 64-byte ed25519 signature.
- **`MemorySigner`** (`radicle_crypto::ssh::keystore`). Signs locally with an in-memory `SecretKey` loaded from the on-disk Keystore (passphrase-decrypted). Calls `secret.sign(msg, None)` directly.

Both produce identical output for the same key and payload, because ed25519 is deterministic (RFC 8032). The other `Signer` impls in the tree (`Device`, `BoxedSigner`, `BoxedDevice` in `radicle::node::device`) are generic wrappers that delegate to one of these two.

## 1. Bare 64-byte signature

Used for signed refs (sigrefs), identity documents, and most internal protocol messages.

The raw `ed25519::Signature` is stored as-is. For display and serialisation it is multibase base58btc-encoded.

- Encoding: `impl Display for Signature` in `radicle_crypto`.
- Parsing: `impl FromStr for Signature` in `radicle_crypto`.
- Verification: `PublicKey::verify` in `radicle_crypto`. Calls `ed25519::PublicKey::verify(payload, signature)` directly on the raw payload.

## 2. SSHSIG-armored PEM

Used for collaborative-object (COB) change commits. Embedded in the commit's `gpgsig` header as a `-----BEGIN SSH SIGNATURE-----` block.

The raw 64-byte signature is wrapped into an `ssh_key::SshSig` envelope with namespace `"radicle"` and hash algorithm `Sha256`.

- Encoding: `ExtendedSignature::to_pem` in `radicle_crypto::ssh`.
- Parsing: `ExtendedSignature::from_pem` in `radicle_crypto::ssh`. Extracts the public key and raw 64-byte signature from the envelope.
- Sign path: `change::Storage::store` for `git2::Repository` in `radicle_cob::backend::git::change` signs `revision.as_bytes()`, then `write_commit` puts the `to_pem` output into the `gpgsig` header.
- Verify path: `Entry::valid_signatures` in `radicle_cob::change::store` calls `verify(self.revision.as_ref(), sig)`.

Section 3 explains what `revision` is and what this signature protects.

### Non-standard SSHSIG quirk

The bytes inside the armor are not a standards-compliant SSHSIG signature. OpenSSH's `ssh-keygen -Y sign` signs the SSHSIG inner framing:

```
"SSHSIG" ‖ string(namespace) ‖ uint32(0) ‖ string(hash_algorithm) ‖ string(HASH(payload))
```

Radicle skips this step. The bytes inside the armor are a plain ed25519 signature over the raw payload (the COB tree OID), exactly like the bare-signature case above. The SSHSIG envelope is used purely as a transport packaging that fits into a git `gpgsig` header.

Consequence: `ssh-keygen -Y verify` will reject any signature heartwood produces, and any signature `ssh-keygen -Y sign` produces will fail heartwood's verification. The two flows share an envelope but not a signing scheme.

The `namespace` and `hash_algorithm` fields are decorative for verification. They are fixed to `"radicle"` and `"sha256"` only so that `to_pem` output is byte-stable.

## 3. How COB changes are signed

This section explains the COB signature in detail. It is the background for two security issues:

- **Forged identity resource**: any user can act as a delegate on a patch or issue with a fake identity document.
- **Action replay**: any user can replay a signed action on another COB.

Both issues come from one fact: **the signature covers the commit tree, and nothing else in the commit.**

### Terms

- **COB** (collaborative object): a patch, issue, identity, or other object that many users edit. Each COB is a DAG (directed acyclic graph) of git commits.
- **Change** (or **entry**): one commit in that DAG. In code it is `radicle_cob::Entry`, and later `radicle::cob::Op`.
- **Object id**: the commit id of the root change of the COB.
- **Action**: one JSON operation in a change, for example `assign`, `label`, or `lifecycle`. A change holds one or more actions.
- **Delegate**: a key that the repository's identity document lists in `delegates`. Delegates can do all actions on patches and issues.
- **Identity document**: the file `embeds/radicle.json` in a revision of the identity COB (`xyz.radicle.id`). It names the delegates and the threshold.

### Anatomy of a change commit

Each user keeps their own tips of a COB under their namespace:

```
refs/namespaces/<user>/refs/cobs/<typename>/<object-id>
```

A node loads a COB from all these tips together. The tip commit of a change looks like this:

```
commit  c3d4…                                  ← change id (EntryId)
├─ tree        9a8b…                           ← SIGNED: the 20 raw bytes of this id
│  ├─ manifest       {"typeName":"xyz.radicle.patch","version":1}
│  ├─ 0              {"type":"assign", …}      ← action blobs, by index
│  ├─ 1              …
│  └─ embeds/        (optional files, for example images)
├─ parent      <previous change tips>          ← NOT signed
├─ parent      <identity commit>               ← NOT signed (also the resource)
├─ parent      <related commits>               ← NOT signed
├─ author      name <email> <time>             ← NOT signed, ignored
├─ committer   name <email> <time>             ← NOT signed, gives the timestamp
├─ gpgsig      -----BEGIN SSH SIGNATURE-----   ← public key + signature over the tree id
│              …
│              -----END SSH SIGNATURE-----
│
│  <message>                                   ← NOT signed
│
│  Rad-Resource: <identity commit>             ← NOT signed
│  Rad-Related:  <related commit>              ← NOT signed
```

### Write path

`change::Storage::store` for `git2::Repository` (in `radicle_cob::backend::git::change`) writes a change in this order:

1. `write_manifest` builds the tree: the `manifest` blob, one blob per action (named `0`, `1`, …), and the `embeds/` tree. The tree id is called the **revision** in code.
2. `ExtendedSignature::try_sign(signer, revision.as_bytes())` signs the 20 raw bytes of the tree id. The signature is now final. Nothing that follows goes into it.
3. `write_commit` writes the commit with:
   - the parents: the current tips of the COB, the related commits, and the resource;
   - the `gpgsig` header: the signature from step 2, in SSHSIG armor;
   - the trailers: `Rad-Related` for each related commit, and `Rad-Resource` for the resource;
   - the author and committer from git config, with the current time.

For patches and issues, the resource is the identity head at write time. Honest clients get it from `repository.identity_head()` (see `Patches::open` and `Issues::open` in `radicle::cob`, which store it for later writes).

### Read path

A node reads a COB in these steps:

1. **Collect the graph.** `ChangeGraph::load` (in `radicle_cob::change_graph`) starts from every tip ref of the object, in every namespace. It walks the parents and loads each commit with `change::Storage::load`.
2. **Split the parents.** `load` reads the trailers. A parent that is also a `Rad-Resource` or `Rad-Related` trailer is removed from `Entry::parents`. The remaining parents are the change's COB parents. The resource becomes `Entry::resource`.
3. **Read the signature.** `load` reads the one `gpgsig` header. It rejects a commit with zero or two signatures. The key in the SSHSIG envelope becomes the signer.
4. **Verify.** `ChangeGraph::evaluate` calls `Entry::valid_signatures` for the root and for each later change. This checks the signature against `Entry::revision`, which is the tree id. If the check fails, the node prunes that change **and every change that descends from it**.
5. **Make an `Op`.** `TryFrom<&Entry> for Op` (in `radicle::cob::op`) sets:
   - `Op::author` = the key from the signature (`Entry::author`). The git `author` header is not used.
   - `Op::timestamp` = the committer time.
   - `Op::identity` = `Entry::resource`.
   - `Op::actions` = the decoded action blobs.
6. **Authorize and apply.** For patches and issues, `Patch::op`, `Patch::from_root`, `Issue::op` and `Issue::from_root` call `Op::identity_doc` to load the identity document at `Op::identity`. Then `Patch::authorization` and `Issue::authorization` check `Op::author` against that document. If `doc.is_delegate(author)` is true, every action is allowed.

### What the signature proves

| Part of the change | Signed? | Used for |
| --- | --- | --- |
| Tree: `manifest`, action blobs, `embeds/` | Yes | What the change does |
| Signer key in `gpgsig` | Yes (the signature verifies against it) | Who made the change (`Op::author`) |
| COB parents | No | Where the change sits in the DAG, and which object it belongs to |
| Object id (root commit) | No | Which COB the change belongs to |
| `Rad-Resource` (and its parent link) | No | Which identity document authorizes the change |
| `Rad-Related` | No | Extra dependencies |
| Committer time | No | Order of concurrent changes, displayed time |
| Author header | No | Not used |
| Message | No | Not used for evaluation |

So the signature proves only one claim: **"this key approved this tree."** It does not say on which object, after which change, at which time, or under which identity revision. The node decides those facts from unsigned data.

The tree contains no context. The `manifest` names only the type and version. The action blobs name no object id. So the same tree is valid on any object of the same type.

### Consequence 1: the resource decides authority (forged identity resource)

Step 6 of the read path trusts `Op::identity`, which is the unsigned `Rad-Resource` trailer. Before the fix, `Op::identity_doc` called `ReadRepository::identity_doc_at`, which calls `Doc::load_at`. `Doc::load_at` reads `embeds/radicle.json` from **any** commit. It did not check that the commit is a revision of the repository's identity COB.

The attack:

1. Mallory is not a delegate. They write a commit `f0f0…` that is not in the identity COB. Its tree has `embeds/radicle.json`: a copy of the real document, with Mallory added to `delegates`.
2. Mallory writes a patch change with an `assign` action. They sign it with their own key. They set `Rad-Resource: f0f0…`. The resource is also a parent, so `f0f0…` replicates with the change.
3. A node loads the patch. Step 4 passes, because the signature is Mallory's and it is valid.
4. Step 6 loads the document at `f0f0…`. It names Mallory as a delegate, so `authorization` returns `Allow`.

```
commit  c3d4…                       ← Mallory's change, signed by Mallory
├─ parents:   <patch tip>, f0f0…    ← the resource is also a parent
├─ trailer:   Rad-Resource: f0f0…
└─ tree
   └─ 0          (action: assign)

commit  f0f0…                       ← not in the identity COB
└─ tree
   └─ embeds/radicle.json          ← delegates: [Maya, Mallory]
```

Note that this attack does not need the signature gap. Mallory signs their own change honestly. The flaw is that the node trusts the document that the change itself names.

**Fix (this branch).** `Op::identity_doc` now calls `ReadRepository::identity_revision_doc` instead of `identity_doc_at`. That function loads the identity COB (`Identity::load`) and looks up the commit with `Identity::revision`. If the commit is an accepted revision, it returns the document of that revision. If not, it returns `None`. Then the patch or issue returns `Error::MissingIdentity`, and the node prunes the change and its descendants. Honest clients always cite the identity head, which is an accepted revision, so honest COBs evaluate the same.

**Gap that stays open.** A real but old revision still passes `identity_revision_doc`. A removed delegate can cite an old revision that still names them. To stop this, a node must judge each change against the current revision, not the cited one. That breaks honest changes made before the removal, so it is a separate open decision.

### Consequence 2: a signed tree can be moved (action replay)

The signature is not bound to the parents, the object id, the timestamp, or the message. So anyone with a copy of the repository can take a change that Maya signed and put it in a new commit:

```
Maya's change on issue #1             Mallory's copy on issue #2
──────────────────────────            ──────────────────────────
tree     9a8b…  (close)        ──►    tree     9a8b…  (same)
gpgsig   <Maya's sig>          ──►    gpgsig   <Maya's sig>  (same)
parent   <issue #1 tip>               parent   <issue #2 tip>       ← changed
parent   <identity head>              parent   <identity head>
committer <t1>                        committer <t2>                ← may change
```

The new commit has a new id, but the same tree and the same `gpgsig`. Mallory publishes it under their own ref for issue #2. A node loads issue #2:

- Step 4 passes, because the signature is valid for tree `9a8b…`.
- Step 5 sets `Op::author` to Maya's key.
- Step 6 allows the action, because Maya is a delegate.

Issue #2 is now closed, and the history says that Maya closed it. Mallory needs no key.

The same gap gives these variants:

- **Replay in the same COB.** Maya closes issue #1, then reopens it. Mallory puts the old `close` tree on top of the newest change. The issue closes again, "by Maya".
- **Duplicate entry.** Mallory changes only the timestamp or the message. The result is a second entry id with the same action and author. A duplicate `comment` or `revision` shows twice.
- **Duplicate object.** Mallory does the same with a root change. The result is a new object "created by" Maya, with her original content.

An action can move to another object only if it names no id from inside the source object. For example, issue `lifecycle`, `label`, `assign`, and `edit` move freely. A `comment.edit` or `review` names a comment or revision id, so it does not apply on another object.

#### Why the identity COB is mostly safe

Identity revisions have a second signature layer. A `revision` or `revision.accept` action carries a bare signature (format 1) over the OID of the document blob (`Doc::sign`). `Identity::action` (in `radicle::cob::identity`) checks it with `Doc::verify_signature` against the delegates of the **parent** revision, not against `Rad-Resource`. Also:

- A replay of an accepted revision fails, because its parent is no longer the current revision.
- A replayed verdict is a `DuplicateVerdict`, because each delegate has one verdict per revision.

Replay can still bring back a rejected, redacted, or pending proposal as a new active proposal. It still needs the other delegates' votes.

### Why a fix is hard

A fix must bind the signature to more of the commit, for example the parents and the resource, or the full commit bytes. Two facts about today's readers limit the options:

- A reader that cannot verify a change prunes it **and every descendant** (step 4 of the read path). If a new writer uses a format that old readers cannot verify, the object freezes for every old reader from that change on.
- Old readers verify only one `gpgsig` header, against the tree id. They reject a change with two `gpgsig` headers. They ignore unknown headers and unknown manifest fields. They prune a change with an unknown action type.

So a new signature must live in a place that old readers ignore, while the old tree signature stays. The action replay issue lists the options that were rejected and why. The work is on branch `fix/cob-action-replay`.

### Summary

| Question | Answer from the code |
| --- | --- |
| What bytes are signed? | The 20 raw bytes of the commit's tree id. |
| How is it packed? | SSHSIG armor in the `gpgsig` header, without the SSHSIG inner framing (see section 2). |
| Who is the author? | The key in the signature. Not the git author header. |
| Which object does a change belong to? | The object whose DAG reaches it. Not signed. |
| Which identity authorizes it? | The `Rad-Resource` trailer. Not signed. Since the forged identity resource fix, it must be an accepted identity revision. |
| What if a signature fails? | The change and all its descendants are pruned. |

## Implications for external tooling

Anything generating signatures heartwood will accept (browser clients, alternative signers) must:

1. Sign the raw payload directly with ed25519. Do not build the SSHSIG inner framing.
2. For COB commits: sign the 20 raw bytes of the tree id, then wrap the resulting 64 bytes in an SSHSIG envelope with namespace `"radicle"` and hash algorithm `"sha256"`, to match `ExtendedSignature::to_pem` byte-for-byte. Set `Rad-Resource` to the current identity head, or delegate actions will be denied.
3. For everything else: emit the bare 64 bytes; multibase-encode if a string form is needed.
