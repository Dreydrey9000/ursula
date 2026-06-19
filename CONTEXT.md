# Ursula — Context (locked 2026-06-18)

> Source of truth for what Ursula IS and IS NOT. Overnight/auto runs: stay inside this fence.

## What it is (one sentence)
Ursula is a Mac-first code editor built by **forking Code-OSS** (the MIT-licensed source of VS Code), rebranded, skinned **Bone+Gold**, pointed at the **Open VSX** extension marketplace, with an integrated terminal upgraded toward **Warp**'s UX.

## Why a fork (the pivot)
The earlier plan (locked 2026-05-27) was a lightweight from-scratch **Tauri 2 + Rust + xterm.js** terminal (`~/My Apps/ursula-terminal`). **Pivoted 2026-06-18** because Drey wants the **VS Code / Cursor extension ecosystem** (named **Kilo Code**). VS Code extensions need the **Extension Host** — the runtime that actually executes extensions — which needs the full Code-OSS/Electron workbench. A Tauri shell cannot host it; reimplementing the host is the "rewrite Linux in Rust" trap. So we stand on Code-OSS.

Consequence: language stays **TypeScript/Electron** (satisfies the Andreas Ehn rule); **Rust goes away**.

## Who it's for
Drey, daily. First user, first tester. Then builders who want a Cursor-like (extension-rich) editor with a Warp-like terminal and a distinctive Bone+Gold look — **not** a generic VS Code clone.

## The three locked decisions
1. **Marketplace = Open VSX** (Microsoft Marketplace ToS forbids non-Microsoft clients).
2. **Skin = Bone+Gold** — `#0B0B0D` / `#F4F1EC` / gold `#C2A878`, Big Shoulders Display + JetBrains Mono, bear mark (ported from Tauri Ursula).
3. **Terminal = Warp-grade** — command blocks (OSC 133), inline previews, GPU renderer; xterm.js + node-pty base.

## Non-goals (GATED — do not build today)
- **AI/agent features** and the proprietary **Cursor agent**. (Open agent extensions — Kilo Code / Cline / Continue — DO install from Open VSX; that's allowed and wanted later.)
- **BridgeMind / BridgeBench**-style eval — admired, "eventually."
- **Code-signing / notarization** (Apple Dev $99/yr) — real-product gate, not dev boot.
- **Windows / Linux** — Mac-first.

## Constraints
- Language: TypeScript/Electron. Rust removed.
- **Independence standard:** someone other than Drey can clone, build, run, maintain.
- **Preserve** `~/My Apps/ursula-terminal` (Tauri) untouched — it is the portable-asset source (Bone+Gold tokens, xterm decoration-clipping fix, workspace configs).

## Branch model
- `main` = clean upstream mirror of `microsoft/vscode` (for future `git pull` merges).
- `ursula` = our fork line. **All Ursula changes commit here.** Keep diffs surgical, especially in `product.json` (the most-merged file).

## The morning deliverable (2026-06-18)
A bootable **unsigned dev build, opened on Drey's screen**, titled **Ursula**, with Open VSX wired. Plus this doc set. Signing/distro = later.

## Key files
- `product.json` — rebrand + marketplace (the keystone fork file; surgical edits only).
- `src/vs/workbench/contrib/terminal/` — terminal upgrade surface.
- `extensions/theme-defaults/` — Bone+Gold theme home.
- `~/My Apps/ursula-terminal/` — portable-asset source (read-only).
