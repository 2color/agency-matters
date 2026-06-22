---
title: Reactor Event Loop
description: The single-threaded mio-based reactor that drives all of radicle-node's non-blocking I/O.
tags:
  - radicle
project: Radicle
---

The radicle-node's networking is driven by a *reactor*: a single-threaded
event loop built on [mio](https://docs.rs/mio) (epoll/kqueue) that handles
all of the node's non-blocking I/O. It is implemented in
`crates/radicle-node/src/reactor.rs`.

The reactor knows nothing about the radicle protocol. It only manages
sockets and timers, dispatches readiness events to a *service*, and
performs whatever actions the service asks for in return. This keeps the
node's protocol and state logic free of any direct contact with file
descriptors or mio.

## The loop

The reactor owns a dedicated thread that blocks on a single `poll()`
syscall (`Runtime::run`). Each iteration wakes for one of three reasons:

1. **I/O readiness** on a registered socket — a connection has data to
   read, or has become writable.
2. **A wake** from another thread, sent through the `Controller`'s
   `Waker`.
3. **A timeout** firing, set previously via `Action::SetTimer`.

When `poll()` returns, the reactor:

1. Calls `service.tick()` to advance the service's notion of time.
2. Fires `service.timer_reacted()` if any timers expired.
3. Dispatches I/O events to the resources, passing the resulting
   reactions to the service (`handle_events`).
4. Drains control messages (commands, shutdown) if it was woken.
5. Pulls actions out of the service and executes them
   (`handle_actions`).

If the service spends more than `LAG_TIMEOUT` (100ms) handling a batch,
the reactor logs a warning — a signal that the node is too slow to keep
up with its I/O.

## The two halves

There is a clean split between the generic I/O plumbing and the node's
logic:

- **`Reactor`** — the public handle. It spawns the reactor thread and
  hands out a `Controller` used to send commands or shutdown from other
  threads.
- **`Runtime`** — the blocking event loop that runs on the reactor
  thread.
- **`ReactionHandler`** — the trait the *service* implements. The
  reactor calls into it (`tick`, `transport_reacted`, `handle_command`,
  …) and pulls `Action`s back out of it via its `Iterator` impl.

## Resources

The reactor manages two kinds of resources, distinguished by whether
they can be written to:

- **Listeners** — read-only sources that spawn new resources, e.g. a
  `TcpListener` accepting incoming connections.
- **Transports** — full read/write connections, i.e. the peer sessions.

Both implement `EventHandler`, whose `handle` method converts raw mio
readiness into service-level *reactions*, and `interests`, which tells
the reactor which events the resource currently cares about.

## Reactions and actions

The data flow each iteration is:

1. The reactor polls and receives I/O events.
2. For each event, the resource's `EventHandler::handle` produces
   reactions, which are passed to the service via `listener_reacted` /
   `transport_reacted`.
3. The service processes them and yields **`Action`s**.
4. The reactor executes those actions in `handle_action`.

The actions a service can emit are:

- `RegisterListener` / `RegisterTransport` — start polling an
  already-active resource.
- `UnregisterListener` / `UnregisterTransport` — stop polling a resource
  and hand it back to the service (e.g. to pass to a worker thread or
  close it). The reactor itself never closes file descriptors.
- `Send` — write bytes to a transport.
- `SetTimer` — schedule a timeout that fires `timer_reacted` later.

## Why it's structured this way

Because the service never touches mio or sockets directly — it only
reacts to events and emits actions — the node's core protocol logic can
run single-threaded without locks on shared state, while the reactor
still multiplexes many concurrent connections on one thread.