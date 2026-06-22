---
title: ZFS
description: Advanced filesystem and volume manager with built-in data integrity and RAID capabilities
date: 2025-10-31
tags:
  - RAID
  - NAS
  - self-hosting
  - file-system
---

## Overview

ZFS (Zettabyte File System) is a combined file system and logical volume manager originally designed by Sun Microsystems. It provides advanced features for data integrity, storage management, and protection against data corruption.

ZFS also supports software RAID which reduces dependency on specific hardware RAID in cases of hardware failure.

### Key Features

- **Copy-on-Write (COW)** - Never overwrites data in place, writes new blocks and updates pointers
- **Data Integrity** - End-to-end checksumming detects and corrects silent data corruption
- **Snapshots** - Instant, space-efficient point-in-time copies of datasets
- **RAID-Z** - Software RAID with parity that eliminates the RAID-5 write hole
- **Compression** - Built-in transparent compression (LZ4, GZIP, ZSTD)
- **Deduplication** - Eliminates duplicate data blocks (RAM intensive)
- **ARC (Adaptive Replacement Cache)** - Intelligent caching system using RAM
- **Pool-based Storage** - Combines multiple devices into storage pools (zpools)

## Key Concepts

### Storage Hierarchy

1. **Physical Disks** - The actual storage devices
2. **VDEVs (Virtual Devices)** - Groups of disks organized for redundancy
3. **Zpools** - Storage pools made up of one or more vdevs
4. **Datasets** - Filesystems or volumes within a zpool

#### Example: Home Media Server Setup

Let's say you have 6 physical disks and want to set up a media server:

**Physical Layer:**

- 6 x 4TB hard drives: `/dev/sda`, `/dev/sdb`, `/dev/sdc`, `/dev/sdd`, `/dev/sde`, `/dev/sdf`

**VDEV Layer:**

- VDEVs are defined when creating the pool (no separate command)
- We'll create 3 mirror vdevs (each with 2 disks for redundancy):
  - Mirror VDEV 1: `/dev/sda` + `/dev/sdb`
  - Mirror VDEV 2: `/dev/sdc` + `/dev/sdd`
  - Mirror VDEV 3: `/dev/sde` + `/dev/sdf`

**Zpool Layer:**

- Create the pool and define all vdevs in a single command:

  ```bash
  zpool create mediapool \
    mirror /dev/sda /dev/sdb \
    mirror /dev/sdc /dev/sdd \
    mirror /dev/sde /dev/sdf
  ```

  Each `mirror` keyword followed by disk paths creates one mirror vdev.

- Total usable capacity: ~12TB (50% efficiency due to mirroring)
- Can lose one disk from each mirror pair without data loss
- To add more vdevs later: `zpool add mediapool mirror /dev/sdg /dev/sdh`

**Dataset Layer:**

- Create separate datasets for different content types:
  ```bash
  zfs create mediapool/movies           # For movie files
  zfs create mediapool/tv               # For TV shows
  zfs create mediapool/music            # For music library
  zfs create mediapool/photos           # For photo backups
  ```

**Benefits of this structure:**

- Each dataset can have different properties (compression, quotas, snapshots)
- You can snapshot individual datasets independently
- Different mount points for organization (`/mnt/movies`, `/mnt/tv`, etc.)
- Share datasets via NFS/SMB without affecting others

**Example with properties:**

```bash
# Enable compression on movies (high benefit for some codecs)
zfs set compression=lz4 mediapool/movies

# Disable atime on all datasets (performance boost)
zfs set atime=off mediapool

# Set quota on photos to prevent runaway storage
zfs set quota=2T mediapool/photos

# Create daily snapshots of photos
zfs snapshot mediapool/photos@daily-$(date +%Y%m%d)
```

This hierarchy allows you to manage 6 physical disks as a single logical pool with organized datasets, each optimized for its specific use case.

### VDEV Types

- **Mirror** - Two or more disks with identical copies (recommended for most use cases)
- **RAIDZ1** - Single parity (like RAID-5, requires 3+ disks)
- **RAIDZ2** - Double parity (like RAID-6, requires 4+ disks)
- **RAIDZ3** - Triple parity (requires 5+ disks)
- **Stripe** - No redundancy, data spread across disks (not recommended)

**Important**: You should use mirror vdevs instead of RAIDZ for better performance and resilience. See [Mirror > RAIDZ](#why-mirror-vdevs-over-raidz)

### Datasets vs Volumes

- **Dataset (Filesystem)** - Standard filesystem that can be mounted
- **Volume (ZVOL)** - Block device that can be used for VMs or other systems

### Accelerating Pools with Fast Storage

Add SSDs/NVMe to boost performance without replacing main storage:

**Cache (L2ARC)** - Extends read cache beyond RAM

- `zpool add mypool cache /dev/nvme0n1`
- No redundancy needed; requires ~1GB RAM per 10GB cache
- Only useful for read-heavy workloads exceeding RAM

**Log (SLOG/ZIL)** - Accelerates synchronous writes (databases, NFS, VMs)

- `zpool add mypool log mirror /dev/nvme0n1 /dev/nvme0n2`
- Mirror recommended; use power-protected NVMe
- No benefit for asynchronous writes

**Special VDEVs** - Stores metadata and small blocks on fast storage

- `zpool add mypool special mirror /dev/nvme0n1 /dev/nvme0n2`
- **Must be redundant** - losing this vdev destroys the entire pool
- Enable small blocks: `zfs set special_small_blocks=32K mypool/dataset`

## Command Cheat Sheet

### Pool Management

```bash
# Create a pool with a single disk (no redundancy)
zpool create mypool /dev/sda

# Create a mirrored pool
zpool create mypool mirror /dev/sda /dev/sdb

# Create a pool with multiple mirror vdevs
zpool create mypool mirror /dev/sda /dev/sdb mirror /dev/sdc /dev/sdd

# Create a RAIDZ1 pool (not recommended, use mirrors instead)
zpool create mypool raidz1 /dev/sda /dev/sdb /dev/sdc

# Add a mirror vdev to existing pool
zpool add mypool mirror /dev/sde /dev/sdf

# Check pool status
zpool status

# View pool I/O statistics
zpool iostat -v 5

# Export pool (safely disconnect, flushes all data to disk)
zpool export mypool

# List all importable pools
zpool import

# Import a pool by name
zpool import mypool

# Import pool with different name
zpool import oldname newname

# Force import (use when pool wasn't cleanly exported)
zpool import -f mypool

# Scrub pool (verify data integrity)
zpool scrub mypool
```

### Dataset Management

```bash
# Create a dataset
zfs create mypool/mydataset

# Create a dataset with compression
zfs create -o compression=lz4 mypool/mydataset

# List all datasets
zfs list

# Set properties on a dataset
zfs set compression=lz4 mypool/mydataset
zfs set quota=100G mypool/mydataset

# Get properties
zfs get all mypool/mydataset
zfs get compression mypool/mydataset

# Destroy a dataset
zfs destroy mypool/mydataset
```

### Snapshots

```bash
# Create a snapshot
zfs snapshot mypool/mydataset@snapshot1

# List snapshots
zfs list -t snapshot

# Rollback to a snapshot (destroys newer data)
zfs rollback mypool/mydataset@snapshot1

# Clone a snapshot (create writable copy)
zfs clone mypool/mydataset@snapshot1 mypool/clone

# Destroy a snapshot
zfs destroy mypool/mydataset@snapshot1

# Send/receive snapshots (backup/replication)
zfs send mypool/mydataset@snapshot1 | zfs receive backuppool/mydataset
```

### Monitoring and Maintenance

```bash
# Check pool health
zpool status

# View detailed pool information
zpool list -v

# Check for errors
zpool status -x

# Clear error counters
zpool clear mypool

# Replace a failed disk
zpool replace mypool /dev/olddisk /dev/newdisk

# View ARC cache statistics
arc_summary

# Check dataset space usage
zfs list -o space
```

### Common Properties

```bash
# Enable compression (highly recommended)
zfs set compression=lz4 mypool/mydataset

# Set mount point
zfs set mountpoint=/mnt/data mypool/mydataset

# Set quota
zfs set quota=500G mypool/mydataset

# Set reservation (guaranteed space)
zfs set reservation=100G mypool/mydataset

# Disable atime (access time tracking, improves performance by reducing writes)
# atime updates the file metadata on every read, causing extra disk writes
zfs set atime=off mypool/mydataset

# Set record size (default 128K, adjust for workload)
zfs set recordsize=1M mypool/mydataset
```

## Best Practices

1. **Use mirror vdevs** instead of RAIDZ for better performance and resilience
2. **Enable compression** (LZ4 has minimal CPU overhead and is usually a net performance gain)
3. **Regular scrubs** - Schedule monthly scrubs to detect corruption early
4. **Monitor pool health** - Check `zpool status` regularly
5. **Leave 20% free space** - ZFS performance degrades when pools are >80% full
6. **Disable atime** - Set `atime=off` unless you need access time tracking
7. **Plan for expansion** - You cannot remove vdevs from a pool, only add them
8. **Snapshot regularly** - Snapshots are cheap and provide excellent recovery points
9. **Test your backups** - Practice restoring from snapshots and replicated pools

### Why Mirror VDEVs Over RAIDZ

- **Storage efficiency is acceptable** - 50% storage efficiency with mirrors provides adequate capacity while prioritizing performance and resilience
- **Superior performance** - For a given number of disks, mirror pools significantly outperform RAIDZ configurations
- **Degraded performance** - Mirror pools maintain substantially better performance than RAIDZ when operating in a degraded state
- **Faster rebuilds** - Mirror pools rebuild significantly faster than RAIDZ pools after disk failure
- **Operational simplicity** - Mirror pools are easier to manage, maintain, and upgrade than RAIDZ configurations

## Resources

- [ZFS on Linux Documentation](https://openzfs.github.io/openzfs-docs/)
- [Why you should use mirror vdevs, not RAIDZ](https://jrs-s.net/2015/02/06/zfs-you-should-use-mirror-vdevs-not-raidz/)
- [FreeBSD ZFS Tuning Guide](https://wiki.freebsd.org/ZFSTuningGuide)
- [Oracle ZFS Administration Guide](https://docs.oracle.com/cd/E19253-01/819-5461/index.html)
