---
title: Stream Multiplexing
description: How radicle-node carries many logical streams (control, gossip, and per-repo git fetches) over a single Noise-encrypted TCP connection between nodes.
tags:
  - radicle
project: Radicle
---

A single connection between two nodes carries many independent logical
streams: a control stream, a gossip stream, and one git stream per
in-flight fetch. They are multiplexed over one Noise XK-encrypted TCP
connection by framing every transmission and tagging it with a stream
identifier. This document describes the frame format, how stream IDs
avoid collisions, and how streams are opened, read, written, and closed
at runtime.

## Frames

Every transmission is a `Frame`, defined in
[frame.rs:197](../crates/radicle-protocol/src/wire/frame.rs#L197):

```rust
pub struct Frame<M = Message> {
    pub version: Version,   // 4 bytes: "rad" + protocol version byte
    pub stream: StreamId,   // varint, the demux key
    pub data: FrameData<M>, // Control | Gossip(M) | Git(Vec<u8>)
}
```

The on-wire layout is a fixed 4-byte version header, a variable-length
stream ID, then the payload
([frame.rs:184-205](../crates/radicle-protocol/src/wire/frame.rs#L184-L205)):

```text
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|      'r'      |      'a'      |      'd'      |      0x1      | Version
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     Stream ID                           |TTT|I| Stream ID with [T]ype and [I]nitiator bits
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     Data                                     …| Data (variable size)
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

The frame is self-describing. A reader decodes the version, then the
stream ID, then dispatches on the stream's type to parse the payload
([frame.rs:336-379](../crates/radicle-protocol/src/wire/frame.rs#L336-L379)).
Gossip and git payloads are length-prefixed with a QUIC-style varint
([varint.rs:154-174](../crates/radicle-protocol/src/wire/varint.rs#L154-L174)),
so the framing carries no separate length field of its own.

The payload variants are
([frame.rs:237-245](../crates/radicle-protocol/src/wire/frame.rs#L237-L245)):

```rust
pub enum FrameData<M> {
    Control(Control), // open/close/eof a stream
    Gossip(M),        // a gossip Message
    Git(Vec<u8>),     // packet-lines and packfile data
}
```

## Stream identifiers

A `StreamId`
([frame.rs:45-120](../crates/radicle-protocol/src/wire/frame.rs#L45-L120))
is a varint whose least significant 3 bits encode metadata and whose
remaining bits are a sequence number:

- bit 0 is the **initiator** (link): `0` outbound, `1` inbound;
- bits 1 and 2 are the **stream type**: `Control` (0), `Gossip` (1),
  `Git` (2).

This yields six base IDs:

| Bits  | Stream                  |
| ----- | ----------------------- |
| 0b000 | Outbound Control stream |
| 0b001 | Inbound Control stream  |
| 0b010 | Outbound Gossip stream  |
| 0b011 | Inbound Gossip stream   |
| 0b100 | Outbound Git stream     |
| 0b101 | Inbound Git stream      |

### Why IDs never collide

When Alice connects to Bob, Alice sets the initiator bit to `1` on every
stream she creates and Bob sets it to `0`. Each side allocates its own
IDs from a disjoint space, so the two peers can both number streams
sequentially without coordinating. New git stream IDs come from `nth(n)`,
which adds `n << 3` to a base ID so it advances the sequence number while
preserving the type and initiator bits
([frame.rs:115-119](../crates/radicle-protocol/src/wire/frame.rs#L115-L119)):

```rust
pub fn nth(self, n: u64) -> Result<Self, varint::BoundsExceeded> {
    let id = *self.0 + (n << 3);
    VarInt::new(id).map(Self)
}
```

IDs must never be reused within a connection.

## Stream kinds

The control and gossip streams are **implicit**: their IDs are fixed for
a given link, so they always exist and are not tracked in any map. Git
streams are **dynamic**: one is created per fetch and tracked by ID.

### Control stream

Control frames drive the lifecycle of git streams
([frame.rs:247-267](../crates/radicle-protocol/src/wire/frame.rs#L247-L267)):

```rust
pub enum Control {
    Open  { stream: StreamId },
    Close { stream: StreamId },
    Eof   { stream: StreamId }, // simulate connection EOF without closing the socket
}
```

An `Eof` is turned into an `io::ErrorKind::UnexpectedEof` on the reading
side, which lets one logical stream signal end-of-file to its git
subprocess without tearing down the shared connection.

### Gossip stream

Carries `Message` gossip (announcements, inventories, and so on). Always
present; not registered as a tracked stream.

### Git stream

Created on demand for each fetch and carries packet-lines and packfile
data. Multiple git streams can be live at once, one per concurrent
repository fetch.

## Runtime: the node side

The multiplexing machinery lives in
[wire.rs](../crates/radicle-node/src/wire.rs). Per connection, a
`Streams` value
([wire.rs:96](../crates/radicle-node/src/wire.rs#L96)) owns the map of
live git streams, the connection's `link`, and a sequence counter. Each
`Stream`
([wire.rs:76](../crates/radicle-node/src/wire.rs#L76)) holds a
`worker::Channels` handle plus byte counters.

Incoming bytes are buffered per peer in a
`Deserializer<MAX_INBOX_SIZE, Frame>`
([wire.rs:189](../crates/radicle-node/src/wire.rs#L189),
[deserializer.rs](../crates/radicle-protocol/src/deserializer.rs)),
which extracts one whole frame at a time and leaves partial frames
buffered until more data arrives. The inbox is capped at 2 MiB
([wire.rs:55](../crates/radicle-node/src/wire.rs#L55)).

### Opening a stream

A fetch request arrives as `Io::Fetch`
([wire.rs:1014](../crates/radicle-node/src/wire.rs#L1014)). The node
calls `Streams::open`
([wire.rs:128-141](../crates/radicle-node/src/wire.rs#L128-L141)), which
bumps the sequence counter, derives the next git `StreamId` via
`StreamId::git(link).nth(seq)`, registers a `Stream` with a fresh channel
pair, and hands a worker `Task` to the worker pool
([wire.rs:1066](../crates/radicle-node/src/wire.rs#L1066)). It then sends
a `Control::Open` frame so the remote registers the same stream
([wire.rs:1076-1078](../crates/radicle-node/src/wire.rs#L1076-L1078)).

On the receiving side, an inbound `Control::Open` frame
([wire.rs:711-737](../crates/radicle-node/src/wire.rs#L711-L737))
registers the stream and dispatches its own responder `Task` to the
worker pool.

### Reading from a stream

The frame-dispatch loop matches on `FrameData`:

- `FrameData::Git(data)`
  ([wire.rs:782-794](../crates/radicle-node/src/wire.rs#L782-L794)) looks
  up the stream by ID and forwards the bytes to its worker with
  `channels.send(ChannelEvent::Data(data))`.
- `Control::Eof`
  ([wire.rs:745-756](../crates/radicle-node/src/wire.rs#L745-L756))
  forwards `ChannelEvent::Eof`, which the worker reads as an unexpected
  EOF.
- `Control::Close`
  ([wire.rs:759-771](../crates/radicle-node/src/wire.rs#L759-L771))
  unregisters the stream.

### Writing to a stream

A worker produces output on its channel; the wire layer drains it and
re-frames each item
([wire.rs:455-467](../crates/radicle-node/src/wire.rs#L455-L467)):

```rust
for data in s.channels.try_iter() {
    let frame = match data {
        ChannelEvent::Data(data) => Frame::<service::Message>::git(stream, data),
        ChannelEvent::Close => Frame::control(*link, frame::Control::Close { stream }),
        ChannelEvent::Eof => Frame::control(*link, frame::Control::Eof { stream }),
    };
    self.actions.push_back(reactor::Action::Send(fd, frame.encode_to_vec()));
}
```

### Closing a stream

When a worker finishes, it reports a `TaskResult` that the node handles
in `worker_result`
([wire.rs:391-414](../crates/radicle-node/src/wire.rs#L391-L414)). If the
stream is still registered (the remote may have sent an early `Close`
already), the node unregisters it and sends a `Control::Close` frame back
to the peer.

## Workers and channels

The wire layer never runs git itself. It is decoupled from the work by
bounded crossbeam channels in
[worker/channels.rs](../crates/radicle-node/src/worker/channels.rs).
`Channels::pair`
([channels.rs:131-139](../crates/radicle-node/src/worker/channels.rs#L131-L139))
builds two halves of a bidirectional pipe: one half stays with the wire
reactor, the other travels in the `Task` to a worker thread that runs
git fetch-pack or upload-pack. The channel vocabulary is `ChannelEvent`
([channels.rs:84-92](../crates/radicle-node/src/worker/channels.rs#L84-L92)),
with `Data`, `Close`, and `Eof` variants, and each direction is bounded
at `MAX_WORKER_CHANNEL_SIZE` (64) messages
([channels.rs:15](../crates/radicle-node/src/worker/channels.rs#L15)).

A `Task` ties a fetch request to its stream and channel
([worker.rs:46-49](../crates/radicle-node/src/worker.rs#L46-L49)):

```rust
pub struct Task {
    pub fetch: FetchRequest,
    pub stream: StreamId,
    pub channels: Channels,
}
```

This decoupling is what makes the multiplexing useful: the single
reactor keeps demultiplexing frames off the socket while many worker
threads handle concurrent fetches, each bound to its own stream.

## End to end

1. A fetch request opens a new git stream: allocate the next git
   `StreamId`, register it, spawn a worker, and send `Control::Open`.
2. The remote sees `Control::Open` and registers the matching stream with
   its own worker.
3. Git data flows both ways as `Git` frames, demultiplexed by stream ID
   into the right worker channel.
4. Either side may send `Control::Eof` to signal end-of-file on one
   stream without closing the connection.
5. When a worker finishes, the node unregisters the stream and sends
   `Control::Close`. Control and gossip streams persist for the life of
   the connection.
