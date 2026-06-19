# Ursula — Roadmap v2

Supersedes the Tauri roadmap. Phases sized for the 2026-06-18 morning deliverable + ship path.

## Phase 0 — Clone + Boot  [TODAY]
- [x] Shallow-clone `microsoft/vscode` into `~/MyApps/ursula-ide` (v1.126.0)
- [x] Verify prereqs (Node 24 OK, Xcode OK, 90 GB OK; Python 3.14 = watch)
- [ ] `npm install` (watch node-pty native build)
- [ ] Launch dev build, confirm Code-OSS boots
**Done =** an Electron window opens the VS Code workbench, unsigned.

## Phase 1 — Rebrand + Open VSX  [TODAY]
- [x] `product.json`: name/applicationName/dataFolderName/sharedDataFolderName/urlProtocol/darwinBundleIdentifier → Ursula
- [x] `extensionsGallery` → Open VSX
- [x] Park on `ursula` branch; `main` left as clean upstream mirror
- [ ] Boot, confirm **"Ursula"** in title bar + marketplace loads Open VSX
- [ ] **Smoke test:** install **Kilo Code** from the in-app marketplace
**Done =** app says Ursula, Open VSX works, one community extension installs.

## Phase 2 — Bone+Gold skin
- [ ] Write `ursula-dark.json` color theme (tokens in `ARCHITECTURE-v2.md`)
- [ ] Contribute it via `theme-defaults/package.json`; set as boot default
- [ ] Bear mark in product icon + window chrome
- [ ] Font stack: Big Shoulders Display + JetBrains Mono
**Done =** app looks Bone+Gold on first boot, not generic VS Code dark.

## Phase 3 — Warp-grade terminal
- [ ] Port OSC 133 zsh shell-integration from `ursula-terminal`
- [ ] Command blocks + exit-code dots (gold/red)
- [ ] Enable GPU/WebGL renderer
- [ ] Inline previews (3b)
**Done =** terminal feels like Warp blocks, not a raw PTY.

## Phase 4 — Workspaces + port configs
- [ ] Port workspace configs from `ursula-terminal` (hermes-vps / 1bb / founders-social / personal)
- [ ] Tab + multi-pane workspaces
**Done =** Drey's real projects open with one click.

## Later gates (NOT today)
- **AI/agent features** (open extensions only; proprietary Cursor agent stays out)
- **BridgeMind / BridgeBench**-style eval
- **Code-signing + notarization** (Apple Dev $99/yr) — required before ANY distribution
- **Rename:** "Ursula" vs "ABS IDE" — Drey TBD
