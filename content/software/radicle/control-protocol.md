---
title: Node Control Protocol
description: The line-delimited JSON protocol the rad CLI uses to talk to a running radicle-node over a Unix domain socket.
tags:
  - radicle
project: Radicle
---

The `rad` CLI talks to a running `radicle-node` through a line-delimited
JSON protocol carried over a Unix domain socket. This document describes
the protocol at a high level: how the transport is set up, what the wire
format looks like, and how requests are dispatched on each side.

## Transport

- The node binds a `UnixListener` (typically at `~/.radicle/node/control.sock`)
  and accepts connections in `crates/radicle-node/src/control.rs`
  (`listen`).
- Each `rad` invocation that needs the node opens a fresh `UnixStream`
  via `Node::call` in `crates/radicle/src/node.rs`. One connection
  carries exactly one command request; the response may be one or many
  lines depending on the command.
- On the node, each accepted connection is handled on its own thread
  (`control.rs`, inside `listen`), so commands are processed
  concurrently and a long-running command (e.g. `subscribe`) does not
  block others.

## Wire format

### Request

One JSON object terminated by `\n`. The schema is the `Command` enum in
`crates/radicle/src/node/command.rs`, serialized internally-tagged on
the `command` field with camelCase names. Example:

```json
{"command":"announceRefsFor","rid":"rad:…","namespaces":["z6M…"]}
```

### Response

One or more lines, each a JSON value. The shape is `CommandResult<T>`
(`command.rs`), an untagged enum that is either:

- the success payload `T` serialized directly, or
- `{"error":"<reason>"}` on failure.

For void successes the payload is `{}`; for state-changing operations
(`seed`, `unseed`, `follow`, etc.) it is `{"updated":true|false}`. See
the `Success` type in `command.rs`.

Most commands return exactly one line. Two notable exceptions:

- `Subscribe` streams `Event` lines until the socket is closed
  (`control.rs`, the `Command::Subscribe` arm uses `MAX_TIMEOUT`).
- `Fetch` blocks until the fetch finishes and then writes a single
  result line back.

## Dispatch on the node

`control::command` reads one line, deserializes it as `Command`, and
matches on the variant. Each arm calls a method on a `Handle`
(`crates/radicle/src/node.rs`, the `Handle` trait), which is the
in-process API to the running node — the control socket is essentially
a JSON facade in front of that trait. On error, the worker writes
`CommandResult::error(e)` and shuts the stream down.

## Client side

`Node::call` returns a `LineIter<T>` (`node.rs`) that lazily reads
lines, parses each as `CommandResult<T>`, and yields `Result<T, Error>`.
A per-line read timeout is enforced via `set_read_timeout`, so streaming
commands like `subscribe` are simply iteration with a long timeout.

The `Handle` implementation for `Node` (`node.rs`) wraps
`call(...).next()` for the single-response commands, giving callers a
typed API that hides the JSON entirely.

## Summary

1. CLI opens the Unix socket.
2. CLI writes one line of JSON describing a `Command`.
3. CLI reads one or more lines of JSON, each a `CommandResult` envelope
   carrying either a typed payload or an `error` string.
4. CLI closes the connection (or keeps reading, for `subscribe`).
