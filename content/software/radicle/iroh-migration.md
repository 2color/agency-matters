---
title: Migration to iroh
description: Why and how radicle-node moved from the mio/TCP reactor to iroh (QUIC), the design decisions, iroh behaviour that matters, and the open risks.
tags:
  - radicle
project: Radicle
---

This document collects what we know about the move of `radicle-node` from the mio reactor over Noise/TCP to iroh over QUIC. It covers the design decisions, the iroh behaviour that the node depends on, and the open risks. It describes the stack of changes on top of `msnx` ("node: Switch to iroh") as of 2026-10-21. For the thread and channel diagram, see [[architecture#Migration to iroh|Node Architecture]].

## Change history

The migration is a stack of jj changes. The main ones are:

- `okuxyuqz` "radicle: Add iroh address" and `oxoqusxz` "radicle: Change `Address` from struct to enum" add `Address::Iroh`.
- `msnx` "node: Switch to iroh" replaces the transport. It deletes `reactor/`, `wire.rs`, `worker/channels.rs` and the `mio` dependency, and rewrites `runtime.rs` on tokio and iroh.
- `urxyxpwo` "node/runtime: Implement `iroh::protocol::ProtocolHandler`" moves gossip and Git into `GossipProtocolHandler` and `GitProtocolHandler`.
- `ykrsokwt` "node: Remove `crossbeam-channel`" replaces crossbeam with std and tokio `mpsc`.
- `pzswmrxl` "node/runtime: Publish external addresses via iroh" passes `external_addresses` to the iroh endpoint builder.
- `ozpvwpws` "node: Use iroh's `MemoryLookup` to store addresses" gives iroh the known addresses of a peer before a dial. An earlier change, "node: Register direct addresses before dialing iroh peers", did the same job and is no longer in the stack.

## Architecture in brief

- **The service stays synchronous.** `Service` runs on its own std thread (`run_service`). It receives every event as a `ServiceInput` on a std `mpsc` channel, and ticks when no input arrives for 250 ms. It sends each `Io` to the tokio runtime on a tokio unbounded `mpsc` channel. Both channel types are re-exported from `runtime::mpsc`.
- **tokio runs the network.** `main` builds a multi-thread tokio runtime and calls `block_on(Runtime::run())`, so `Runtime::run` runs on the main thread. Its `select!` loop dispatches `Io`, joins network tasks and polls OS signals every 100 ms.
- **iroh owns the sockets.** One iroh `Endpoint` replaces the mio reactor. A `Router` sends each inbound connection to a handler by its ALPN: `radicle/gossip/1` or `radicle/git/1`.
- **No worker pool.** Each Git job runs in `tokio::task::spawn_blocking`. `SyncIoBridge` gives the blocking `radicle_fetch` code `io::Read` and `io::Write` on the QUIC stream.
- **Network presets.** On a Test network, relays are off (`presets::Minimal`). Otherwise the node uses `crate::iroh::presets::Radicle`.

### Why crossbeam went away

Crossbeam was not new in `msnx`; the old reactor and worker pool already used it. In `msnx` only `ServiceInput` and `Controller` still used it, and `ykrsokwt` removed it. Crossbeam channels block the OS thread, so async code can't await them. That suits the synchronous service thread, which is why std `mpsc` now does that job. Async code receives the output side on a tokio channel.

## Design decisions

### Separate connections for gossip and Git

Gossip and Git use separate QUIC connections, not separate streams on one connection. Each `endpoint.connect(id, ALPN)` call makes a new handshake. `dispatch` opens one gossip connection for each peer, and `run_outgoing_git` opens a new connection for every fetch. All connections share the one endpoint and its UDP socket.

ALPN is agreed once per connection, during the TLS handshake. Separate connections therefore give, without extra code:

- **Dispatch by protocol.** The `Router` picks the handler, so the node needs no stream-type header or demultiplexer. Before, `Wire` and `StreamId` did this work.
- **Separate versions.** `radicle/gossip/1` and `radicle/git/1` can change separately.
- **Separate limits.** The gossip handler sets `max_concurrent_bi_streams(1)` and `max_concurrent_uni_streams(0)`. This works only because Git never uses that connection.
- **Separate lifecycles.** A fetch failure or timeout closes only its Git connection. The gossip session stays up.

The cost is one handshake for each fetch. This is small next to a Git fetch (see [iroh behaviour](#iroh-behaviour-that-matters)). The iroh maintainers support this pattern: "We're quite a fan of using multiple connections between the same nodes for different ALPNs", and "adding a 2nd connection is very cheap". The only downside they name is that "the congestion controllers are not aware of each other", which "is usually not a big issue".

### A fetch does not need a gossip session

Before, a fetch went over the gossip peer's TCP connection, so the service refused a fetch to a peer without a session. Now:

- `Io::Fetch` carries the peer's known addresses from the address database, with banned addresses removed. iroh falls back to discovery by node ID.
- A fetch failure or timeout no longer disconnects the gossip peer.
- A gossip disconnect no longer cancels fetches to that peer.
- `dequeue_fetches` goes through the queued fetches, not the connected sessions.

The test `fetch_without_gossip_session` covers this.

### Duplicate gossip connections

Two peers can dial each other at the same time. `GossipProtocolHandler::run` settles this without any message exchange: it compares the two `NodeId`s byte by byte (`PublicKey` derives `Ord`). The node with the higher ID prefers its outbound connection, and the node with the lower ID prefers its inbound one. That is the same QUIC connection, so both sides keep it. A new connection replaces an existing one only if the new one is preferred and the old one is not. A self-connection is closed at once.

`SharedForGossip::jobs` is a generation counter, not a job ID. Each gossip connection takes a new value and stores it in `GossipPeer`. On exit, the connection removes the peer entry and sends `ServiceInput::Disconnected` only if the stored value is still its own. This stops a replaced connection from removing the new connection's entry, or from sending a false disconnect.

### radicle-fetch takes a reader and a writer

`Transport` and `Handle` in `radicle-fetch` now take separate `Read` and `Write` types, not a `ConnectionStream`. The `SignalEof` trait and its "eof" control message are gone. Before, the Git protocol shared one TCP connection with other streams, so the fetcher had to send a special message to say it was done. Now each fetch has its own QUIC stream, and the fetch ends with a zero-length write.

### Shutdown uses two signals

`Runtime::run` stops two kinds of work, so it uses two signals:

- `stopping`, an `Arc<AtomicBool>`, is for the blocking control-socket threads. They can't await a tokio channel.
- A tokio `watch` channel is for the async iroh tasks. `GossipProtocolHandler::run` selects on `shutdown.changed()`.

The order is:

1. A signal or a control command sends `ServiceInput::Shutdown`.
2. `run_service` sends `RuntimeOutput::Shutdown`, and the `select!` loop ends.
3. The runtime sets `stopping` and sends on the `watch` channel.
4. It waits up to `NETWORK_TASK_SHUTDOWN_TIMEOUT` (3 s) for network tasks, then aborts them.
5. It waits up to `IROH_SHUTDOWN_TIMEOUT` (3 s) for `Router::shutdown`.
6. It joins the control thread, then the service thread.

The control listener is now non-blocking and checks `stopping` every 25 ms. The `Command::Subscribe` loop must also check `stopping`. If it doesn't, a `rad node events` subscriber keeps its handler thread alive, and the join in step 6 hangs.

## iroh behaviour that matters

These notes are from the iroh 1.1.0 source and docs.

- **Connections to one peer share state.** iroh runs one `RemoteStateActor` for each remote endpoint. Its doc comment says: "This actor manages all connections to the remote endpoint. It will trigger holepunching and select the best path." A new gossip or Git connection joins the existing actor, so it reuses the known path and does not start hole punching again.
- **Path data outlives connections.** The actor stays alive for 60 s after its last connection closes (`ACTOR_MAX_IDLE_TIMEOUT`), "to keep data about previous path around for subsequent connections".
- **0-RTT is possible but not used.** iroh caches TLS tickets for 0-RTT: by default 8 for each remote endpoint and 32 endpoints. `run_outgoing_git` uses a plain `connect`. 0-RTT data can be replayed, so adding it needs care.
- **`Endpoint` does not pool connections.** Reuse is the application's job. The maintainers point to `iroh-willow` as an example and advise against `WeakConnectionHandle`.
- **`MemoryLookup` does not take priority.** `AddressLookupServices::resolve` queries all lookup services at the same time (memory, Pkarr, mDNS, DHT) and merges the results. `MemoryLookup` usually answers first, because it does no network I/O. The dial starts as soon as the first addresses arrive. Later results add to the set of paths and do not replace earlier ones. An unknown node ID returns `None`, so other services handle it. A lookup starts only when no path is selected and no lookup is running. Addresses passed directly in an `EndpointAddr` go in first.

## Risks and open questions

- **No limit on concurrent Git jobs.** `GitProtocolHandler` accepts every inbound Git connection and starts a `spawn_blocking` job for it. `worker::Config::capacity` is stored but not used, so `config.workers` has no effect. The only limit is tokio's blocking pool, which allows 512 threads by default. A peer can open many Git connections and keep many `upload-pack` processes busy. Authorization still runs (`is_authorized`), but any public repository can be fetched many times in parallel. Suggested fix: a `tokio::sync::Semaphore` around `run_git_worker`, sized from `config.workers`, plus a limit for each peer. Requests over the limit should fail at once with a clear close reason. Don't set `max_blocking_threads` to `config.workers` instead, because DNS lookups (`lookup_host`) share the blocking pool.
- **The Git connection has no stream limits.** Unlike the gossip handler, `GitProtocolHandler` does not set stream limits. It accepts one stream, and the connection closes when `run` returns. On the serving side, `recv.take(limit)` uses the default `FetchPackSizeLimit`. This caps the bytes the peer sends (its upload-pack request), not the size of the pack we send.
- **One handshake for each fetch.** If this cost matters, keep one Git connection open for each peer and open a new stream for each fetch. That keeps the separate ALPN. 0-RTT is another option.
- **Tor, I2P and proxies are not supported.** The node fails at startup if a SOCKS5 proxy, Tor or I2P is configured. When dialing, Tor and I2P addresses are skipped with a warning. TODOs suggest custom iroh transports (`iroh::TransportAddr::Custom`).
- **Port docs changed.** `listen`, `ConnectAddress` and `Address` now say UDP port where they said TCP port. Existing configs and firewall rules that open only TCP will not work.
- **Announcements always include iroh.** The node announcement adds `Address::Iroh` when there is room, and each bootstrap seed gets an iroh connect address.

### Small cleanups (suggested only)

- Rename `SharedForGossip::jobs` to `generation` or `session`. It is a different counter from `SharedForWorker::jobs`, which is a real job ID returned in `TaskResult`.
- The "wake" connect to the control socket after `stopping` is set may be unneeded, because the listener checks the flag every 25 ms. It also runs only for a bound socket, not for a socket from systemd.
- `stopping` could use `Relaxed` ordering, because it carries no other data. `Release`/`Acquire` is also correct.
- `NETWORK_TASK_SHUTDOWN_TIMEOUT` has a TODO asking whether it should be configurable.

### Resolved

- The handle error variant `ReceiveServiceTimeount` is renamed to `ReceiveServiceTimeout` in the working copy.
- `crossbeam-channel` is removed (`ykrsokwt`).

## Sources

- [How should I handle connection management/reuse · iroh Discussion #3087](https://github.com/n0-computer/iroh/discussions/3087)
- [Endpoints - iroh docs](https://docs.iroh.computer/concepts/endpoints)
- [Write your own Protocol - iroh docs](https://docs.iroh.computer/protocols/writing-a-protocol)
- The iroh 1.1.0 crate source: `socket::remote_map::remote_state`, `tls` and `address_lookup`.