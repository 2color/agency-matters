---
title: Network File Sharing Protocols
description: Network File Sharing Protocols for Mac Clients, looking at NFS, SMB, and the now deprecated AFP
tags:
  - homelab
  - NFS
  - SMB
  - macos
---

### File Sharing for Mac Clients

When sharing files from a linux homelab to Mac clients, there are several protocol options:

#### Protocol Comparison

| Protocol  | Performance | macOS Integration  | Security                     |
| --------- | ----------- | ------------------ | ---------------------------- |
| **SMB3+** | Good        | Excellent (Finder) | Built-in encryption          |
| **NFS**   | Fastest     | Manual mount       | NFSv4+Kerberos or host-based |
| **AFP**   | Legacy      | Deprecated         | Weak                         |

#### NFS (Network File System)

- **Performance:** Generally fastest for large file transfers
- **macOS Support:** Native support, but requires manual configuration
- **Security:**
  - NFSv3: No encryption, relies on host-based access control (IP restrictions) and network security
  - NFSv4: Supports Kerberos authentication and encryption (RPCSEC_GSS), but requires Kerberos infrastructure
  - macOS support: macOS Sierra (10.12)+ supports NFSv4+Kerberos encryption with AES only (requires `sec=krb5p` mount option)
  - Older macOS versions (10.10-10.11) had broken RPCSEC_GSS implementation incompatible with Active Directory
  - Most homelab deployments use NFSv3 on trusted network segments without encryption due to setup complexity
- **Setup:** More complex configuration, requires NFS server setup (and Kerberos if encryption needed)
- **Use Case:** Best for bulk data transfers and server-to-server communication on trusted networks

#### SMB/CIFS (Server Message Block)

- **Performance:** Good performance, especially SMB3+ with modern implementations
- **macOS Support:** Native Finder integration, easy mounting via Finder's "Connect to Server"
- **Security:** SMB3+ includes encryption and modern authentication
- **Use Case:** Best general-purpose option for Mac clients, recommended by Apple as AFP replacement

#### AFP (Apple Filing Protocol)

- **Performance:** Historically optimized for Mac but now deprecated
- **macOS Support:** Legacy support only (deprecated since macOS 10.9)
- **Status:** Apple recommends migrating to SMB for all Mac file sharing
- **Use Case:** Only use if required for legacy macOS systems (pre-10.9)

#### Performance Considerations

- **Encryption:** for SMB on weak hardware can lead to significant performance degredation, especially on older Synology NAS
- **macOS Finder Limitations:** Be aware that Finder has known performance issues with network file copies
- **Reference:** [macOS Finder is still bad at network file copies](https://www.jeffgeerling.com/blog/2024/macos-finder-still-bad-network-file-copies)
- **Workaround:** Use command-line tools (`rsync`, `cp`) or third-party file managers for better performance

#### Recommendations

- **For most Mac users:** Use **SMB3+** as your primary file sharing protocol. It offers the best balance of performance, security, and ease of use with native Finder integration.
- **For large file transfers:** Consider **NFS** when moving large amounts of data between servers or for automated backup scripts where raw transfer speed is critical.
- **Avoid AFP:** Unless you're supporting legacy macOS systems (10.8 or earlier), AFP should not be used. Apple has deprecated it in favor of SMB.

### Reference

- [AFP vs NFS vs SMB Performance on macOS Mojave](https://photographylife.com/afp-vs-nfs-vs-smb-performance)
- [Automounting NFS in macOS](https://www.fkylewright.com/wordpress/2023/06/functional-automount-of-network-shares-in-macos/)