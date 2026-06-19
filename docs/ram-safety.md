# Ursula — RAM Safety Playbook

**The whole point of Ursula for you:** run as many Claude Code sessions as you want without your Mac's RAM getting destroyed and without losing your chats. This doc is how that works — and the one piece of news that fixes most of the pain.

## The good news first: you are NOT losing your chats

Claude Code writes **every turn to disk the moment it completes** — not on exit. So if your Mac OOMs, force-quits, or a session dies mid-run, the conversation is safe on disk up to the last finished turn.

- **Where:** `~/.claude/projects/<your-dir-encoded>/<session-id>.jsonl` (one file per session)
- **Recover any session:** `claude --resume` (opens a picker). **Press `Ctrl+A` in the picker to see ALL projects' sessions** — by default it only shows the current folder, which is the #1 reason sessions feel "lost."
- **Resume a specific one:** `claude --resume <session-id>` (run from the original directory)

Ursula's RAM Guard automates the recovery — see below.

## The RAM Guard (bottom-right of the status bar)

A live readout like **`82% · 23 sess`** (system RAM used % + your running Claude session count), colored by pressure:

| Color | Means | What to do |
|---|---|---|
| Normal (no bg) | < 75% used | Nothing — you're fine |
| **Amber** | 75–88% used, or compressor rising | Glance at the dashboard, consider freeing one |
| **Red** | ≥ 88% used, < 300 MB free, or compressor > 30% of RAM | **Free RAM now** — kill an idle session |

- **Click it** (or `Cmd+Shift+P` → `Ursula: Show RAM Guard Dashboard`) to see every session sorted by RAM, with: dir, RSS, age, pid.
- Per-session actions: **Kill** (frees RAM instantly — chat stays safe on disk), **Copy `claude --resume`**, **Reveal transcript in Finder**.
- **Tooltip** (hover) shows the top-5 hogs + the "chats auto-save — safe to free RAM" reminder.

## How to actually keep RAM healthy

1. **Watch the color.** Amber is your early warning; red means act now.
2. **Kill idle/long sessions from the dashboard** — they cost the most (a 12-hour session can hit ~600 MB; a fresh one is ~150 MB). Killing is safe; resume later with `claude --resume`. **One nuance:** don't kill a session that's mid-action (writing a file, running a build, mid-tool-call) — let the turn finish first, otherwise you can leave a half-written file or a hung child process. The chat transcript itself is still safe either way; this is just about side effects of the interrupted action.
3. **`/clear` inside a session** drops its in-memory context back to baseline immediately while keeping the full chat resumable on disk. Great for a session you want to keep open but lighten.
4. **`/compact`** summarizes the history in-place — shrinks context without losing the thread.

## How many sessions fit (your 36 GB Mac)

- Rough budget: ~8 GB for macOS + browser + Ursula + Slack → ~28 GB for Claude.
- At ~300 MB average → ~90 in theory, **but sessions grow with context.**
- **Practical safe ceiling: ~15–20 concurrent.** Beyond that the macOS compressor saturates, the machine thrashes, and jetsam starts killing processes — which is the "lost chats" feeling (they're not lost, see above).

## Crash recovery (automatic)

On startup, Ursula scans `~/.claude/sessions/` for sessions that died while `status=busy` (killed mid-turn) and offers a one-click **resume in a terminal at the original directory**. You can also run it manually: `Ursula: Scan for Interrupted Claude Sessions`.

## What Ursula does NOT do (on purpose)

- It does **not** hard-limit Claude Code's own RAM (that would crash it unpredictably and *cause* real mid-turn chat loss).
- It does **not** disable transcript writing (that would actually lose chats).
- It does **not** auto-kill sessions without showing you how to resume.

It gives you **visibility + one-click control + recovery** instead — which is the part VS Code never had.
