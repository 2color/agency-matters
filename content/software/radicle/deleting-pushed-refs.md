---
title: Deleting refs you pushed to your namespace
description: How to delete a ref from your namespace with a git delete refspec, what the remote helper does with it, why the default branch is protected, and how the deletion reaches other peers.
tags:
  - radicle
  - aigenerated
project: Radicle
---

Every ref you push with `git push rad` is stored under your own namespace,
`refs/namespaces/<nid>/…`. To remove one, push a delete refspec. The `rad`
remote helper accepts the standard git syntax, so no special command is
necessary.

```
git push rad :some-branch      # delete refs/heads/some-branch
git push rad -d some-branch    # the same thing
git push rad :tmp/heads/<oid>  # any other ref in your namespace
```

## What the helper does

The push code lives in the `radicle_remote_helper::push` module.

1. Git sends one `push <src>:<dst>` line per refspec. `Command::parse` reads a
   refspec with an empty source as a `Command::Delete`.
2. The helper prefixes `dst` with your namespace and deletes that reference from
   the stored copy.
3. If one or more refspecs are applied, the helper signs your refs again with
   `Repository::sign_refs`. The deleted ref is then no longer in your
   `refs/rad/sigrefs`.
4. It then announces the update to the network, unless you push with
   `-o no-sync`, or you do not seed the repository, or your node is not running.

Git removes the related remote-tracking branch in your working copy.

## The default branch is protected

You cannot delete the default branch if you are a delegate:

```
$ git push rad :master
error: refusing to delete default branch ref 'refs/heads/master'
```

The check compares the destination with the head of the stored copy and applies
only to delegates. A non-delegate can delete their own copy of the default
branch, because the canonical branch is computed from the delegates.

No other ref is protected. The `refs/rad/*` refs are managed by Radicle, so do
not delete them by hand.

## How other peers see the deletion

Deletion is local to your namespace. It removes the ref from the stored copy and
from your signed refs. Other peers keep their own refs in their own namespaces.

When a peer fetches from you, the `DataRefs` stage of the fetch protocol
compares the refs it has with the refs in your `rad/sigrefs`, and marks the refs
that are no longer signed for deletion. Thus your deletion is replicated, but
only for your namespace.

This is the same model as [[patch-cob-deletion|COB deletion]]: you can withdraw
your own refs, but you cannot erase data from other peers.

## Patches

A delete refspec removes only the git ref. It does not touch the patch
collaborative object. To delete the patch itself, use `rad patch delete <id>`.
The magic ref `refs/patches` is applicable only to a push that opens a patch;
you cannot delete it.

## Related

- Examples: `crates/radicle-cli/examples/git/git-push-delete.md` and
  `crates/radicle-cli/examples/git/git-push.md`
- [[canonical-branch-head|Canonical branch head determination]]
- [[patch-cob-deletion|COB Deletion in Radicle]]
