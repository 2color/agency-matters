---
title: Radicle
description: Radicle is an open source, peer-to-peer code forge built on Git.
url: https://radicle.xyz
tags:
  - radicle
project: Radicle
---
- [[#What is Radicle?|What is Radicle?]]
- [[#Ecosystem Activity|Ecosystem Activity]]
- [[#TODO|TODO]]
- [[#Learnings|Learnings]]
- [[#Questions and answers|Questions and answers]]
- [[#Feedback|Feedback]]
- [[#Resources|Resources]]
- [[#Cheatsheet|Cheatsheet]]
- [[#Terminology|Terminology]]


## What is Radicle?

Radicle is an open source, peer-to-peer code collaboration stack built on Git. Unlike centralized code hosting platforms, there is no single entity controlling the network. Repositories are replicated across peers in a decentralized manner, and users are in full control of their data and workflow.

## Ecosystem Activity

- Join [radicle zulip](https://radicle.zulipchat.com) forums/chat and [introduce myself]([#intros > Daniel Norman @ 💬](https://radicle.zulipchat.com/#narrow/channel/503770-intros/topic/Daniel.20Norman/near/566323425))
- Work through the user guide
- Set up a node on macOS
- Publish first repo [`rad:z3UCzhSC1ijx5f8t9pkKywQPjvRMq`](https://app.radicle.xyz/nodes/iris.radicle.xyz/rad:z3UCzhSC1ijx5f8t9pkKywQPjvRMq)
- Create first issues, patches,  and revisions
- Clone, compile, and try: **rad-tui**
	- [Open issue with scrolling in tui](https://app.radicle.xyz/nodes/iris.radicle.xyz/rad:z39mP9rQAaGmERfUMPULfPUi473tY/issues/e20928e553358b59e809dc128c444020ac6b079f)
	- 6e9ba16286845d4ecdd1dd5273c6ac866bafb995
- Discussion about `rad ls` defaults
	- Only repos you've interacted with by default.
	- Cloning is not enough
- `rad fork` vs `rad clone` discussion
- Read  [#radicle.xyz > hierarchy/content improvements for .xyz @ 💬](https://radicle.zulipchat.com/#narrow/channel/431405-radicle.2Exyz/topic/hierarchy.2Fcontent.20improvements.20for.20.2Exyz/near/555563516)
- Read [#CLI > Command Consolidation @ 💬](https://radicle.zulipchat.com/#narrow/channel/374620-CLI/topic/Command.20Consolidation/near/555175412) 
- Investigate signed refs and ask about underlying implementation[#Support > How signed refs and self-certification work](https://radicle.zulipchat.com/#narrow/channel/369873-Support/topic/How.20signed.20refs.20and.20self-certification.20work/with/567518647)
	- See section below
- Read https://radicle.xyz/2025/08/12/canonical-references#fnref:1
- [Attend CID Congress](https://luma.com/zsa28r1b?tk=DWQWY9)
	- Discuss Radicle's use of content addressed identifiers that are rooted in the git ecosystem
	- Canonical JSON is used to encode COBs
	- How that might compare to [DRISL](https://dasl.ing/drisl.html)
		- Canonicalisation
		- Interop with atproto
		- [MASL manifests](https://dasl.ing/masl.html)
		- Interop with HTTP
		- BDASL
- [#heartwood > Canonical JSON specification @ 💬](https://radicle.zulipchat.com/#narrow/channel/369277-heartwood/topic/Canonical.20JSON.20specification/near/568405374)
- Dive into Radicle Search in radicle.garden
- Report issue in radicle-explorer ea67111
- Engage with https://peter.demin.dev/12_articles/80-radicle.html in [#Feedback > My Radicle Journey @ 💬](https://radicle.zulipchat.com/#narrow/channel/392584-Feedback/topic/My.20Radicle.20Journey/near/569925295)
- [#heartwood > Adding another remote by default?](https://radicle.zulipchat.com/#narrow/channel/369277-heartwood/topic/Adding.20another.20remote.20by.20default.3F/with/570181800)
- Create `rad-find` cli utility help you find and inspect radicle object ids without knowing what they are
	- `rad:z45E5Sz1mE6itUMUjEgBoqt7ymYRt`

## Learnings
### Getting Started
- start node with debug logging`rad node start -- --log-level debug`
	- `rad node start` calls `radicle-node`
- `rad init` in a repo will push to the preferred seeds
- signing in radicle is independent of git signing
- radicle uses git's remote helpers to support `rad:// URLs, e.g. 
- After pushing to `rad` remote, gossip announces to peers, which in turn fetch
- Whenever you clone or initialise a new repository, your node’s seeding policy is updated to keep these repositories in sync with the network.
- `rad clone` is equivalent to running:
	- `rad seed`
	- `rad sync -f`
	- `rad checkout`
	- `rad remote add`
- The set of peers that are followed in the context of a seeded repository is called the **scope**.
	- By default scope is all, which includes all the peers who have a clone 
	- setting to followed will only  subscribe to delegated`rad seed rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5 --scope followed` 
- `rad ls` only shows repos that you've interacted with, i.e. have refs for, irrespective of seeding policy

### Collaborating
- social interactions (issues, patches, comments) are implemented using a system of [Collaborative Objects](https://radicle.xyz/guides/protocol/#collaborative-objects) or simply “COBs” 🌽, that are implemented using Git objects .
- `rad issue` to list issues
- `rad issue comment COB-ID`
- `rad inbox` shows notifications (issues/patches)
- `git push rad HEAD:refs/patches` to open a patch
	- `refs/patches` is a magic ref
- Patches
	- Have an ID, i.e. the patch ID
	- Can have multiple revisions, an the initial is the same as the patch ID
	- `rad patch checkout e5f0a5a` to checkout a patch (latest revision)
	- Tested the whole flow with a [patch `b4c81b2` I created and reviewed](https://app.radicle.xyz/nodes/iris.radicle.xyz/rad%3Az3UCzhSC1ijx5f8t9pkKywQPjvRMq/patches/b4c81b227f4809c1ddf2d35f827409cfdbe9ae21)
- Private repos:
	- `rad init --private` 
	- Not encrypted at rest.
	- Add access via the allow list in the identity doc
		- `rad id update --title "Allow Calyx and seed.darkstar.example" --allow did:key:z6Mk....`
- Reviews:
	- You can leave per-line comments only in Radicle Desktop atm. To do so you first start a review
	- You can also make suggestions to a patch, but pushing your own revision.
	  Check out the patch, commit changes, and run `git push rad`
- Canonical Tags
	- Annotated tags (those that have messages and signatures) are Git objects themselves and are content addressed. A threshold number of delegates must announce the very same tag in their namespace for it to go canon.
	- Workflow: 
		- As a delegate: 
		  `git tag -a releases/v1.0.0` and
		  `git push rad releases/v1.0.0`
		- Other delegates, and my alias is `2color`, they would run the following
		- `git push -f rad 2color/tags/releases/v1.0.0:refs/tags/releases/v1.0.0`

### Protocol Guide
- In the introduction, I would add that Radicle augments/expands on the self-certifying nature of Git, where every commit hash is an integrity proof of the repository's state.
- All connections are encrypted with Noise XK (requiring the initiator to know the public key of the responder, i.e. the node dialled) 
- Gossip Protocol
	- Node announcements
		- Like libp2p identify and includes public addresses
	- Inventory announcements
		- Broadcast RepoIDs of the node
		- Used by peers to construct the routing table: 
			- `RepoID:NodeID[]`
	- Reference Announcements
		- Broad cast updates to repos and only relayed to nodes interested in a particular Repo
	- Each announcement includes the originating _Node ID_ along with a _cryptographic signature_ and _timestamp_, allowing network participants to verify the authenticity of messages before relaying them to peers.
- Federation vs. Peer-to-peer
	- Radicle seed nodes face similar to **federated models**, this has little bearing on the end user: seed nodes are **interchangeable** and offer an **undifferentiated** service; they are not tied to a user’s identity or access to the network. 
	- By analogy, it's a bit like *pubs*, if one refuses to accept you, you can get a beer with a friend at another pub.
- Repositories
	- Git repositories supplemented with a unique repository identifier (RID) and metadata essential for validating the authenticity of its contents.
	- RID is derived from the hash of the initial repository idendity document
- Storage is designed in such a way that it’s easy to transfer data between peers over the network using an unmodified Git protocol. Radicle repositories are simply Git repositories stored in a special location on disk.
- Git URL Scheme
	- rad://RID/NID
	- Namespaces follow the same hierarchy 


### Technical
- [How node spawning works in `rad node start`](https://app.radicle.xyz/nodes/seed.radicle.xyz/rad%3Az3gqcJUoA1n9HaHKufZs5FCSGazv5/tree/crates/radicle-cli/src/commands/node/control.rs#L64)
	- **No SIGHUP** - Child (radicle-node) won't receive hangup signal because: - stdin is `/dev/null` (not the terminal) - stdout/stderr are file descriptors (not the terminal) - Child is not in the terminal's foreground process group. 
	- By redirecting stdio away from terminal, parent (rad cli) exits naturally, and radicle-node gets reparented and continues independently.
- After cloning, when you run `git push rad DEFAULT_BRANCH` a local reference is created in my Node ID's namespace.
	- Can be viewed via `rad inspect --refs`
	- Or directly in the radicle stroage `~/.radicle/storage/z3gqcJUoA1n9HaHKufZs5FCSGazv5/refs/namespaces/z6MktwkohCx8aHZ1QCjVZUiLmX92oPZFxRiFZkbq32Tk5Tkm/rad`
- Analytics for explorer https://plausible.io/app.radicle.**xyz**
## Questions and answers

- What's the difference between `RID` which you get with `rad .` and the output of `rad id`?
	- `rad .` → Repository ID (identifies _a project_)
	- `rad id` → Manages repository identity (doesn't output an ID)
- How do human friendly names work?
	- Aliases are picked by the node and sent in Node Announcements that are  Noise connections
- Running `push rad HEAD:refs/patches` twice from the same branch and same head will create two patches with the same head. But doesn't create a remote tracking branch. Why?
- What's the logic of showing all cloned repos in `rad seed` but only the ones with scope `all` in `rad ls`?
	- `rad ls` by default will only show repos you've interacted with (or pushed a reference)
	
> To prevent endless propagation, nodes drop any message already encountered. However, for the sake of broadcasting messages to new nodes, gossip messages may be temporarily stored and replayed to nodes joining the network for the first time, or after a long period of being offline.

- Will messages from originating from other nodes be also temporarily stored by intermediate nodes for replaying?
- Where does the link between an identity document and signed repo refs happen? 
	- Signed refs are stored in the bare repo, in the Node specific namespace 
	- radicle uses each NID's namespace to store refs that each point to –sometimes disparate– trees: 
	  - `rad/id`: points to the latest identity COB
	  - `rad/sigrefs` tracks all the `refs` for a given NID with their crypto signature
	  - `rad/root`: points to the initial identity commit tree from which the RID is derived
  - `cob/*` refs, which correspond to repo identity, issues, and patches


### Self certifying: merkle DAGs, COBs and signed refs

- My NID: `z6MktwkohCx8aHZ1QCjVZUiLmX92oPZFxRiFZkbq32Tk5Tk`
- Identity doc is a disjount graph
- radicle patches are Git commit object that point to a a tree containing the cobs and stored in the bare repo in the local radicle path.
```
$ git cat-file -p 15214cb80771f8d0715ab66cfad8d6eae3a3686d
tree f6054c2c91caee222fd0adf4faafc392d35b72cd
parent 02318f199c6f29a2eede1f282e1f9b99927d27ec (base)
parent ce488ea10c2699d245ff5ac656ad6863c64a2ef6 (head of patch branch)
parent 45e43cc54284f579deb7ae64e4d162274c04fa3b (rad identity doc for the repo)
```
- has three parent hashes:
		1. Base branch
		2. Head branch
		3. rad identity document version
	- Points to a tree `f6054c2c91caee222fd0adf4faafc392d35b72cd` (is it disjoint?) containing the Radicle COBs 
- Later revisions of a patch, will be Git commit objects pointing to 4 parent hashes:
		1. Previous revision
		2. Base branch
		3. Head branch
		4. rad identity document version

```
➜  z3gqcJUoA1n9HaHKufZs5FCSGazv5 git:(master) git cat-file -p f6054c2c91caee222fd0adf4faafc392d35b72cd
100644 blob 2661c56ad78f2afee5cf9932a75b82d85278ce06	0
100644 blob 484f98189d75f7ae8fdbfca8c486bad5481e00c7	1
100644 blob 6188fc17654e90f02710d728472e9011daff495f	manifest

➜  z3gqcJUoA1n9HaHKufZs5FCSGazv5 git:(master) git show 2661c56ad78f2afee5cf9932a75b82d85278ce06
{"base":"02318f199c6f29a2eede1f282e1f9b99927d27ec","description":"The `rad fork` command was found to be confusing both in name and function.\nRather than creating a hard fork of a repository, with a new identity,\nit pushes the default branch to the local user's namespace.\n\nThis change modifies the copy of the help output, and marks the command\nas obsolete.","oid":"ce488ea10c2699d245ff5ac656ad6863c64a2ef6","type":"revision"}

➜  z3gqcJUoA1n9HaHKufZs5FCSGazv5 git:(master) git show 484f98189d75f7ae8fdbfca8c486bad5481e00c7
{"target":"delegates","title":"cli: mark `rad fork` as obsolete","type":"edit"}

➜  z3gqcJUoA1n9HaHKufZs5FCSGazv5 git:(master) git show 6188fc17654e90f02710d728472e9011daff495f
{"typeName":"xyz.radicle.patch","version":1}
```

The following commands inspect my interaction giving a thumb up to a patch `15214cb80771f8d0715ab66cfad8d6eae3a3686d` created by `fintohaps z6Mkire…SQZ3voM` using the radicle UI

```
# My NID: 
$ rad self --did
did:key:z6MktwkohCx8aHZ1QCjVZUiLmX92oPZFxRiFZkbq32Tk5Tkm

# What is my sigref (NID:git OID for the sigref)
$ rad inspect --sigrefs | grep z6MktwkohCx8aHZ1QCjVZUiLmX92oPZFxRiFZkbq32Tk5Tk
z6MktwkohCx8aHZ1QCjVZUiLmX92oPZFxRiFZkbq32Tk5Tkm 97b4a58fd356d36ab41f39b29de714661abd46a2


# What's the RID for Heartwood:
$ rad .
rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5

# View the sigref commit object in the 
git -C ~/.radicle/storage/z3gqcJUoA1n9HaHKufZs5FCSGazv5 show 97b4a58fd356d36ab41f39b29de714661abd46a2

commit 97b4a58fd356d36ab41f39b29de714661abd46a2
Author: 2color <2color@z6MktwkohCx8aHZ1QCjVZUiLmX92oPZFxRiFZkbq32Tk5Tkm>
Date:   Mon Jan 12 12:22:54 2026 +0100

    Update signed refs


modified: refs
@ refs:1 @
## This is the new signed reference for my reaction to 15214cb80771f8d0715ab66cfad8d6eae3a3686d
6a883d6205a35a892890efa086127fc9f3792878 refs/cobs/xyz.radicle.patch/15214cb80771f8d0715ab66cfad8d6eae3a3686d 
3168107df942dc71605e4fa25069569a43d467e9 refs/heads/master
666cbd6f41c9cb3ddd2614018ef4786bff7a436a refs/rad/root
f80316fbb2408ef31abfc652f8b5cc524289373e refs/tags/releases/0.9.0
modified: signature
@ signature:1 @
...

# The signed ref points to a commit object for my reacttion
# with two parents pointing to the Patch ID, and the identity document
$ git show 6a883d6205a35a892890efa086127fc9f3792878

commit 6a883d6205a35a892890efa086127fc9f3792878
Merge: 15214cb80 45e43cc54
Author: 2color <2color@z6MktwkohCx8aHZ1QCjVZUiLmX92oPZFxRiFZkbq32Tk5Tkm>
Date:   Mon Jan 12 12:22:54 2026 +0100

    React

    Rad-Resource: 45e43cc54284f579deb7ae64e4d162274c04fa3b

modified: 0
{"active":true,"reaction":"👍","revision":"15214cb80771f8d0715ab66cfad8d6eae3a3686d","type":"revision.react"}
```

The key thing to understand is that each user stores their COBs in their git namespace denoted by the NID, and those can point to COBs created by other users/maintainers that are stored in their namespace.

### Why the `rad/root` was added

Added in `989edacd564fa658358f5ccfd08c243c5ebd8cda` and included in Radicle 1.1
[#Support > How signed refs and self-certification work @ 💬](https://radicle.zulipchat.com/#narrow/channel/369873-Support/topic/How.20signed.20refs.20and.20self-certification.20work/near/569024381)


## Feedback

### User guide
- Remote is a git term, but can be misleading if it refers to the "bare" local hidden stored copy:
  > With Radicle, you will typically be interacting with two different repository copies on your device, the _working copy_ and a hidden, _stored copy_ that you interact with via `git push rad` and `git pull rad` commands 
  and later:
  > Whenever you execute a `git push rad` command, you are pushing the changes in your local working copy to your **remote** copy.
- `rad seed rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5 --scope followed` is a bit misleading. Why not `--scope delegates`
- Working with issues assumes the reader has a copy of the `dark-star` repository, but it 
- In the collaboration section, it might be useful to add a short section on what happens while you alternate from being offline/online and how it affects usage
- The Selectively Revealing Repositories could benefit from a simple diagram with 3 nodes representing the two collaborators and the seed node and visualise the flow of data over a noise encrypted connection (which mutually authenticates the peers). 
- More broadly, having a section or a table of all the different identifiers one works with would help a lot. 

### Protocol Guide
- I'd like to the canonical JSON spec
- The multibase IETF spec draft has expired. It seems unlikely it will get ratified
- In the [guide](https://radicle.xyz/guides/protocol#local-first-storage), local clones/copies of repos are referred to as *forks*, but given [#Support > ✔ What's `rad fork` about?](https://radicle.zulipchat.com/#narrow/channel/369873-Support/topic/.E2.9C.94.20What's.20.60rad.20fork.60.20about.3F/with/567464192) doesn't it make sense to refer to them as local clones/copies?
  Later it says:
  "This _logical repository_ is also known as the repository _fork_ or _view_"

### Feedback from usage
- A typical Radicle user interacts with many different kinds of non-human readable identifiers (COB): commit hashes, Repo IDs, Node IDs, Issue ID, Patch ID, & RevisionIDs. 
	- **How do users distinguish between these identifiers??* 
	- For example, if you want to follow a nid, you might look at contributors via `rad patch --merged` which only shows the shorthand notation `z6Mkire…SQZ3voM` but then `rad follow z6Mkire…SQZ3voM` is considered invalid
	- Also worth thinking about [multiformats](https://multiformats.io) here (not an endorsement!) but encoding some metadata into the identifier you pass around can be helpful for parsers. 
- It seems a little unintuitive that you can't view the full identity with `rad id` so you need `rad inspect --identity`
- Which commands do I need to run to get the latest canonical references?
	- `git ls-remote rad`
- The workflow for contributors agreeing on canonical refs is slightly confusing, especially if it's an annotated tag, e.g `$ git push -f self rudolfs/tags/releases/0.22.0:refs/tags/releases/0.22.0`
- The absence of [deep links](https://v2.tauri.app/plugin/deep-linking/) hinder smooth transition across contexts/apps
	- flow from the web explorer to the native app is currently none existent. So when someone shares a patch out-of-band, like on Zulip, e.g. [https://app.radicle.xyz/.../patches/83fbdf](https://app.radicle.xyz/nodes/seed.radicle.xyz/rad%3Az371PVmDHdjJucejRoRYJcDEvD5pp/patches/83fbdf33b783991691e41656528bb47d2a3cf11c "https://app.radicle.xyz/nodes/seed.radicle.xyz/rad%3Az371PVmDHdjJucejRoRYJcDEvD5pp/patches/83fbdf33b783991691e41656528bb47d2a3cf11c") and you view it, there's no way for you to open it in the app. 


## Resources

- https://lwn.net/Articles/966869/

## Cheatsheet
### Get the latest canonical references
```
rad sync -f
git ls-remote rad
```

### Update repo name

Repo name is mutable and defined in the identity document
```
rad id update --edit
```

### Create a patch
```sh
git push rad HEAD:refs/patches
```


## Terminology
- The bare repository is referred to as the "stored copy"