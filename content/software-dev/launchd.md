---
title: launchd
description: macos
date: 2025-10-30
tags:
  - macos
  - self-hosting
---

- [launchd](https://www.launchd.info/) is the process manager used by macOS to run scripts and programs at specified intervals or events.
- Similar to systemd or cron in Linux.
- Runs either daemons or agents, where an agent runs on behalf of the logged-in user while a daemon runs on behalf of the root user or any user you specify.
- The behavior of a daemon/agent is specified in a **job definition** XML file also called a **property list** (`.plist`).
- Depending on where the `.plist` file is stored, it will be treated as a daemon or an agent.

## Usage

Steps to set up an agent or daemon:

1. Create a program that you want to run in the background
2. Create a `.plist` file describing the job to run
3. Store it in the relevant location based on the type of agent or daemon you want to create (see table below)
4. Bootstrap the job with `launchctl`:
   - For user agents: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.example.job.plist`
   - For global daemons: `sudo launchctl bootstrap system /Library/LaunchDaemons/com.example.job.plist`
5. Start the job immediately (optional): `launchctl kickstart -k gui/$(id -u)/com.example.job`

Note: You only need to bootstrap the job once when you first create or install it. Upon reboot or login, all agents and daemons will be automatically loaded and run according to their `.plist` configuration.

| Type           | Location                        | Run on behalf of                                 |
| -------------- | ------------------------------- | ------------------------------------------------ |
| User Agents    | `~/Library/LaunchAgents`        | Currently logged in user                         |
| Global Agents  | `/Library/LaunchAgents`         | Currently logged in user                         |
| Global Daemons | `/Library/LaunchDaemons`        | root or the user specified with the key UserName |
| System Agents  | `/System/Library/LaunchAgents`  | Currently logged in user                         |
| System Daemons | `/System/Library/LaunchDaemons` | root or the user specified with the key UserName |

## Common launchctl commands

### Modern syntax (macOS 10.11+)
- `launchctl bootstrap <domain> <path>` - Load a job into the specified domain
  - User domain: `gui/$(id -u)`
  - System domain: `system`
- `launchctl bootout <domain> <path>` - Unload a job from the specified domain
- `launchctl kickstart [-k] <service-target>` - Start or restart a service
  - Example: `launchctl kickstart -k gui/$(id -u)/com.example.job`
- `launchctl print <domain>/<service>` - Print information about a service
- `launchctl list` - List all loaded services
- `launchctl enable <service-target>` - Enable a service
- `launchctl disable <service-target>` - Disable a service

### Legacy syntax (still works but deprecated)
- `launchctl load <path>` - Load a job (deprecated, use `bootstrap`)
- `launchctl unload <path>` - Unload a job (deprecated, use `bootout`)
- `launchctl start <label>` - Start a job (deprecated, use `kickstart`)
- `launchctl stop <label>` - Stop a job (deprecated, use `kill`)

## Example .plist file

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.example.myjob</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/my-script.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>3600</integer>
    <key>StandardOutPath</key>
    <string>/tmp/myjob.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/myjob.err</string>
</dict>
</plist>
```

### Key .plist properties
- `Label` - Unique identifier for the job (required)
- `ProgramArguments` - Array of command and arguments to run (required)
- `StartInterval` - Run every N seconds
- `StartCalendarInterval` - Run at specific times (like cron)
- `RunAtLoad` - Run immediately when loaded
- `KeepAlive` - Keep the process running, restart if it exits
- `StandardOutPath` / `StandardErrorPath` - Log file locations
- `WorkingDirectory` - Set the working directory for the process
- `EnvironmentVariables` - Dict of environment variables to set

## Helpful utilities

- [launched.zerowidth.com](https://launched.zerowidth.com/) - Tool to generate job definition list XML
- [LaunchControl](https://www.soma-zone.com/LaunchControl/) - GUI for managing launchd jobs
- [Lingon](https://www.peterborgapps.com/lingon/) - GUI for creating and managing jobs
