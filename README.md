# Ursula

**A RAM-safe VS Code fork for people who run a lot of AI coding sessions.**

Ursula is a [Code-OSS](https://github.com/microsoft/vscode) (VS Code) fork built around one premise: your editor shouldn't be the thing that crashes your machine when you're running many AI agent sessions at once (Claude Code, Cursor agents, etc.). It keeps the **full VS Code extension + terminal experience**, adds a Warp-style terminal, and ships RAM safeguards so you can run more sessions before your Mac gives up.

> *"Warp, but with the VS Code extensions Cursor has — and it doesn't eat your RAM."*

## Why
Running many AI coding sessions is the new normal, and editors quietly balloon until the OS jetsam-kills a process — often taking an in-flight chat or build with it. Ursula's **RAM Guard** makes the pressure visible, lets you free it in one click, and auto-recovers sessions that died mid-turn. (Good news most people don't know: Claude Code writes every turn to disk, so a killed session is almost always recoverable with `claude --resume`. Ursula surfaces that instead of surprising you.)

## Features
- **RAM Guard** (built-in extension): a live status-bar readout of system RAM + your running AI sessions (macOS `vm_stat`-accurate — not the optimistic `os.freemem` — color-coded by pressure), a one-click session dashboard (free RAM now / copy `claude --resume` / reveal transcript), and crash-recovery that resumes sessions killed mid-turn. Memory-conscious defaults out of the box.
- **Warp-style terminal**: gold command-boundary markers on each command (built on VS Code's shell-integration exit-status decorations). Terax-inspired — minimal and fast.
- **Signature launch intro**: a hyperspace "warp-gate" splash.
- **Bone+Gold theme is the default** (warm near-black `#0B0B0D`, bone `#F4F1EC`, gold `#C2A878`), with Big Shoulders Display + JetBrains Mono.

## Install (build from source — Node 24.15.0)
```bash
git clone https://github.com/Dreydrey9000/ursula.git
cd ursula
nvm use 24              # Node 24.15.0 required
npm install             # first run only; let the native builds finish
npm run compile         # ~35s, 0 errors on a clean tree
./scripts/code.sh       # launch
```
Pin the `Ursula.app` at the repo root to your Dock for one-click launch.

> Ursula is currently **unsigned** (no Apple Developer account yet). On first launch: right-click → *Open* to bypass Gatekeeper, or `xattr -dr com.apple.quarantine /path/to/Ursula.app`.

## License
**MIT** for all code. Ursula's additions inherit Code-OSS's MIT license.

The **"Ursula" name and logo are a trademark of the author** and are **not licensed for derivative use** — fork and modify the code freely under MIT, but please ship your fork under a different name and logo. (Same model as Firefox/Mozilla or VS Code/VSCodium.)

## Status
Early, actively dogfooded. The RAM Guard is the headline; true multi-line Warp blocks, code-signing, and an auto-updater are on the roadmap — see `CHANGELOG.md` and `docs/`.
