---
title: "Obsidian Clippings → Kindle Sync Bot"
description: "A bot that watches an Obsidian vault folder for web clippings and automatically sends them to a Kindle as EPUBs"
tags:
  - obsidian
  - kindle
  - automation
---

## Problem

I save a lot of web articles using the Obsidian Web Clipper, but I rarely read them at my desk. I'd rather read them on my Kindle. Manually converting and transferring each clipping is tedious enough that I just don't do it, so they pile up unread.

The goal: watch a folder in my Obsidian vault for new clippings, convert them to EPUB, and send them to my Kindle automatically.

## Input Format

The Obsidian Web Clipper saves markdown files with YAML frontmatter containing the source URL, title, author, and clip date. The body is standard markdown — headings, links, images, code blocks. This is the input we need to handle.

## Delivery Methods

### stkclient (preferred)

[stkclient](https://github.com/nickelc/stkclient) is a Python client for Amazon's Send to Kindle service. It uploads directly via Amazon's API with no file size limit and doesn't require configuring an approved email sender.

The catch: it's reverse-engineered from Amazon's closed protocol. Amazon could change the API at any time and break it. Treat this as the happy path but don't depend on it exclusively.

### Email fallback (@kindle.com)

Every Kindle has a `@kindle.com` email address. Send an EPUB as an attachment and it appears in the Kindle library. This is the official method and won't break, but it has a 10MB attachment limit and requires the sender address to be whitelisted in Amazon's settings.

Use email as the fallback when stkclient fails or isn't configured.

## Architecture

```
obsidian vault/clippings/
        │
        ▼
   [watch folder for new .md files]
        │
        ▼
   [convert markdown → EPUB via pandoc]
        │
        ▼
   [upload via stkclient or email]
        │
        ▼
   [record sent file in state log]
```

### Conversion

Use `pandoc` to convert markdown to EPUB. Pandoc handles the frontmatter, images, and formatting well enough out of the box. Options to consider:

- `--metadata title` pulled from frontmatter
- `--metadata author` from frontmatter or source domain
- `--epub-cover-image` if the clipping has a hero image
- CSS stylesheet for readable Kindle typography

### State Tracking

Keep a simple JSON or SQLite log of files already sent (path + hash + timestamp). On each run, diff the folder contents against the log to find new or modified clippings. This avoids sending duplicates and makes the bot idempotent.

### Batching

Some clippings are short — a few paragraphs. Sending each as a separate EPUB clutters the Kindle library. Optionally bundle multiple clippings into a single EPUB, like a daily or weekly digest. Pandoc can combine multiple markdown files into one EPUB with a generated table of contents.

## Configuration

```yaml
vault_path: ~/Documents/Obsidian/Vault/Clippings
watch_pattern: "*.md"

# stkclient auth (preferred)
kindle_device_id: ...
amazon_cookies: ...

# email fallback
kindle_email: user_abc@kindle.com
sender_email: me@example.com
smtp_host: smtp.example.com

# conversion
pandoc_args: ["--css", "kindle.css"]
batch_mode: daily  # or "none" for one-at-a-time
```

## Deployment Options

- **Cron job**: simplest. Run every hour, process new files, exit. No daemon, no state beyond the log file.
- **Daemon / file watcher**: use `watchdog` (Python) or `fswatch` to react to new files immediately. More responsive but another process to manage.
- **Obsidian plugin**: run inside Obsidian itself. Tightest integration but means writing TypeScript and dealing with the Obsidian plugin API. Probably overkill.

Cron is the right starting point. Graduate to a daemon only if the delay matters.

## Edge Cases and Limitations

- **stkclient breakage**: Amazon changes their API and stkclient stops working. The bot should detect upload failures and fall back to email automatically, or queue files for retry.
- **Large clippings with images**: images need to be downloaded and embedded in the EPUB. If a clipping references external images that are no longer available, pandoc will fail or produce a broken EPUB. Handle gracefully — skip missing images or use alt text.
- **Frontmatter variations**: not all clippings will have the same frontmatter fields. The conversion step should have sensible defaults (e.g., filename as title if no title field).
- **Duplicate detection**: if a clipping is edited after being sent, should it be re-sent? Probably not by default — use content hash to detect changes but require explicit opt-in for re-sends.
- **Rate limiting**: Amazon may throttle or block if you send too many files too quickly. Add a delay between uploads.
