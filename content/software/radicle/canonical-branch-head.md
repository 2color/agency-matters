---
title: Canonical branch head determination
description: How Radicle computes the canonical head of the default branch from delegate refs; how the threshold and merge-base quorum interact, why divergence freezes the canonical head, and why each node computes it locally so delegates can transiently disagree.
tags:
  - radicle
project: Radicle
---

This note describes how a repository's canonical branch head (the top-level `refs/heads/<default>`) is computed from the delegates' individual branches, and how the `threshold` field actually behaves. The surprising parts are that `threshold` does not let a single delegate move the canonical head unilaterally, that a fork among delegates freezes the canonical head rather than picking a winner, and that the head is computed locally per node so two delegates can transiently disagree.

The relevant code lives in the `radicle::git::canonical` module (`crates/radicle/src/git/canonical/`), with the fetch-side wiring in `radicle-node`'s worker and the push-side wiring in `radicle-remote-helper`.

For how `threshold` differs from identity-document governance, see [identity-document-quorum.md](identity-document-quorum.md).

## What canonical means here

Each delegate pushes to their own namespace, `refs/namespaces/<did>/refs/heads/<default>`. The top-level `refs/heads/<default>` is a real, persisted git reference that a node computes and writes; delegates never write it directly. It is the commit a plain `git clone` of the repo ends up on.

The canonical head is computed by `Repository::canonical_head`: pick the most-specific rule for the branch, gather one object per delegate, then run a quorum. Note that `Repository::head` returns the local `HEAD` if one is already set and only falls back to `canonical_head` otherwise.

## The quorum algorithm

### 1. Gather objects (local refs only)

The `FindObjects` implementation iterates the allowed DIDs and resolves each delegate's namespaced branch ref *in that repository*. A delegate whose ref is not present locally is recorded as a missing ref and skipped; it does not count and does not block. This is the root of the distributed behaviour below: the quorum only ever sees the refs a given node currently holds.

### 2. Vote

`CommitVoting` (in the `voting` submodule) gives each delegate's tip one vote. When a merge base is computed between two candidates, a bonus vote is added to a commit only when it is a *linear ancestor* of another candidate. `MergeBase::linear` returns the base only when it equals one of the two endpoints, so a true fork adds no bonus vote. `Votes::candidates_past_threshold` then drops every commit with fewer than `threshold` votes.

### 3. Reconcile the survivors

`CommitQuorum::find_quorum` (in the `quorum` submodule) walks the survivors and requires them to collapse into a single fast-forward chain:

- if a candidate is a descendant of the current best, advance to it (the tip);
- if it is an ancestor of, or equal to, the current best, keep the current best;
- otherwise the two genuinely fork, and it returns a `DivergingCommits` error.

The result is the tip commit that every survivor is an ancestor of. There is no merge synthesis and no "most votes wins" among forks.

Tags use a simpler rule: filter by threshold, and if more than one distinct tag survives it is an immediate `DivergingTags` failure.

## What `threshold` really means

`threshold` is the number of votes a commit needs to *be a candidate*, applied before the fast-forward walk. It is not "how many delegates are needed to move the head".

The consequence for `threshold: 1` is counter-intuitive: every delegate tip has one vote, so every delegate is a mandatory candidate, and all of them must reconcile into one chain. So `threshold: 1` does not mean any single delegate can set the head; it means a fork by any one delegate is enough to fail the quorum.

## Worked example: threshold 1, two delegates

Shared history with one diverging commit each:

```
   A       B
    \     /
     o  base (C)
     |
```

- Votes start `{A:1, B:1}`. Merge base of `A` and `B` is `C`, which is neither, so `linear` returns nothing; no bonus vote. Votes stay `{A:1, B:1}`.
- `candidates_past_threshold(1)` keeps both.
- The walk seeds a current best, compares the other candidate, finds their base is neither endpoint, and returns `DivergingCommits`.

So there is no canonical head; the fork is reported, not resolved.

Contrast: if `B` were a descendant of `A` (a fast-forward, not a fork), reconciliation advances to the tip `B`, and `B` becomes canonical. That is the only sense in which `threshold: 1` "picks a winner": the longest linear chain, never an arbitrary side of a fork.

## Divergence freezes the head, it does not reject the push

When a node fetches a delegate's diverging update, the update into that delegate's own namespace is validated and accepted; only the canonical recomputation fails, and it fails softly. The fetch worker's `set_canonical_refs` force-writes the top-level ref only on a successful quorum; on a `DivergingCommits` error it logs a warning and continues, leaving the existing ref untouched.

Because the existing ref is never touched on failure, the top-level `refs/heads/<default>` stays at whatever it last successfully computed. The local push path behaves the same way: the remote helper's canonical error handler treats `DivergingCommits` as recoverable, warning "it is recommended to find a commit to agree upon" and letting the push through.

A notable corollary at `threshold: 1`: once one delegate has diverged, the head will not advance even if another delegate keeps pushing further ahead, because the quorum keeps failing. The head is frozen at the last successful value until the fork is reconciled.

## Why delegates can transiently disagree

Canonical is computed locally, per node, over only the refs that node holds. There is no distributed lock at push time.

If two delegates push diverging commits while offline or before syncing:

- On delegate 1's node, only `A` is visible, so the quorum cleanly yields `A` and their local head advances to `A`.
- On delegate 2's node, only `B` is visible, so their local head advances to `B`.

Both are valid quorums from each node's vantage point. The conflict only materialises once a node holds *both* refs (after gossip or a shared seed sync). At that point the quorum on that node hits `DivergingCommits` and the head freezes.

This is eventual consistency by design: nodes optimistically advance their own head, and divergence is detected and frozen at merge time rather than prevented at push time. Resolution is human: one delegate fast-forwards to include the other's commit, or they agree on a merge, after which the quorum can produce a single tip again.

## Summary

| Question | Answer |
| --- | --- |
| What sets the top-level `refs/heads/<default>`? | The node, on fetch/push, via a quorum over delegate refs; delegates only write their own namespace |
| What does `threshold` control? | Votes needed to *be a candidate*, not how many delegates move the head |
| `threshold: 1`, two delegates forked | `DivergingCommits`; no canonical head produced |
| `threshold: 1`, one delegate ahead (fast-forward) | The tip wins (longest linear chain) |
| Effect of a diverging push | Accepted into the delegate's namespace; canonical recomputation soft-fails and the top-level ref is left frozen |
| Two delegates push diverging commits offline | Each node advances its own head locally; the conflict surfaces and freezes only after they sync |
