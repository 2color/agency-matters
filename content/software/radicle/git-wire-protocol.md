---
title: Git Wire Protocol Versions
description: Heartwood speaks Git wire protocol v2 between nodes, but serves the older v0 protocol over HTTP through radicle-httpd.
tags:
  - radicle
project: Radicle
---

Radicle moves repository data with the unmodified [Git wire
protocol](https://git-scm.com/docs/protocol-v2). Two transports carry it,
and they do not use the same version:

| Transport | Server | Protocol version | Direction |
| --------- | ------ | ---------------- | --------- |
| Node-to-node stream | `radicle-node` worker | v2 only | fetch only |
| HTTPS | `radicle-httpd` via `git http-backend` | v0 | fetch only |

Neither transport accepts pushes. Radicle replicates by fetch: a node that
learns of new refs fetches them from a peer.

## Node-to-node: v2 only

Between nodes, the git protocol is tunnelled over a logical stream of the
Noise XK-encrypted link. See [stream-multiplexing.md](stream-multiplexing.md)
for the framing that carries it.

### Client side

The client is the `radicle-fetch` crate. Its `transport` module wraps each
stream in a `Connection` that `gix-transport` drives in `ConnectMode::Daemon`
with `Protocol::V2`. In daemon mode the session opens with a git request
packet-line that names the repository and sets the version:

```text
git-upload-pack /rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5.git\0host=…\0\0version=2\0
```

There is no fallback. `Connection::supported_protocol_versions` returns only
`Protocol::V2`, and `ls_refs::run` rejects the session if the handshake
reports a different `server_protocol_version`.

The fetch then runs the two v2 commands in rounds, driven by the stages in
the `stage` module: `ls-refs` (in `transport::ls_refs`) to discover refs,
then `fetch` (in `transport::fetch`) to receive a packfile. Each stage
supplies `ref-prefix` filters, but `ls_refs::run` filters the result again on
the client, because the v2 specification treats `ref-prefix` as an
optimisation and not a guarantee.

A tunnelled session cannot end by closing the connection, and the git
protocol has no end-of-session message. The client therefore signals the end
out of band with the `eof` control message of the `SignalEof` trait,
implemented by `ChannelsFlush` in the `radicle-node` worker. Without it,
`git upload-pack` waits for more requests forever.

### Server side

The responder path is `upload_pack` in the `radicle-node` worker. It first
parses the request line with `GitRequest::from_packetline`, reads the
`version` extra parameter, and fails with `"only Git protocol version 2 is
supported"` for any value other than `2`. Version 0 and version 1 clients are
refused.

It then spawns `git upload-pack` with a cleared environment, plus:

- `GIT_PROTOCOL=version=2` — enables v2 in the child process
- `uploadpack.allowAnySha1InWant=true` — lets a peer want an unadvertised OID
- `uploadpack.allowRefInWant=true` — lets a peer want a ref by name
- `lsrefs.unborn=ignore` — tolerates unborn refs in the advertisement
- `--strict` and `--timeout=…`

The `Reporter` wrapper around the send half parses the sideband progress
lines and emits them as node events, which is how `rad sync` shows remote
counting and compressing progress.

## HTTP: v0

`radicle-httpd` (in the radicle-explorer repository) serves the smart HTTP
endpoints from its `git` module. The `git_http_backend` handler is a thin CGI
wrapper: it spawns `git http-backend` and sets `REQUEST_METHOD`,
`GIT_PROJECT_ROOT`, `GIT_HTTP_EXPORT_ALL`, `PATH_INFO`, `CONTENT_TYPE` and
`QUERY_STRING`.

It does not set `GIT_PROTOCOL`. `git http-backend` only speaks v2 when the
web server copies the client's `Git-Protocol` request header into that
variable. Modern git clients send `Git-Protocol: version=2` by default, but
`radicle-httpd` drops the header, so every HTTP fetch falls back to the
original protocol (v0):

1. `GET /<rid>.git/info/refs?service=git-upload-pack` returns the full ref
   advertisement.
2. `POST /<rid>.git/git-upload-pack` carries the wants and haves.

The HTTP path is also more restricted than the node path:

- `git-receive-pack` returns 503, so pushes are rejected.
- Private repositories return 404.
- A leading node ID in the path sets `GIT_NAMESPACE`, which serves one peer's
  namespace instead of the whole stored copy.
- Only `uploadpack.allowAnySHA1InWant` is set. The node path also sets
  `allowRefInWant` and `lsrefs.unborn`, but both are v2-only options and have
  no effect under v0.

The cost of v0 is the ref advertisement. The server sends every ref of the
repository before the client says what it wants, which is expensive for a
repository with many peer namespaces and COB refs.

To serve v2 over HTTP, `git_http_backend` must forward the `Git-Protocol`
header into the `GIT_PROTOCOL` environment variable. Sanitise the value
first, as the git documentation advises, because it comes from the client.
