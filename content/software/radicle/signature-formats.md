---
title: Signature formats
description: How Radicle packages its ed25519 signatures, from bare 64-byte sigrefs to the non-standard SSHSIG-armored COB commits.
tags:
  - radicle
project: Radicle
---

Radicle uses ed25519 for all cryptographic signatures. The signing primitive is the same everywhere: a plain ed25519 signature over the raw payload bytes, produced via `signature::Signer::try_sign` (`crates/radicle-crypto/src/lib.rs:38-41`). The 64 resulting bytes are packaged differently depending on where they are stored.

## Where the signatures come from

Two production `Signer` implementations produce the underlying 64-byte signature:

- **`AgentSigner`** (`crates/radicle-crypto/src/ssh/agent.rs:138-147`). Signs via ssh-agent IPC. The agent receives the raw payload bytes and returns the raw 64-byte ed25519 signature.
- **`MemorySigner`** (`crates/radicle-crypto/src/ssh/keystore.rs:253-256`). Signs locally with an in-memory `SecretKey` loaded from the on-disk Keystore (passphrase-decrypted). Calls `secret.sign(msg, None)` directly.

Both produce identical output for the same key and payload, because ed25519 is deterministic (RFC 8032). The other `Signer` impls in the tree (`Device`, `BoxedSigner`, `BoxedDevice` at `crates/radicle/src/node/device.rs:127-196`) are generic wrappers that delegate to one of these two.

## 1. Bare 64-byte signature

Used for signed refs (sigrefs), identity documents, and most internal protocol messages.

The raw `ed25519::Signature` is stored as-is. For display and serialisation it is multibase base58btc-encoded.

- Encoding: `Signature::Display` at `crates/radicle-crypto/src/lib.rs:65-70`.
- Parsing: `Signature::FromStr` at `crates/radicle-crypto/src/lib.rs:93-102`.
- Verification: `PublicKey::verify` at `crates/radicle-crypto/src/lib.rs:161-167`. Calls `ed25519::PublicKey::verify(payload, signature)` directly on the raw payload.

## 2. SSHSIG-armored PEM

Used for collaborative-object (COB) change commits. Embedded in the commit's `gpgsig` header as a `-----BEGIN SSH SIGNATURE-----` block.

The raw 64-byte signature is wrapped into an `ssh_key::SshSig` envelope with namespace `"radicle"` and hash algorithm `Sha256`.

- Encoding: `ExtendedSignature::to_pem` at `crates/radicle-crypto/src/ssh.rs:44-55`.
- Parsing: `ExtendedSignature::from_pem` at `crates/radicle-crypto/src/ssh.rs:58-70`. Extracts the public key and raw 64-byte signature from the envelope.
- Sign path: `signer.sign(revision.as_bytes())` at `crates/radicle-cob/src/backend/git/change.rs:119`, then wrapped via `to_pem` into the `gpgsig` header at `crates/radicle-cob/src/backend/git/change.rs:289-296`.
- Verify path: `key.verify(self.revision.as_ref(), sig)` at `crates/radicle-cob/src/change/store.rs:125,134`.

### Non-standard SSHSIG quirk

The bytes inside the armor are not a standards-compliant SSHSIG signature. OpenSSH's `ssh-keygen -Y sign` signs the SSHSIG inner framing:

```
"SSHSIG" ‖ string(namespace) ‖ uint32(0) ‖ string(hash_algorithm) ‖ string(HASH(payload))
```

Radicle skips this step. The bytes inside the armor are a plain ed25519 signature over the raw payload (the COB tree OID), exactly like the bare-signature case above. The SSHSIG envelope is used purely as a transport packaging that fits into a git `gpgsig` header.

Consequence: `ssh-keygen -Y verify` will reject any signature heartwood produces, and any signature `ssh-keygen -Y sign` produces will fail heartwood's verification. The two flows share an envelope but not a signing scheme.

The `namespace` and `hash_algorithm` fields are decorative for verification. They are fixed to `"radicle"` and `"sha256"` only so that `to_pem` output is byte-stable.

## Implications for external tooling

Anything generating signatures heartwood will accept (browser clients, alternative signers) must:

1. Sign the raw payload directly with ed25519. Do not build the SSHSIG inner framing.
2. For COB commits: wrap the resulting 64 bytes in an SSHSIG envelope with namespace `"radicle"` and hash algorithm `"sha256"`, to match `ExtendedSignature::to_pem` byte-for-byte.
3. For everything else: emit the bare 64 bytes; multibase-encode if a string form is needed.
