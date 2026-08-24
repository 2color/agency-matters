---
title: Content moderation in Radicle
description: The ten design questions that run through the Zulip discussions on content moderation, seeding policy, and shared block lists.
tags:
  - radicle
  - moderation
  - aigenerated
project: Radicle
---

Radicle has no central operator, so every node operator makes their own moderation
decisions. Two Zulip topics discuss how to share those decisions:

- [#General > Content Moderation - pre proposal discussion](https://radicle.zulipchat.com/#narrow/channel/369274-General/topic/Content.20Moderation.20-.20pre.20proposal.20discussion/with/525352044) —
  the design thread, open since June 2025.
- [#General > Community Blocklist](https://radicle.zulipchat.com/#narrow/channel/369274-General/topic/Community.20Blocklist/with/591454605) —
  a stop-gap that works today. It became a separate topic in May 2026.

This document records the topics that the two threads return to again and again. It is
a map of the problem space, not a proposal.

## What exists today

- The node configuration holds one **default** seeding policy: `allow` with a scope, or
  `block`. See `DefaultSeedingPolicy` in `crates/radicle/src/node/config.rs:437`.
- Every specific decision is a row in a SQLite policy store. `rad seed`, `rad block`,
  `rad unblock` and `rad follow` write to it. See
  `crates/radicle/src/node/policy/store.rs`.
- A block changes what your node sees. It has no effect on other nodes.
- The scope of a seeded repository is `all` or `followed`. There is no per-repository
  follow list.

## 1. Allow lists or block lists

A block list subtracts from an open default. An allow list adds to a closed default.
The two give a different result when an unknown repository appears: the block list
seeds it, the allow list does not.

Several people prefer the allow direction. spacefrogg and justarandomgeek argue for a
system of trust relations with a default-block policy. A block list must name every bad
actor before it can help.

## 2. Local or shared lists

Johannes started the thread with this point. Tools to make your own moderation
decisions already exist. You can script over your storage and COB cache, then unseed or
block. What is missing is a way to **use other people's decisions**.

His conclusion is to separate the moderation tools from the distribution of moderation
decisions, and to build the distribution first. If lists compose, one operator can
handpick repositories, another can filter keywords with a script, and a third can
follow both.

ade's block list repository is the first test of this idea. Defelo's question shows the
practical need. How does a seeder keep node policies in sync with a list that changes?

## 3. Per-repository scope as a primitive

Radicle treats `follow` (a node) and `allow` (a repository) as separate relations.
spacefrogg notes the consequence: you cannot say "seed repository set R, but only from
node set N". A per-repository follow list gives exactly that.

This is a reusable primitive rather than a feature. Loris Cro's invite tree needs it. So
does any curated view of one project's issues. Richard Levitte adds one constraint: a
node always follows the delegates of a repository.

## 4. Replication or visibility

Moderation can act on what you store or on what you show. Today only the first lever
exists. To hide a repository, you must not replicate it.

Loris Cro asks for the two to be separate. His example is the Zig repository: the node
seeds everything, but the web UI shows only vouched people. Patches from unvouched
users stay available. Lorenz Leutgeb's workaround is two nodes — a permissive one that
runs `radicle-httpd`, and a `followed`-scope node for local work.

The prize is that a node can be a good host and a curated front page at the same time.
The spam target becomes the vouch tree, not the repository.

## 5. Where the data lives, and how it travels

The threads propose five substrates:

| Substrate                        | Proposed by            | Note                                             |
| -------------------------------- | ---------------------- | ------------------------------------------------ |
| Local SQLite policy store        | current implementation | Per-node state, imperative commands              |
| Node configuration file          | Lorenz Leutgeb         | Reproducible, generated from Nix                 |
| A dedicated git repository       | ade, spacefrogg        | Patch-based list, or `rad auth store` with COBs  |
| Repository identity document     | dazo, fintohaps        | Extensible payload, e.g. `org.dazo.blocklist`    |
| Files inside the project repo    | Vouch (`VOUCHED.td`)   | justarandomgeek calls it a hack                  |

Two questions remain open. Johannes asks how a list travels — over HTTP, or in protocol
messages? Lorenz's point is about reproducibility. If blocks are configuration and not
database state, a node that is rebuilt from a pinned commit has the same block list. ade
notes a tension between run-time blocking and start-up blocking. A hot reload of the
configuration removes this tension.

## 6. Binary trust or earned trust

ade objects to Vouch and Hyperdrive: both models are binary, and a blocked peer is
invisible, so there is no way back in. ade proposes a second tier — proof of work or
stake, chores on a repository, quadratic ranking of staked attention — and rejects
reputation scores.

Johannes and Loris Cro argue the other way. Weights force arbitrary thresholds and make
the system hard to reason about. If the UI hides unvouched content by default, binary
membership is enough. cblgh's trustnet, which fintohaps found, is the middle position
with weights from 0 to 1.

## 7. Transitive trust

This question is not the same as shared lists. Here the question is how far delegation
propagates, and how you compose what you inherit.

- spacefrogg's model has four relations: `sources` and `blocked` are your own
  decisions. `initiators` means "I trust their sources" and `blockers` means "I trust
  their blocks". A fifth state, `undecided`, uses your default policy.
- Hyperdrive uses graph degree with thresholds and weights. Blocks beat trust.
- Scuttlebutt uses a friends-of-friends follow graph.

justarandomgeek wants a tool that folds the lists you follow into one "consensus
result" for you to apply. The model is the adblock filter list, or the Bluesky
labeller, not one global list.

## 8. Whose view a block changes

A Radicle block is local visibility only. Radicle never imposes it on third parties.
This behavior surprises people who expect GitHub semantics, where a ban stops
interaction for everyone.

Three consequences appear in the thread:

- Anyone who is not blocked can clone the repository and serve it elsewhere.
- People you blocked can hold a "shadow" conversation in your issues and patches, if
  they do not block each other. yorgos calls this behavior a feature.
- `rad id update --disallow` controls access to private repositories. It is not a ban,
  so an extension to public repositories is not a small change.

The open question is whether Radicle must ever offer a ban that applies to everyone.

## 9. How expressive a policy must be

istankovic wants a generic framework for programmable seeding policies underneath the
lists, and a convention or DSL to share them. Lorenz Leutgeb wants to express policy as
a decidable logic program in the style of Datalog or Answer Set Programming.

ade went the opposite way on purpose. The block list repository holds flat files and no
computed state, because git and patches work well with files. Whether the lists are
data for an engine, or the whole mechanism, is unresolved.

## 10. Operator liability and default posture

This question is the motivation for the rest. Radicle hosting is anonymous, so a node
operator carries real risk. justarandomgeek does not want to learn about illegal
content on their node from a police officer at the door. istankovic expects trouble as
the network grows, and notes that the gaps are hidden only because the network is
small. Johannes knows operators who stopped their seed nodes.

Two concrete proposals follow. A node seeds a new repository only after some days with
no reports. A default-block policy with trust is better than a default-open policy with
exceptions.

## Also raised

- **Capacity as a non-moral reason to block.** A neutral list of large repositories
  helps small nodes that cannot hold them. justarandomgeek proposed it. The open
  problem is who reports sizes, and how to find invented numbers.
- **Governance of a shared list.** Four questions are open. Who can merge an entry? How
  does a group nominate moderators? How does an appeal work? Is a public record of a
  block fair? Richard Levitte is uneasy about a public denial record that names people.
- **Order of work.** Both ade and Johannes want stop-gaps in user space first, and a
  protocol-level answer later. The two efforts must not block each other.
