---
title: Radicle with JJ
description:
tags:
  - radicle
  - jj
project:
created: 2026-09-29
---
# Make `jj git push` work for patches by other authors

## Setup

Tell jj that `main` on the `rad` remote is the trunk. Run this command in the repository:

```sh
jj config set --repo 'revset-aliases."trunk()"' 'main@rad'
```

The alias must point to the default branch of the repository. If the default branch has another name, for example `master`, replace `main` with that name.

## Problem

You check out a patch that another person opened, add commits, and push the patch bookmark with jj:

```sh
rad patch checkout 190113b
jj bookmark track patches/190113b8a709a368b7471f4a4b403fa50e909976@rad
jj bookmark set patches/190113b8a709a368b7471f4a4b403fa50e909976 -r @-
jj git push --remote rad --bookmark patches/190113b8a709a368b7471f4a4b403fa50e909976
```

The push fails:

```text
Warning: The following references unexpectedly moved on the remote:
  refs/heads/patches/190113b8a709a368b7471f4a4b403fa50e909976 (reason: stale info)
```

A fetch from `rad` does not fix it. A plain `git push rad <oid>:refs/heads/patches/<id>` works.

The patch COB already lets anyone add a revision (`Action::Revision { .. } => Authorization::Allow` in `crates/radicle/src/cob/patch.rs`). So this is only a remote helper problem, not a permission problem.

## Cause

The remote helper gives git different ref lists for fetch and push (`crates/radicle-remote-helper/src/list.rs`):

- `for_fetch` lists special refs, `refs/heads/patches/<id>`. Each one points to the head of the latest revision of an open patch (`patch_refs`). jj imports these, so `patches/<id>@rad` points to the other author's head.
- `for_push` lists only the `refs/heads/*` and `refs/tags/*` refs in your own namespace. Your namespace has no `refs/heads/patches/<id>` for a patch you did not push.

jj always pushes with `--force-with-lease=<ref>:<expected-oid>`, where the expected OID is the value it got from the fetch. Git compares this value with the `list for-push` output. The ref is not in that list, so git rejects the push with "stale info" before the helper receives it.

Plain `git push` sends no lease. The ref is not in your namespace, so git treats the push as a new ref and accepts it.

There is a second problem behind the first one. Git sends each lease to the helper as `option cas <ref>:<oid>`. `main.rs` collects these in `expected_refs`. Then `push_ref` in `push.rs` passes every entry to `git send-pack` as `--force-with-lease=refs/namespaces/<your-nid>/<ref>:<oid>`. For a patch ref, this compares the expected OID with your namespace, not with the patch. So a fix to the ref list alone moves the failure into `send-pack`.

## Workaround: use a `self` remote

Add a second remote that points to your own node. Then `rad` is the read-only remote and `self` is the remote you push to. This is the usual git split between a "master" remote and a "developer" remote.

```sh
rad remote add --name self $(rad node status --only nid)
```

Your node must run when you use this command.

- Fetch from `rad`. Push to `self`: `jj git push --remote self --bookmark patches/<id>`.
- The push to `self` has no stale lease, because your namespace holds the ref.
- With `self`, `jj git fetch --remote rad` no longer abandons the commits of a revision that you pushed.

The `rad` remote works as designed. A non-author must not move the head of a patch, so `rad` shows the head of the latest revision by the patch author. The change below makes `jj git push --remote rad` work too.

Source: [Zulip thread](https://radicle.zulipchat.com/#narrow/channel/503531-jj/topic/Pushing.20a.20revision.20to.20some.20one.20else.27s.20patch.20with.20jj/with/627492149).

# Fix `jj git fetch` tag bookmarks that flap

## Problem

Each `jj git fetch --remote rad` prints a warning. The `tags/releases/*@rad` bookmarks are deleted on one fetch and created again on the next:

```text
Warning: Ignored refspec `+refs/tags/*:refs/remotes/rad/tags/*` from `rad`: only refs/heads/ is supported for refspec sources
bookmark: tags/releases/0.10.0@rad [deleted] untracked
```

## Cause

The `rad` remote has two fetch refspecs. Check them with `git config --get-all remote.rad.fetch`:

```text
+refs/heads/*:refs/remotes/rad/*
+refs/tags/*:refs/remotes/rad/tags/*
```

The second refspec means: copy every remote tag to `refs/remotes/rad/tags/*`, and allow the copy to move when the remote tag moves. It keeps remote tags apart from your own local tags.

jj only supports refspecs that start at `refs/heads/`. It ignores the tag refspec and prints the warning. But jj reads every ref under `refs/remotes/rad/` as a remote bookmark. So the tag copies become `tags/releases/*@rad` bookmarks.

The bookmarks flap because of two steps in each fetch:

- jj fetches tags itself. Git sees the tag refspec in the config and also writes copies of these tags to `refs/remotes/rad/tags/*`.
- jj prunes the refs under `refs/remotes/rad/` that its own refspec does not cover. This deletes copies from earlier fetches.

A plain `git fetch rad` also creates all the copies again.

## Fix

Remove the tag refspec and the tag copies:

```sh
git config --unset-all remote.rad.fetch '^\+refs/tags/'
git for-each-ref --format='%(refname)' refs/remotes/rad/tags | xargs -n1 git update-ref -d
jj git fetch --remote rad
```

Your local tags in `refs/tags/releases/*` stay. They do not depend on this refspec.

## What changes

- The warning and the flapping bookmarks stop.
- jj 0.44.0 still fetches tags into `refs/tags/*`. This includes new tags, tags on commits outside the fetched branches, and tags that moved on the remote. These tags show as `tag: <name>@rad` in the fetch output.
- Plain `git fetch rad` fetches only new tags that point to fetched commits. This is tag auto-following. It is the git default. `remote.rad.tagOpt` controls it. It is unset here.
- With git, a tag that moved on the remote is not updated, because the `+` rule is gone. `git fetch rad --tags` rejects it with "would clobber existing tag". Run `git fetch rad --tags --force` to update it.
- A Radicle command may add the refspec again. The source is not confirmed. Likely candidates are `rad init`, `rad clone` and `rad remote add`.

# Create and push a tag

## With jj

jj 0.44.0 can create and push tags:

```sh
jj tag set releases/0.17.0 -r <rev>
jj git push --remote rad --tag releases/0.17.0
```

- `jj tag set` creates a lightweight tag. jj cannot create annotated tags, which carry a message.
- `--tag` accepts glob patterns, for example `--tag 'releases/*'`.
- A bare `jj git push` also pushes tags in the default revset (`remote_bookmarks(remote=rad)..@`). `--all` pushes all bookmarks and tags. Use it with care on `rad`.
- The push of a tag through the `rad` remote helper is not tested. If it fails with a lease or "stale info" error, as patch pushes do, use git.

## With git

Radicle release tags such as `releases/0.16.0` are annotated. Create them with git:

```sh
git tag -a releases/0.17.0 -m "Release 0.17.0" <commit>
git push rad tag releases/0.17.0
```

- With jj, `@` is usually an empty working-copy commit. Tag the commit you want to release. Find its hash with `jj log`.
- jj imports the new tag on the next command.
- The push goes to your own namespace. The tag becomes canonical when enough delegates have the same tag. With one delegate, this happens at once.
- Run `jj git fetch --remote rad` or `git fetch rad` to see tags from other delegates.
