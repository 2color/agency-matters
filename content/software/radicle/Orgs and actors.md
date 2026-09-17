---
title: 
description: 
tags:
  - radicle
  - rips
project: 
created: 2026-09-17
---

# How Orgs relates to Actor Repos

Orgs builds directly on Actor Repos. it is a layer, not a peer.

## The relationship

Actor Repos is the base convention. A Radicle repository whose root identity document carries a `dev.radicle.actor` payload describes a *participant* rather than a project. The RID is the stable identifier, the delegates govern it, and client-facing metadata lives in `.radicle/` on the canonical default branch.

An org is an actor repository with `type: "org"`. Actor Repos defines three types — `person`, `agent`, `org` — specifies the first two, and reserves `org` for the companion Orgs proposal. Orgs fills that slot, which is why it declares `:requires: ... Actor Repos`.

## What Orgs reuses

| Actor Repos provides | Orgs uses it as |
|---|---|
| Delegates = controllers, majority rule | The org's **admins** / multisig |
| RID as stable identifier | The org's identifier |
| `.radicle/` metadata convention | `.radicle/org.json` in place of `profile.json` |
| Two-quorum split (identity vs. default branch) | Admin-set changes vs. member-list edits |
| `profile.json`, forward-extensible | Orgs adds the `orgs` field for the member's half of attestation |
| Consent-statement pattern (bidirectional assent) | Re-run as **membership attestation**: the org lists the member, the member's profile lists the org |
| Reverse lookup (key → actor) | Resolving admin keys to their people for display |

## Where they differ

1. **An org has no bound keys.** Actor Repos separates *controllers*, which govern the identity, from *bound keys*, which act as the actor. An org keeps only the first half: nothing signs as the org, and an org authors no collaborative objects. This is also why admin enrollment is not attested — a consent statement binds a key to an identity it acts *as*, which is not the relationship an admin has to an org.
2. **Orgs relaxes the one-actor-per-key rule.** Actor Repos says a key SHOULD be bound to at most one *individual* actor, and carves orgs out explicitly, so a key can be its own person *and* an admin of any number of orgs.

## History

The Orgs RIP was originally a standalone draft with parallel machinery. It was reframed on 2026-09-07 to sit on top of Actor Repos. This collapsed the duplication — one marker payload, one `.radicle` convention, one profile format — and gave orgs a majority-protected admin set and key-stable, attestable membership.
