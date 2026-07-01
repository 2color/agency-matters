---
title: Identity document quorum rules
description: How identity document changes are adopted in Radicle; why adoption needs an absolute majority of delegates rather than the threshold field, and why the history must stay linear.
tags:
  - radicle
project: Radicle
---

The rules for adopting a change to a repository's identity document are easy to get wrong, because the `threshold` field looks like it should govern them but does not. This note captures the actual model, drawn from the [#Support > Identity document change not passing quorum]([#Support > Identity document change not passing quorum](https://radicle.zulipchat.com/#narrow/channel/369873-Support/topic/Identity.20document.20change.20not.20passing.20quorum/with/597022756)) thread on the Radicle Zulip.

## Release status

As of **1.9.1** (tagged 2026-05-21) none of the fixes below are released; the work is still in-flight on heartwood patch `712a995` and had not merged to `master` as of late June 2026. So on current releases the following is still broken:

- **Late-arriving forks stick in `Active`.** A competing sibling of an already-adopted revision, or a child of an already-rejected revision, that arrives after the fact is unconditionally marked `Active` and stuck there rather than `Rejected`. This is the original bug in this thread; two peers can end up with different views of the identity head.
- **Reducing the delegate set does not transitively accept an already-passed child.** If a proposal that shrinks the delegate set is `Active` while a follow-up child already gathered a majority under the smaller set, adopting the parent does not then adopt the child.
- **Non-delegate voting is not forbidden.** A key can vote on a revision even when it is not a delegate according to that revision's parent (see [Open question](#open-question)); this remains unfixed even in the patch.

## The confusing case

A repo with 3 delegates and `threshold: 1`:

```json
{
  "delegates": [
    "did:key:z6Mkm8ky…",
    "did:key:z6MkwPUe…",
    "did:key:z6MkrnXJ…"
  ],
  "threshold": 1
}
```

A proposal accepted by 2 of 3 delegates still showed as `active` rather than adopted. Two separate things were at play: a real bug in the identity-COB evaluation, and a misunderstanding of `threshold`.

## Rule 1: adoption requires an absolute majority of delegates

An identity document change is adopted when an **absolute majority** of delegates sign off, independent of the `threshold` value. For 3 delegates that is 2 signatures, whether `threshold` is 1, 2, or 3.

`threshold` does **not** govern identity changes. It controls the **canonical repository head**: how many delegates must have signed the *same commit* on the default branch for that commit to be treated as canonical. It is a separate mechanism from identity governance. This distinction tripped up even a core dev in the thread, who initially wrote tests changing `threshold` expecting it to affect the quorum.

The majority requirement is not new; it predates the identity-evaluation rewrite. It exists specifically to enforce the next rule.

## Rule 2: the identity history must stay linear (no forks)

The identity COB is a chain where each revision has exactly one parent. Requiring a majority to adopt guarantees this stays linear: at most one branch of a competing pair can gather a majority, so there is always a unique winning chain.

The failure mode is creating two proposals against the **same parent**:

```
ac7f147   Remove Frank                        (accepted by 2/3)
99080e4   Add canonical reference rule …       ← same parent, a fork
```

Two revisions sharing a parent form a fork, and only one can ever be adopted. The fix is procedural, not a code change: **stack the new proposal on top of the adopted one** (`ac7f147`) rather than branching a sibling off the shared parent.

## Rule 3: state propagates down the chain

When a revision is adopted, `adopt()` marks competing siblings (same parent) as `Rejected` via `RejectedBy::Sibling`. Descendants of a dead revision are born dead:

- Parent `Rejected` or `Redacted` → child is `Rejected` via `RejectedBy::Parent`.
- Note the asymmetry: a child of a `Redacted` parent is marked `Rejected`, not `Redacted`. `Redacted` means the author actively withdrew the revision; the child was never actively withdrawn, so it is only implicitly rejected.

### The bug

The original evaluation only reconciled revisions already in memory. A **late-arriving sibling of an accepted branch, or a child of an already-rejected revision, was unconditionally marked `Active`** and stuck there. The fix checks the parent's state when a new revision arrives, so a child of a rejected or redacted parent is born `Rejected` (see `crates/radicle/src/cob/identity.rs`).

## Summary

| Rule | Value |
|---|---|
| Signatures to adopt an identity change | Absolute majority of delegates (e.g. 2 of 3) |
| What `threshold` controls | Canonical branch head / signed refs, not identity changes |
| History shape | Strictly linear; no forks (guaranteed by the majority rule) |
| Competing siblings when one is adopted | `Rejected` (by Sibling) |
| Descendants of rejected/redacted revisions | Born `Rejected` (by Parent) |

## Inspecting the state

```sh
rad inspect --identity
rad id
rad cob log --repo $(rad .) --type xyz.radicle.id --object <root-id>
```

`rad cob log` shows each revision with its parent, which is how a fork (two revisions sharing a parent) becomes visible.

## Open question

Late in the thread it was noted that the code still allowed a **non-delegate to vote** on a revision when they were not a delegate according to that revision's parent. This was flagged as something to forbid, so voter eligibility rules may tighten further.
