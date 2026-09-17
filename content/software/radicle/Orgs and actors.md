---
title:
description:
tags:
  - radicle
  - rips
  - aigenerated
project:
created: 2026-09-17
---

# How Orgs relates to Actor Repos

Orgs builds directly on Actor Repos — it is a layer, not a peer.

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

## Schema comparison: `profile.json` and `org.json`

Both files live under `.radicle/` on the canonical default branch, and both describe the entity that owns the repository. They are written at different levels of rigor.

| | `profile.json` (Actor Repos) | `org.json` (Orgs) |
|---|---|---|
| Where defined | Inline in `x-actor-repos.md:355-416` | Standalone `kTbz-orgs/data/org.schema.json`, included by reference |
| `$id` / `title` / `description` | None | All present, with normative prose per field |
| Required | `version`, `displayName` | `version`, `name`, `members`, `repos` |
| Unknown properties | Rejected: properties outside the declared version make the profile invalid | Accepted: `additionalProperties: true`, and consumers must preserve what they do not recognise |
| Identifier validation | None; `links[].url` is a bounded string | `$defs.rid` and `$defs.did` with base58btc patterns |
| Governed by | The actor's controllers, `threshold` 1 recommended, content is cosmetic | The org's admins, `threshold` chosen deliberately, content is authoritative |
| Version rule | Identical in both: one schema per version, fields never redefined, a newer version is read-only |

### What each file holds

`profile.json` is display material for one individual: `displayName`, `fullName`, `pronouns`, `bio`, `location`, `timezone`, `avatar`, `banner` and `links`. Every string is untrusted input that needs NFC normalization and control-character stripping. Nothing in it is load-bearing: a missing or invalid profile leaves the actor intact, only unrendered.

`org.json` is the org's authoritative roster: `name`, `description`, `members` and `repos`. It has no avatar, banner or personal fields. Long-form content goes in `.radicle/profile/README.md`, and an org carries no `profile.json` at all. The `members` array is a `oneOf` over `rad:` entries, which name an actor repository and are attestable, and `did:key:` entries, which name a bare key and are claim-only.

### The shared field

`profile-orgs.schema.json` adds `orgs: [rad:…]` to `profile.json`. This is the member's half of an attestation, matched against the org's `members` entry. Because `profile.json` rejects unknown properties, the addition cannot be independent: the schema's own description says it must arrive as a later profile version agreed with Actor Repos. The two schemas are therefore coupled by version, not only by convention.

### Two inconsistencies

1. **`name` against `displayName`.** The attestation example in `orgs.adoc:238` shows `{"name": "cloudhead", "orgs": [...]}`, but Actor Repos uses `displayName` and reserves `name` for a future unique, claimable name (`x-actor-repos.md:431`). The example contradicts the base schema. The field is correctly `name` in `org.json`, which is a different file.
2. **`additionalProperties` is unenforced in `profile.json`.** The prose says unknown properties invalidate the profile, but the inline schema never sets `additionalProperties: false`. A validator run against it accepts them. Either add the keyword or soften the prose.

## Domain names: neither RIP covers them

Neither Actor Repos nor Orgs mentions DNS, domains or `.well-known` endpoints. The closest hook is Actor Repos' *External attestations* section (`x-actor-repos.md:1021-1042`), which sketches Keybase-style two-way attestation between an actor and an external profile, names `links` and the default branch as the attachment points, and leaves the statement format to a future proposal. A domain is one case of that, unspecified.

A separate draft, *Radicle name bindings* by Eleftherios Diakomichalis (2026-08-20, prototyped on the `atproto-handles` branch of heartwood), works the problem out in full for DNS and AT Protocol handles. Its high-level model is the one to reuse.

### The model

A binding is the claim "name N ↔ identity K", proved in both directions with one fetch:

* The **name side** is proved by where the record lives. Only the zone's owner can write a TXT record under `example.com`.
* The **Radicle side** is proved by a signature inside that record, made by the Radicle key over a versioned, context-separated payload: `rad:dns:link:v1:{domain}:{did}`.

Both halves are necessary. Without the name side anyone could claim any name; without the Radicle side a domain owner could frame any node as theirs. Putting the domain inside the signed payload is the anti-replay measure: a record copied under a different name still carries a signature over the original name, and fails.

The transport is a TXT record, with an HTTPS file as an equivalent form for operators who can edit a webserver but not a zone:

```
_rad.example.com. IN TXT "rad=v1;did=did:key:z6Mkhax…;sig=z3x8mF…"
```

Multiple TXT records are idiomatic DNS, so one domain may name several identities: a seed cluster, or a team.

### Why this does not break local-first

The draft states the rule directly: names resolve *forward* into keys at discovery time, and nothing in the verification path may depend on a name. External naming systems are a phonebook, not an authority. If every one of them disappears, cached names decay to *stale* and replication, verification and collaboration continue untouched.

Three properties carry that rule:

1. **Verification results are cached, never authoritative.** A local store records that a binding verified at a point in time. Deleting it loses no identity and no data. Only a successful end-to-end check writes to it.
2. **Reverse lookup costs no network.** Rendering a key reaches a name from the cache alone, which is the query a client makes for every identity on screen.
3. **The failure modes are display states, not errors.** The draft defines five: *verified*, *asserted* (the name side names a key that has not consented), *plain*, *stale* (verified before, network now unreachable, rendered calmly and never blocking) and *conflict* (the name now proves a different node, rendered loudly). The namespace operator can deny or redirect a lookup but can never forge the Radicle-side signature.

This also supplies the third state the two RIPs lack. Both are careful to separate "the repository does not assert this" from "we cannot tell", but a time-decaying assertion needs *stale* as well.

### How it would compose with actor repositories

The names draft binds a name to a `did:key`, because it predates a stable per-participant identifier. Actor Repos supplies exactly that identifier, and Actor Repos already argues the case: "Because the anchor is the RID rather than any individual key, attestations survive key rotation."

So the natural composition is to bind the name to the actor RID and let the signature come from any bound key. The names draft already has the shape in its repository binding, `rad:dns:repo:v1:{domain}:{rid}:{did}`, where a vouching key signs over an RID; an actor binding is the same form. Verifying against the actor's current key set means a key rotation does not invalidate the record, and a second device needs no record of its own.

Two further points of fit:

* The draft's recommended promotion path, *claims in the identity document* under a payload such as `xyz.radicle.names`, is the same move Actor Repos makes with `dev.radicle.actor`. For an actor repository the claim belongs in the actor's own document or profile, which removes the draft's stated cost that claims become repository-scoped.
* **Orgs cannot make the claim half today.** `org.json` carries only `version`, `name`, `description`, `members` and `repos`, there is no `links` field, and an org carries no `profile.json`. An org has nowhere to assert "we are `example.com`", although DNS is the organisational namespace and the org case is what a domain answers best. This is the one concrete schema gap a follow-up must close.

A domain binding also speaks to the impersonation limit the Orgs RIP names: "an impersonator corroborated by actors it controls is not prevented, only made checkable." A domain is the one attestation source an impersonator usually cannot fabricate.

## History

The Orgs RIP was originally a standalone draft with parallel machinery. It was reframed on 2026-09-07 to sit on top of Actor Repos. This collapsed the duplication — one marker payload, one `.radicle` convention, one profile format — and gave orgs a majority-protected admin set and key-stable, attestable membership.
