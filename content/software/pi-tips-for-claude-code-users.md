---
title: Pi tips for longtime Claude Code users
description: Practical tips for Claude Code users switching to pi, covering planning, session branching, project instructions, and customization.
date: 2026-10-21
tags:
  - ai
  - cli
  - software
---

# Pi tips for longtime Claude Code users

The biggest shift from Claude Code: **treat pi as a small coding-agent core that you shape around your workflow**, rather than a complete workflow you need to learn. Start with the defaults, then add things only when you feel a concrete gap.

Based on the docs for the installed version, these are the highest-value habits.

## 1. Make planning explicit

Pi doesn’t ship a dedicated plan mode. You can get most of the benefit with a clear two-step request:

> Investigate how authentication works. Don’t change files yet. Identify the relevant code, propose the smallest fix, and explain how you’ll test it. Wait for my approval.

Then:

> Implement the plan. Run the focused tests first, then the broader checks. Report anything you couldn’t verify.

**“Don’t edit yet” is an instruction, not a permission boundary.** For unfamiliar or risky work, use isolation as well.

## 2. Learn steering versus follow-ups

This is particularly useful once you stop treating each prompt as a blocking interaction:

| Action | Shortcut | Use it for |
|---|---|---|
| Steer the current task | **Enter** while pi works | “Use the existing helper instead.” |
| Queue work after the task | **Alt+Enter** | “When you’re done, review the diff for regressions.” |
| Stop | **Escape** | An approach is clearly wrong. |
| Edit a long prompt externally | **Ctrl+G** | Detailed specs and acceptance criteria. |
| Expand/collapse tool output | **Ctrl+O** | Inspecting what actually happened. |

Steering is not an instant interruption: it takes effect after the current response and its tool calls finish. Use Escape if you need it to stop.

Run `/hotkeys` to see the bindings active in your terminal.

## 3. Use session branching to explore alternatives

Pi’s conversation history is a tree:

- **`/tree`** — return to an earlier point and try another direction within the same session.
- **`/fork`** — create a separate session from an earlier user message.
- **`/clone`** — copy the current active branch into a new session.

This makes “try a different design” much cleaner than continually correcting a long conversation.

**Important: conversation branching does not roll back your files.** Use version-control checkpoints or separate worktrees when comparing implementations.

## 4. Keep project instructions short and actionable

Pi recognizes both `AGENTS.md` and `CLAUDE.md`, so you don’t need to rewrite existing project instructions just to get started.

The most useful instructions contain:

- Exact build, lint, type-check, and test commands.
- Architectural constraints that aren’t obvious from the code.
- Generated files and directories to leave alone.
- What counts as a completed change.
- A few recurring mistakes to avoid.

For example:

```markdown
## Verification
- Run `pnpm typecheck` after TypeScript changes.
- Run focused tests while iterating.
- Before finishing, run `pnpm test` and report any failures.

## Constraints
- Do not edit generated API clients.
- Reuse existing validation helpers.
- Do not add dependencies without asking.
```

Personal instructions belong in `~/.pi/agent/AGENTS.md`. Use `/reload` after changing instructions or resources.

## 5. Turn repeated prompts into commands before building extensions

Pi gives you three useful customization levels:

| Mechanism | Best use |
|---|---|
| **Prompt template** | A request you repeat often. |
| **Skill** | A detailed workflow with references, scripts, or supporting files. |
| **Extension** | New executable behavior or integrations. |

Start with templates. For example, put this in `~/.pi/agent/prompts/review.md`:

```markdown
---
description: Review the current diff for substantive problems
---
Review the current diff. Focus on $ARGUMENTS.
Find correctness bugs, regressions, missing tests, and security issues.
Do not change files. Give file locations and explain the impact.
Skip style-only feedback.
```

After `/reload`, use:

```text
/review authentication and error handling
```

For skills, a precise description helps pi know when to load them. If you want to guarantee one is used, invoke it explicitly with `/skill:name`.

**Recommendation:** run mostly stock for a few days. Automate the friction you actually encounter, rather than recreating your entire Claude Code setup immediately.

## 6. Pick models and reasoning levels deliberately

Use:

- `/model` or **Ctrl+L** to select a model.
- `/thinking` or **Shift+Tab** to change reasoning effort.
- `/scoped-models` to define a useful shortlist.
- **Ctrl+P** to cycle through that shortlist.

A practical strategy:

- Routine edits: a faster model and moderate reasoning.
- Tricky debugging or design: a stronger model with higher reasoning.
- Final review: optionally ask a different model to inspect the diff.

You can change models within the same session. Treat a second-model review as another source of findings—not proof that the code is correct.

## 7. Manage context by task, not by calendar

Avoid turning one session into the permanent conversation for a repository.

- `/name` sessions by task so they’re easy to find.
- `/new` when switching to unrelated work.
- `/compact` when continuing a long task.
- `/resume` to reopen saved work.
- `pi --continue` to resume the latest session for the current directory.

When compacting, specify what matters:

```text
/compact Preserve the agreed API contract, the failing reproduction, and the reasons we rejected the first two approaches.
```

Pi retains the original session entries, but the model works from a summary plus recent history after compaction. Keep durable decisions in project files too.

## 8. Use the shell as part of the conversation

Inside pi:

```text
!git diff --stat
```

runs a command and includes its output in the conversation. Use `!!` instead when you want to run a command without adding its output to the model’s context.

Outside pi, print mode is useful for small, repeatable tasks:

```bash
git diff | pi --print "Review this diff for correctness bugs. Do not modify files."
```

Print mode still allows tool use; it isn’t inherently read-only.

## 9. Don’t carry over assumptions about approval prompts

This is the most important operational difference to internalize: **pi does not ask before every tool call.** Its tools run with the permissions of the account that launched it.

For unattended work, untrusted repositories, or tasks involving sensitive infrastructure:

- Use a container, VM, or sandbox.
- Expose only the files and credentials needed.
- Make version-control checkpoints.
- Review the actual diff and test results.

Project trust controls resource loading; it is **not** a sandbox.

## A good default task prompt

This structure works well without much ceremony:

> Fix **[specific behavior]**. First inspect the relevant code and tests. Keep the change focused and preserve **[constraints]**. Add a regression test, run the relevant checks, and review your diff before finishing. Report what changed, what you verified, and any remaining uncertainty.

If prioritizing just three things for a longtime Claude Code user: **learn steering, use `/tree`, and create a handful of prompt templates.** Those give you immediate benefits without building a custom agent framework.
