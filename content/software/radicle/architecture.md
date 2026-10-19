---
title: Node Architecture
description: The threads radicle-node runs, how they communicate over channels, and how a git fetch flows through the system.
tags:
  - radicle
project: Radicle
---

This document describes the high-level architecture and concurrency model
of `radicle-node`: the threads it runs, how they communicate, and how a
git fetch flows through the system. The networking event loop itself is
described in more detail in [event-loop.md](event-loop.md).

## Threads

The node is organised around a single core thread plus a few supporting
threads. State that belongs to the protocol lives entirely on the core
thread, so it needs no locking; blocking work is pushed out to a worker
pool.

- **`service`** — the core thread. Runs the reactor event loop, which
  drives `Wire` (the reactor's `ReactionHandler`, in
  `crates/radicle-node/src/wire.rs`) and, through it, the `Service` (the
  protocol state machine: gossip, repositories, peers). Note that
  `Service` lives in the `radicle-protocol` crate
  (`crates/radicle-protocol/src/service.rs`) and is re-exported by the
  node; the wire *format* (`Encode`/`Decode`, `Frame`) is also in
  `radicle-protocol` (`crates/radicle-protocol/src/wire.rs`), distinct
  from the node-side `Wire` handler. The thread itself is spawned in
  `runtime.rs` via `Reactor::new`. See
  [crate-organisation.md](crate-organisation.md) for how the crates
  divide this work.
- **`control`** — listens on the Unix control socket for `rad` CLI
  commands and spawns a short-lived thread per connection. See
  `control.rs` and [control-protocol.md](control-protocol.md).
- **`signals`** — receives OS signals (SIGTERM/SIGINT/SIGHUP) and
  triggers graceful shutdown.
- **`worker#0..N`** — a fixed pool (size `config.workers`) of threads
  that perform blocking git fetch/clone/pull operations. Spawned in
  `worker.rs`.

## Component diagram

```mermaid
graph TB
    subgraph external["External"]
        CLI["rad CLI"]
        PEERS["Remote peers<br/>(TCP)"]
        OS["OS signals"]
    end

    subgraph node["radicle-node process"]
        subgraph reactorThread["service thread (single-threaded event loop)"]
            REACTOR["Reactor<br/>mio::Poll"]
            WIRE["Wire<br/>(ReactionHandler)"]
            SERVICE["Service<br/>(protocol state machine)"]
            REACTOR --- WIRE
            WIRE --- SERVICE
        end

        CTRL["control thread<br/>(Unix socket listener)"]
        CTRLCONN["per-connection<br/>command threads"]
        SIG["signals thread"]

        subgraph pool["Worker pool"]
            W0["worker#0"]
            W1["worker#1"]
            WN["worker#N"]
        end
    end

    PEERS <-->|"TCP I/O (non-blocking)"| REACTOR
    OS --> SIG

    CLI <-->|"Unix socket<br/>line-delimited JSON"| CTRL
    CTRL -->|spawns| CTRLCONN

    CTRLCONN -->|"Control cmd<br/>(unbounded chan + Waker)"| REACTOR
    SIG -->|"Shutdown (control chan)"| REACTOR

    WIRE -->|"Task: fetch request<br/>(bounded chan, cap 1024)"| pool
    pool -->|"TaskResult<br/>(via Handle → control chan + Waker)"| REACTOR

    WIRE <-->|"git protocol bytes<br/>(per-stream bounded chans)"| pool
```

## Channels

All cross-thread communication is by message passing over channels; the
reactor is woken from its `poll()` via an mio `Waker`.

- **Control channel** (unbounded) — the single entry point back into the
  reactor. Control commands from the CLI, worker results, and shutdown
  signals all funnel into it (`reactor.rs`), each followed by a wake.
- **Worker task channel** (bounded, cap 1024) — `Wire` → worker pool.
  Carries a `Task` describing a fetch to perform (`runtime.rs`).
- **Worker result path** — worker → reactor. A worker reports a
  `TaskResult` back through the `Handle`, which enqueues it on the
  control channel (`runtime/handle.rs`).
- **Per-stream channels** (bounded, cap 64) — bidirectional git protocol
  bytes between `Wire` and a worker for the duration of a fetch, keyed by
  `StreamId` (`worker/channels.rs`).

### Where the worker channels are created

There are two distinct sets of channels for talking to the workers,
created in different places and at different times.

1. **The task channel is created once, at startup**, in
   `Runtime::init` (`runtime.rs`):

   ```rust
   let (worker_send, worker_recv) = chan::bounded::<worker::Task>(MAX_PENDING_TASKS);
   ```

   `worker_recv` is cloned into every worker thread, so they all receive
   from the same channel — it acts as a work-stealing queue. `worker_send`
   is held by `Wire` to dispatch tasks.

2. **The per-stream channels are created per fetch**, in
   `Channels::pair` (`worker/channels.rs`):

   ```rust
   let (l_send, r_recv) = chan::bounded::<ChannelEvent<T>>(MAX_WORKER_CHANNEL_SIZE);
   let (r_send, l_recv) = chan::bounded::<ChannelEvent<T>>(MAX_WORKER_CHANNEL_SIZE);
   ```

   Two channels are created because the git stream is bidirectional: one
   carries `Wire` → worker, the other worker → `Wire`. They are bundled
   into two `Channels` halves — one half stays with `Wire`, the other is
   moved into the `Task` sent to the worker. `pair` is called from `Wire`
   when a stream is opened or registered (`Streams::open` / `register` in
   `wire.rs`).

## How workers reach the network

A worker never touches the TCP socket. The reactor is the sole owner of
the socket; the worker only ever reads and writes its per-stream
channels, and `Wire` relays between the two.

The `Channels` handed to a worker expose `io::Read`/`io::Write` (via
`ChannelReader`/`ChannelWriter` in `worker/channels.rs`), so the git
fetch code believes it is doing ordinary blocking socket I/O — but those
reads and writes are backed by channels, not the network. `Wire`
translates in both directions:

- **Worker → peer.** The worker writes git bytes into its channel.
  `Wire` drains them (`flush` in `wire.rs`), wraps each chunk in a wire
  `Frame::git(stream, data)`, and emits a `reactor::Action::Send`; the
  reactor performs the actual TCP write.
- **Peer → worker.** The reactor reads from the socket and hands the
  bytes to `Wire` as a `SessionEvent::Data`. `Wire` decodes the frames
  and, for a git frame, pushes the payload into the matching stream's
  channel (`channels.send(ChannelEvent::Data(..))`). The worker, blocked
  in `ChannelReader::read`, wakes and consumes it.

```mermaid
graph LR
    subgraph worker["worker thread"]
        GIT["radicle_fetch<br/>clone/pull"]
        CH["Channels<br/>io::Read / io::Write"]
        GIT <--> CH
    end

    subgraph service["service thread"]
        WIRE["Wire<br/>Frame encode/decode<br/>(StreamId mux/demux)"]
        REACTOR["Reactor<br/>mio::Poll"]
        WIRE <--> REACTOR
    end

    PEER["Remote peer"]

    CH <-->|"ChannelEvent::Data<br/>(per-stream chan)"| WIRE
    REACTOR <-->|"TCP bytes<br/>(non-blocking)"| PEER
```

Two consequences follow:

- **Multiplexing.** A single TCP connection to a peer carries many
  concurrent git streams plus gossip. `Wire` tags every git frame with a
  `StreamId`, which is how it demultiplexes inbound bytes to the right
  worker channel and tags outbound bytes back onto the right stream.
- **No blocking on the core thread.** The worker blocks on channel reads
  (on its own thread), while the reactor only ever does non-blocking
  socket I/O and quick channel sends. Neither blocks the other.

## Git fetch flow

Git operations are blocking, so they run on the worker pool rather than
on the core thread. While a fetch is in flight, network frames are
relayed between `Wire` and the worker over the per-stream channels.

```mermaid
sequenceDiagram
    participant S as Service
    participant W as Wire (reactor)
    participant P as Worker thread
    participant N as Remote peer

    S->>W: Io::Fetch action
    W->>W: Streams::open() → bidirectional channels
    W->>P: Task (FetchRequest::Initiator) [bounded chan]
    W->>N: Frame::Control::Open
    N-->>W: git pack frames
    W-->>P: ChannelEvent::Data [per-stream chan]
    Note over P: blocking radicle_fetch::clone()/pull()
    P-->>W: git request bytes [per-stream chan]
    W-->>N: forward frames
    P->>W: TaskResult [Handle → control chan + Waker]
    W->>S: service.fetched(rid, nid, result)
    W->>N: Frame::Control::Close
```

An incoming fetch (where a peer fetches from us) follows the mirror of
this: `Wire` receives a `Frame::Control::Open`, registers a stream and
dispatches a `Task` with `FetchRequest::Responder`, then forwards
incoming frames to the worker over the per-stream channel until the
worker produces a result.

## Why it's structured this way

- **No locks in the hot path.** All protocol state lives on the single
  `service` thread, so the reactor, `Wire`, and `Service` never contend
  on shared state. The reactor multiplexes many connections on that one
  thread.
- **Blocking work is isolated.** Git fetches would stall the event loop,
  so they are handed to the worker pool and their results delivered back
  asynchronously through the control channel.
- **One synchronization point.** Everything that needs to re-enter the
  core thread — CLI commands, worker results, shutdown — arrives through
  the reactor's control channel and wakes it via the mio `Waker`.
## Migration to iroh

The change "node: Switch to iroh" and the changes after it replace the mio reactor with iroh, which runs over QUIC. The sections above describe the old design. The diagrams below show the new design as it is at the tip of the iroh changes.

### Startup

`main` in `radicle-node/src/main.rs` starts the node in two steps. First, `Runtime::init` does all synchronous setup and starts the service thread. Then `execute` creates the tokio runtime and runs `Runtime::run` on it with `block_on`. `Runtime::run` runs on the main thread, and the tasks it starts run on the tokio worker threads.

```mermaid
graph TD
    MAIN["main()"] --> PARSE["parse_options()<br/>initialize_logging()"]
    MAIN --> EXEC["execute(options)"]

    EXEC --> CFG["load config, unlock keystore,<br/>verify fingerprint"]
    EXEC --> SIGI["signals::install(notify)"]
    SIGI -.->|spawns| SIGT(["signals thread"])

    EXEC --> INIT["Runtime::init(...)"]
    INIT --> OPEN["open storage, COB cache,<br/>notifications, node database"]
    INIT --> SVC["Service::new + initialize"]
    INIT --> CHANS["create channels:<br/>std mpsc (ServiceInput)<br/>tokio mpsc (RuntimeOutput)"]
    INIT -.->|spawns| SVCT(["service thread<br/>run_service"])
    INIT --> HANDLE["Handle::new"]
    INIT --> BIND["Runtime::bind<br/>(control socket)"]

    EXEC --> BUILD["tokio::runtime::Builder<br/>::new_multi_thread().enable_all().build()"]
    BUILD -.->|"starts (one per core)"| WORKERS(["tokio worker threads"])
    BUILD -.->|"starts empty, grows on demand"| BPOOL(["tokio blocking pool"])

    EXEC --> BLOCKON["rt_tokio.block_on(Runtime::run())<br/>(on the main thread)"]
    BLOCKON --> AD["AddressDiscovery::new"]
    BLOCKON --> EP["Endpoint::builder(...).bind()"]
    BLOCKON --> RT["Router::builder(endpoint)<br/>.accept(ALPN_GOSSIP, ALPN_GIT).spawn()"]
    BLOCKON -.->|spawns| CTRLT(["control-listener thread<br/>control::listen"])
    BLOCKON --> LOOP["select! loop until Shutdown"]
    LOOP --> DISPATCH["dispatch(io) → JoinSet::spawn"]
    DISPATCH -.->|runs on| WORKERS
    DISPATCH -.->|"Git jobs via spawn_blocking"| BPOOL
```

Solid arrows are calls. Dashed arrows lead to threads that the call starts.

### Components

```mermaid
graph TB
    subgraph external["External"]
        CLI["rad CLI"]
        PEERS["Remote peers<br/>(QUIC via iroh)"]
        OS["OS signals"]
    end

    subgraph node["radicle-node process"]
        SIG["signals thread"]
        CTRL["control-listener thread<br/>(non-blocking Unix socket)"]
        CTRLCONN["per-connection<br/>command threads"]

        subgraph serviceThread["service thread (std thread)"]
            SERVICE["Service<br/>(protocol state machine)<br/>run_service loop"]
        end

        subgraph tokioRt["tokio multi-thread runtime"]
            subgraph mainThread["main thread (block_on)"]
                RUN["Runtime::run<br/>select! loop + dispatch"]
            end
            subgraph workerThreads["worker threads (one per core)"]
                ENDPOINT["iroh Endpoint<br/>+ MemoryLookup"]
                ROUTER["iroh Router"]
                GOSSIP["GossipProtocolHandler<br/>one task per peer<br/>ALPN radicle/gossip/1"]
                GITH["GitProtocolHandler<br/>one task per Git connection<br/>ALPN radicle/git/1"]
            end
            subgraph blockingPool["blocking pool (up to 512 threads)"]
                BLOCKING["spawn_blocking<br/>Worker::process<br/>(SyncIoBridge)"]
            end
        end
    end

    PEERS <-->|"QUIC"| ENDPOINT
    ENDPOINT --- ROUTER
    ROUTER -->|"inbound gossip"| GOSSIP
    ROUTER -->|"inbound Git"| GITH
    RUN -->|"Io::Connect → connect(ALPN gossip)"| GOSSIP
    RUN -->|"Io::Fetch → connect(ALPN Git)"| GITH
    RUN -->|"Io::Write<br/>(tokio mpsc, cap 32)"| GOSSIP
    GITH --> BLOCKING

    OS --> SIG
    SIG -->|"Signal (std mpsc)"| RUN
    CLI <-->|"Unix socket<br/>line-delimited JSON"| CTRL
    CTRL -->|spawns| CTRLCONN

    CTRLCONN -->|"ServiceInput::User"| SERVICE
    RUN -->|"ServiceInput::Shutdown"| SERVICE
    GOSSIP -->|"ServiceInput::Connected / Message / Disconnected"| SERVICE
    BLOCKING -->|"ServiceInput::Worker (TaskResult)"| SERVICE
    SERVICE -->|"RuntimeOutput::Io<br/>(tokio unbounded mpsc)"| RUN
```

The main differences from the old design:

- **The service stays synchronous.** `Service` runs on its own std thread. It receives every event as a `ServiceInput` on a std `mpsc` channel. It ticks when no input arrives for 250 ms. It sends each `Io` to the tokio runtime on a tokio unbounded channel.
- **iroh owns the network.** One iroh `Endpoint` replaces the mio reactor, and QUIC does the multiplexing that `Wire` and `StreamId` did before. A `Router` sends each inbound connection to a handler by its ALPN.
- **Gossip and Git use separate connections.** Each gossip peer has one connection with one bidirectional stream. Each Git fetch or upload has its own connection. A fetch does not need a gossip session, and a fetch failure does not disconnect the gossip peer.
- **No worker pool.** Each Git job runs in `tokio::task::spawn_blocking`. `SyncIoBridge` gives the blocking `radicle_fetch` code `io::Read` and `io::Write` on the QUIC stream. The per-stream channels and the task queue are gone.
- **Address lookup.** The node gives iroh the known direct addresses through a `MemoryLookup` before it dials. If no direct address works, iroh falls back to relays and discovery.
