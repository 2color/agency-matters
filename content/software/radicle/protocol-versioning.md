---
title: Protocol Versioning in Heartwood
description: How Heartwood's rigid version checks compare to Iroh's TLS ALPN negotiation, and why version bumps are a flag day.
tags:
  - radicle
project: Radicle
---

## Current State

Heartwood has two layers of protocol versioning, both of which are rigid — they accept only an exact match, with no way for two peers to negotiate a common version.

### Layer 1: Wire-Level Version

Every frame begins with a 4-byte magic: `rad` followed by a version byte (`PROTOCOL_VERSION`).

```rust
// crates/radicle-protocol/src/wire/frame.rs
pub const PROTOCOL_VERSION_STRING: Version = Version([b'r', b'a', b'd', PROTOCOL_VERSION]);
```

The `Decode` impl does a strict equality check:

```rust
impl wire::Decode for Version {
    fn decode(buf: &mut impl Buf) -> Result<Self, wire::Error> {
        let mut version = [0u8; 4];
        buf.try_copy_to_slice(&mut version[..])?;

        if version != PROTOCOL_VERSION_STRING.0 {
            return Err(wire::Invalid::ProtocolVersion { actual: version }.into());
        }
        Ok(Self(version))
    }
}
```

If the bytes don't match exactly, the connection is rejected immediately. There is no "I speak v1 and v2, what do you speak?" exchange.

This means a new wire format cannot be deployed without breaking connectivity with all existing nodes.

### Layer 2: Application-Level Version

`PROTOCOL_VERSION: u8 = 1` (defined in `radicle/src/node.rs`) is exchanged inside `NodeAnnouncement` gossip messages. This is slightly easier to evolve because it's a field in a message rather than a connection gate — but it still has no negotiation. A node announces its version, but there's no mechanism for two nodes to agree on the highest version they both support or to fall back gracefully.

### The Core Problem

Both layers are take-it-or-leave-it. Real protocol evolution needs negotiation (e.g., TLS's `ClientHello` lists supported versions and the server picks one). Without that, any version bump is a flag day: every node must upgrade simultaneously or the network partitions.

## How Iroh Solves This

Iroh (built on QUIC/TLS 1.3) uses **TLS ALPN (Application-Layer Protocol Negotiation)**, which is built into the QUIC handshake itself.

### The Mechanism

Each protocol declares a versioned ALPN string, e.g.:
- `b"/iroh-bytes/4"` for blobs
- `b"/iroh-gossip/1"` for gossip

**Accept side** registers all versions it supports, in preference order:

```rust
Router::builder(endpoint)
    .accept(b"/my-protocol/2", HandlerV2)
    .accept(b"/my-protocol/1", HandlerV1)
    .spawn();
```

**Connect side** offers its preferred version plus fallbacks:

```rust
let opts = ConnectOptions::new()
    .with_additional_alpns(vec![b"alpn/1".to_vec()]);
endpoint.connect_with_opts(addr, b"alpn/2", opts).await?;
```

During the TLS handshake, the server picks the best version both sides support. No application data has been exchanged yet — version agreement is atomic with connection establishment.

### Why This Avoids the Heartwood Problem

- **Gradual rollout:** A node supporting v1+v2 can talk to old v1-only peers (negotiates v1) and new v2 peers (negotiates v2). No flag day needed.
- **Fail-fast:** If there's no version overlap, the TLS handshake fails cleanly — no silent corruption or ambiguous state.
- **Zero extra round trips:** ALPN is part of the TLS handshake, so there's no separate capability exchange step.
- **Per-protocol isolation:** Iroh uses separate QUIC connections per protocol (not multiplexed streams), so upgrading one protocol's version doesn't affect others.

### The Contrast

Heartwood's `Decode` for `Version` does `if version != PROTOCOL_VERSION_STRING → error`. That's a binary "same or die" check. Iroh's ALPN is fundamentally a set-intersection: "here's what I speak, here's what you speak, let's pick the best match."

### Limitations of the ALPN Approach

- Connection-scoped only — there is no built-in way to discover which protocol versions a remote peer supports before attempting a connection. Compatibility is discovered by trying to connect.
- Each ALPN version bump requires explicit code changes — there is no automatic feature/capability negotiation within a protocol version.
