---
title: Restic
description: Powerful backup software with S3 and SFTP support, featuring deduplication, encryption, and snapshot management.
date: 2025-10-28
tags:
  - backup
  - cli
  - self-hosting
---

[Restic](https://restic.net/) is an extermely powerful backup software. It's nice because it supports many backends: S3, SFTP, etc without running any special daemon on the backend, i.e. the server.

It sports the following key features:

- Snapshot management
- Deduplication with content addressed stroage and custom chuncking.
- Written in Go
- Self-contained multi-platform binary
- Has been battle tested
- All backups are encrypted by default

From a user agency perspective, it's fantastic, because there's no vendor lock-in and it packs a lot of functionality, while maintaining some level of simplicity.

# Restic Cheat Sheet

A quick reference guide for restic backup operations with S3 and SFTP backends.

## Repository Setup

### S3 Backend

```bash
# AWS S3
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export RESTIC_REPOSITORY="s3:s3.amazonaws.com/bucket-name"
export RESTIC_PASSWORD="your-repo-password"

# Initialize repository
restic init

# S3-compatible services (MinIO, Wasabi, Backblaze B2)
export RESTIC_REPOSITORY="s3:s3.wasabisys.com/bucket-name"
export RESTIC_REPOSITORY="s3:s3.us-west-000.backblazeb2.com/bucket-name"
```

### SFTP Backend

```bash
# Basic SFTP
export RESTIC_REPOSITORY="sftp:user@host:/path/to/repo"
export RESTIC_PASSWORD="your-repo-password"

# SFTP with SSH key
export RESTIC_REPOSITORY="sftp:user@host:port/path/to/repo"
# Restic will use your ~/.ssh/id_rsa by default

# Initialize repository
restic init
```

## Environment Variables

```bash
# Essential variables
export RESTIC_REPOSITORY="s3:s3.amazonaws.com/bucket"
export RESTIC_PASSWORD="strong-password"

# For S3
export AWS_ACCESS_KEY_ID="key"
export AWS_SECRET_ACCESS_KEY="secret"

# Save to file for convenience
cat > ~/.restic-env << EOF
export RESTIC_REPOSITORY="s3:s3.amazonaws.com/bucket"
export RESTIC_PASSWORD="your-password"
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
EOF

# Load variables
source ~/.restic-env
```

## Backup Operations

### Basic Backup

```bash
# Backup a directory
restic backup /path/to/directory

# Backup multiple paths
restic backup /home /etc /var/log

# Backup with tag
restic backup /data --tag daily

# Backup with custom host name
restic backup /data --host myserver
```

### Backup with Exclusions

```bash
# Exclude specific files/directories
restic backup /home --exclude /home/*/.cache

# Exclude multiple patterns
restic backup /home \
  --exclude /home/*/.cache \
  --exclude /home/*/Downloads \
  --exclude '*.tmp'

# Exclude from file
restic backup /home --exclude-file=/path/to/excludes.txt

# Exclude if present (skip dirs with .nobackup file)
restic backup /data --exclude-if-present .nobackup
```

### Advanced Backup Options

```bash
# Dry run (show what would be backed up)
restic backup /data --dry-run

# Verbose output
restic backup /data --verbose

# One file system only (don't cross mount points)
restic backup /data --one-file-system

# Limit upload speed (in KB/s)
restic backup /data --limit-upload 1000

# Force full scan (don't use parent snapshot for comparison)
restic backup /data --force
```

## Restore Operations

### List Snapshots

```bash
# List all snapshots
restic snapshots

# List snapshots with specific tag
restic snapshots --tag daily

# List snapshots for specific host
restic snapshots --host myserver

# Show compact snapshot list
restic snapshots --compact
```

### Restore Files

```bash
# Restore latest snapshot to original location
restic restore latest --target /

# Restore latest snapshot to custom location
restic restore latest --target /tmp/restore

# Restore specific snapshot
restic restore abc123de --target /restore

# Restore with filters
restic restore latest --target /restore --include /home/user/documents

# Restore specific files/dirs
restic restore latest --target /restore --path /home/user/important.txt

# Restore excluding certain paths
restic restore latest --target /restore --exclude '*.log'
```

### Browse Snapshots

```bash
# Mount repository as filesystem
mkdir /mnt/restic
restic mount /mnt/restic

# Browse in another terminal, then unmount
fusermount -u /mnt/restic  # Linux
umount /mnt/restic         # macOS
```

## File Operations

### Find Files

```bash
# Find file in snapshots
restic find important.txt

# Find with pattern
restic find '*.pdf'

# Find in specific snapshot
restic find --snapshot abc123de important.txt
```

### Diff Snapshots

```bash
# Compare two snapshots
restic diff abc123de def456gh

# Compare with previous snapshot
restic diff latest
```

### List Files in Snapshot

```bash
# List all files in latest snapshot
restic ls latest

# List specific path
restic ls latest /home/user
```

## Maintenance

### Check Repository

```bash
# Quick check
restic check

# Full check (read all data)
restic check --read-data

# Check subset of data (10%)
restic check --read-data-subset=10%
```

### Prune Old Data

```bash
# Remove unreferenced data
restic prune

# Dry run
restic prune --dry-run

# Prune with aggressive cleanup
restic prune --max-unused 0
```

### Forget Old Snapshots

```bash
# Forget snapshots by policy
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --keep-yearly 3

# Forget and prune in one command
restic forget --prune --keep-daily 7 --keep-weekly 4

# Forget specific snapshot
restic forget abc123de

# Forget by tag
restic forget --tag old-system

# Keep last N snapshots
restic forget --keep-last 10

# Forget by host
restic forget --host old-server --keep-last 1
```

### Repository Statistics

```bash
# Show repository stats
restic stats

# Stats for specific snapshot
restic stats abc123de

# Show storage usage
restic stats --mode raw-data

# Stats by host
restic stats --host myserver
```

## Repository Management

### Change Password

```bash
restic key passwd
```

### List Keys

```bash
restic key list
```

### Add Key (for shared access)

```bash
restic key add
```

### Remove Key

```bash
restic key remove key-id
```

### Copy/Migrate Repository

```bash
# Copy to another repository
restic copy --repo2 /new/repo

# Copy specific snapshots
restic copy --repo2 /new/repo --tag important
```

### Rebuild Index

```bash
restic rebuild-index
```

### Unlock Repository

```bash
# If repository is locked after crash
restic unlock
```

## Automation & Scripting

### Backup Script Example

```bash
#!/bin/bash
# backup.sh

# Load environment
source ~/.restic-env

# Pre-backup commands
echo "Starting backup at $(date)"

# Run backup
restic backup /home /etc \
  --exclude-file=/root/restic-excludes.txt \
  --tag automated \
  --tag $(date +%Y-%m-%d) \
  --verbose

# Check exit status
if [ $? -eq 0 ]; then
    echo "Backup completed successfully"

    # Clean up old snapshots
    restic forget --prune \
      --keep-daily 7 \
      --keep-weekly 4 \
      --keep-monthly 12 \
      --keep-yearly 3
else
    echo "Backup failed!"
    exit 1
fi

echo "Backup finished at $(date)"
```

### Cron Job Example

```bash
# Daily backup at 2 AM
0 2 * * * /usr/local/bin/backup.sh >> /var/log/restic-backup.log 2>&1

# Weekly maintenance on Sunday at 3 AM
0 3 * * 0 source ~/.restic-env && restic forget --prune --keep-daily 7 --keep-weekly 4
```

### Systemd Timer Example

```ini
# /etc/systemd/system/restic-backup.service
[Unit]
Description=Restic Backup

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup.sh
EnvironmentFile=/root/.restic-env
```

```ini
# /etc/systemd/system/restic-backup.timer
[Unit]
Description=Restic Backup Timer

[Timer]
OnCalendar=daily
OnCalendar=02:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
# Enable and start timer
sudo systemctl enable restic-backup.timer
sudo systemctl start restic-backup.timer
```

### launchd (macOS)

With [[launchd]], create the job definition in `~/Library/LaunchAgents/matters.agency.restic-backup.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!-- See launchd.plist(5)for documentation on this file. -->
<!-- See https://www.launchd.info/ for a tutorial. -->
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
	<dict>
		<key>Label</key>
    <!-- Uses https://en.wikipedia.org/wiki/Reverse_domain_name_notation -->
		<string>matters.agency.restic-backup</string>

    <key>Program</key>
    <string>/Users/user/restic-backup/backup.sh</string>

    <key>WorkingDirectory</key>
    <string>/Users/user/restic-backup/</string>

    <key>StandardOutPath</key>
    <string>/Users/user/Library/Logs/restic-backup.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/user/Library/Logs/restic-backup.log</string>

      <key>EnvironmentVariables</key>
      <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin</string>
      </dict>

		<!-- Will schedule backup as soon as the job is loaded -->
		<key>RunAtLoad</key>
		<false/>

		<!-- Will schedule backup every day at 16:00 -->
		<key>StartCalendarInterval</key>
		<array>
			<dict>
				<key>Hour</key>
				<integer>16</integer>
				<key>Minute</key>
				<integer>00</integer>
			</dict>
		</array>
	</dict>
</plist>
```

```bash
launchctl bootstrap gui/501 ~/Library/LaunchAgents/matters.agency.restic-backup.plist

# To update job definition, edit, bootout, and bootstrap again
launchctl bootout gui/501 ~/Library/LaunchAgents/matters.agency.restic-backup.plist
```

#### Backup script with macOS notifications

```bash
#!/bin/bash

source .restic-env

echo $(date +"%Y-%m-%d %T") "Starting backup"

export PID_FILE=".restic.pid"

# Create a pid file to avoid concurrent backup processes
if [ -f "$PID_FILE" ]; then
  if ps -p $(cat $PID_FILE) > /dev/null; then
    echo $(date +"%Y-%m-%d %T") "File $PID_FILE exist. Probably backup is already in progress."
    exit 1
  else
    echo $(date +"%Y-%m-%d %T") "File $PID_FILE exist but process " $(cat $PID_FILE) " not found. Removing PID file."
    rm $PID_FILE
  fi
fi

echo $$ > $PID_FILE

# restic execution
restic backup --verbose --files-from ./backup-include.txt

rm $PID_FILE

if [ $? -eq 0 ]; then
    MESSAGE="Backup successful"
    echo $(date +"%Y-%m-%d %T") "$MESSAGE"
    osascript -e "display notification \"$MESSAGE!\" with title \"Restic\""
    exit 0
elif [ $? -eq 3 ]; then
    MESSAGE="Backup completed with warnings (some files unreadable)"
    echo $(date +"%Y-%m-%d %T") "$MESSAGE"
    osascript -e "display notification \"$MESSAGE\" with title \"Restic\""
    exit 0  # or exit 3 if you want to treat this as an error
else
    MESSAGE="Backup failed"
    echo $(date +"%Y-%m-%d %T") "$MESSAGE"
    osascript -e "display notification \"$MESSAGE\" with title \"Restic\""
    exit 1
fi

```

## Verification & Testing

### Verify Restore

```bash
# Test restore without actually writing files
restic restore latest --target /tmp/test --verify
```

### Generate Test Data

```bash
# Create test backup
restic backup /tmp/test-data --tag test
```

## Performance Tuning

```bash
# Limit CPU cores
restic backup /data --limit-cpu 2

# Adjust pack size (default 16 MiB)
restic backup /data --pack-size 32

# Control memory usage
restic backup /data --max-repack-size 2G

# Multiple simultaneous uploads
export RESTIC_PARALLEL_UPLOAD=8
```

## Troubleshooting

```bash
# Verbose output for debugging
restic backup /data --verbose --verbose

# Check what changed since last backup
restic backup /data --dry-run --verbose

# Unlock stuck repository
restic unlock

# Repair repository index
restic rebuild-index

# Check for errors
restic check --read-data

# Remove incomplete snapshots
restic forget --keep-last 1 --prune
```

## Useful Exclude Patterns

```
# .restic-excludes file example
*.tmp
*.temp
*.log
.cache/
node_modules/
__pycache__/
*.pyc
.git/
.DS_Store
Thumbs.db
*~
.Trash/
Downloads/
```

## Security Best Practices

1. **Store credentials securely**: Use environment files with restricted permissions

   ```bash
   chmod 600 ~/.restic-env
   ```

2. **Use separate keys for different users**

   ```bash
   restic key add  # Add additional access key
   ```

3. **Regular verification**

   ```bash
   restic check --read-data-subset=5%
   ```

4. **Test restores periodically**
   ```bash
   restic restore latest --target /tmp/test-restore --verify
   ```

## Quick Reference

| Command                              | Purpose                     |
| ------------------------------------ | --------------------------- |
| `restic init`                        | Initialize new repository   |
| `restic backup <path>`               | Create backup               |
| `restic snapshots`                   | List all snapshots          |
| `restic restore <id> --target <dir>` | Restore snapshot            |
| `restic forget --keep-daily 7`       | Forget old snapshots        |
| `restic prune`                       | Remove unused data          |
| `restic check`                       | Verify repository integrity |
| `restic mount <dir>`                 | Mount as filesystem         |
| `restic find <file>`                 | Find file in snapshots      |
| `restic unlock`                      | Unlock repository           |

---

**Note**: Always test your backup and restore procedures before relying on them in production!
