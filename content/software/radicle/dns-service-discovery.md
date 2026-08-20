---
title: Node Discovery via DNS-SD
description: Heartwood advertises nodes with a systemd DNS-SD template but does no SRV or DNS-SD lookups of its own. Discovery still lives in external scripts.
tags:
  - radicle
  - aigenerated
project: Radicle
---

## Summary

Heartwood publishes, but does not discover.

The repository ships one systemd template that advertises a node over DNS-SD. No
code in the node queries `_radicle-node._tcp`, and no code reads SRV or TXT
records. Discovery happens in scripts outside the node, and in a DNS zone that a
seed operator generates from a node database.

## What the repository contains

`systemd/dnssd/radicle-node.dnssd` is a
[`systemd.dnssd`](https://www.freedesktop.org/software/systemd/man/latest/systemd.dnssd.html)
unit. Put it in `/etc/systemd/dnssd/` and systemd-resolved advertises the node
over mDNS on the local link:

- `Type=_radicle-node._tcp` — the service type. A different value breaks
  discoverability. The service name is registered with IANA.
- `Name=example` — the instance name from RFC 6763, for example the node alias.
- `Port=8776` — must agree with the node's listen port.
- `TxtText="nid=z6…"` — a TXT record that carries the node's public key.

To answer mDNS queries you must also enable `MulticastDNS` in systemd-networkd.
The template is for systemd users only.

The TXT record is necessary because a Radicle address is `<nid>@<host>:<port>`.
SRV and A/AAAA give the host and the port. Only `nid=` gives the identity that
the Noise XK handshake needs.

## What the node does with a DNS name

The node resolves hostnames with the operating system resolver, and nothing more.

1. `radicle_node::wire::dial` maps `HostName::Dns(name)` to `InetHost::Dns(name)`
   with the port that the address already carries.
2. It then calls `to_socket_addrs`, which reaches the `NetAddr<InetHost>`
   implementation in the `cypheraddr` crate. That implementation is a thin
   wrapper around the standard library, so the lookup is `getaddrinfo`.
3. `dial` keeps the **first** result and calls `TcpStream::connect`.

The consequences:

- The lookup is A/AAAA only. There is no SRV query, no TXT query, and no cache
  of its own.
- If the first address fails, the node does not try the later ones.
- The node never learns an NID from DNS. The NID comes from the address string
  or from gossip, and the handshake verifies it.
- `.local` names do resolve, but only because `getaddrinfo` passes them to
  nss-mdns or systemd-resolved. The node does not know that mDNS is involved.

Two smaller gaps in `radicle::node`:

- `Address::is_local` recognises `localhost` and the private IP ranges, but not
  the `.local` domain. A peer discovered by mDNS therefore counts as routable
  and can be gossiped to the wider network.
- `AddressType::Dns` means only "this peer address is a hostname". It implies
  nothing about service discovery.

## Discussion history

Source: [#heartwood > Service Discovery via DNS (SRV RRs, DNS-SD,
mDNS)](https://radicle.zulipchat.com/#narrow/channel/369277-heartwood/topic/Service.20Discovery.20via.20DNS.20.28SRV.20RRs.2C.20DNS-SD.2C.20mDNS.29).

| Date | Event |
| --- | --- |
| 2025-05-11 | Lorenz Leutgeb adds the systemd template (`e0d18b86`). |
| 2025-05-12 | Proof-of-concept shell script browses `_radicle-node._tcp` with `resolvectl`. |
| 2025-08-20 | Debate on plain SRV records against full DNS-SD. |
| 2025-08-23 | `levitte.org` becomes one of the first third-party domains to advertise a node. |
| 2025-10-11 | A generated zone goes live at `bootstrap.radicle.xyz`. |
| 2025-10-18 | Search starts for a cross-platform discovery library. |
| 2026-01-27 | Objection to any dependency on mDNS. |
| 2026-04-22 | The zone moves to `bootstrap.radicle.network`. |

### Purpose

Bootstrap only. After the first connection, peers arrive through gossip. Two
scenarios motivate the work:

1. A team on one WiFi with no internet uplink. The members discover each other on
   `.local` and continue to work.
2. An organisation that runs several nodes and wants their addresses to stay
   current on every machine, without distribution of files.

### The proof of concept

The script wraps `resolvectl --json=short query` and browses
`_radicle-node._tcp` under a given domain. It later became a personal helper,
`rad dnssd`, which prints a command that is ready to run:

```
$ rad dnssd levitte.org
rad node connect z6Mkh6TfY…@rad.levitte.org:8776
```

That output shows the purpose of each record. SRV gives the host and the port,
TXT gives the NID, and together they make the `nid@host:port` that `Address`
requires. This is also the answer to a request to make `rad node connect`
shorter to type.

### Plain SRV records against DNS-SD

Richard Levitte proposed one SRV record for a domain:

```
_radicle-node._tcp.example.com. IN SRV 0 5 8776 seed.example.com.
```

That is sufficient for unicast DNS. Lorenz prefers DNS-SD because the same
algorithm then covers both unicast DNS and mDNS on `.local`. A plain SRV record
cannot be advertised for `.local` without a multicast responder. DNS-SD needs
the PTR records from RFC 6763 in addition, among them
`_services._dns-sd._udp.{domain}`.

Neither approach is implemented in the node.

### Why nothing landed in the node

Two blockers, both open:

1. **No suitable library.** One abstraction is needed over Bonjour on macOS, the
   native API on Windows, and both Avahi and systemd-resolved on Linux, and it
   must cover `.local` over mDNS as well as normal domains over unicast DNS. The
   best candidate is the [`zeroconf`](https://crates.io/crates/zeroconf) crate,
   which lacks systemd-resolved and native Windows support. A related obstacle is
   that the `libc` crate does not expose `resolv.h`
   ([rust-lang/libc#4611](https://github.com/rust-lang/libc/issues/4611)).
2. **Disagreement about mDNS.** One participant asks the project not to depend on
   `.local` or mDNS at all, because both are unreliable on Linux, and suggests
   plain UDP multicast as in the [LocalSend
   protocol](https://github.com/localsend/protocol#3-discovery). Another
   participant reports that `.local` browsing never worked for them. The
   discussion is unresolved.

Support for unicast DNS alone is described as easy: the node must make the same
queries as the script. Local addresses need more thought, because the node
filters private IPs out of Radicle gossip on purpose, although an announcement
inside the local network is still useful.

## The opposite direction: zone generation

The part that did grow is the export, not the lookup.

A seed exports its address book to a DNS zone. The records are generated from the
`addresses` table of the node database roughly every five minutes. The zone is
live at `bootstrap.radicle.network` and is also served as a plain zone file over
HTTP.

The generator is a script built on `sqlite` and `jq`, so it consumes the schema
in `radicle::node::db` directly. Its bugs were about the shape of that data:

- Addresses of type `dns` hold `host:port` in one column, and a split on the
  colon was missing.
- Onion addresses were emitted as SRV targets, although an SRV target must be a
  real DNS name that resolves to an A or AAAA record.
- Node selection uses the `last_success` column, so a node that a seed never
  dialled does not appear.

The generated records also carry `version=` and `network=` TXT keys. The template
in `systemd/dnssd/` mentions only `nid=`, so it is behind the convention now in
use.

## Open questions

- Which library, if any, can serve all target platforms?
- Is mDNS worth the dependency, or is plain UDP multicast the better answer for
  the local network?
- Should `Address::is_local` treat `.local` as local, to keep mDNS peers out of
  gossip?
- Should nodes advertise companion services, such as an explorer or a CI broker?
  DNS-SD can express this today under other service names. The protocol also has
  a 64-bit feature field that is almost unused.
