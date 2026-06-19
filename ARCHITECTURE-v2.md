# Ursula — Architecture v2 (Code-OSS fork)

Supersedes `~/My Apps/ursula-terminal/.planning/ARCHITECTURE.md` (Tauri). Verified against the actual clone 2026-06-18.

## Base
- Upstream: `github.com/microsoft/vscode`, shallow clone (`--depth 1`), at **v1.126.0** (`code-oss-dev`).
- Built product is "Code-OSS"; we rebrand it **"Ursula."**
- Branch `ursula` holds the fork; `main` mirrors upstream for merges.

## Build prerequisites (verified 2026-06-18)
| Tool | Required | Have | Status |
|------|----------|------|--------|
| Node | 24.x (`.nvmrc` = 24.15.0) | 24.11.1 | OK (same major) |
| npm  | bundled | 11.6.2 | OK |
| Python | 3.x (node-gyp / node-pty) | 3.14.5 | **RISK** — very new; fall back to 3.12 if native build fails |
| Xcode / CLT | for native compile | full Xcode | OK |
| Disk | ~3 GB | 90 GB free | OK |

Failure point to watch during `npm install`: **node-pty** native compile (the terminal component). If it dies on Python 3.14, `pyenv`/`python@3.12` + rebuild.

## Rebrand surface — `product.json` (the fork's keystone file)
Code-OSS reads name/brand/marketplace from `product.json` at runtime — that's literally why it exists separately from `package.json`. Surgical edits only (see git log `5147772a`):

| Key | Value |
|-----|-------|
| `nameShort` / `nameLong` / `applicationName` | `Ursula` |
| `dataFolderName` | `.ursula` (isolated per-user config — do NOT collide with real VS Code) |
| `sharedDataFolderName` | `.ursula-shared` |
| `urlProtocol` | `ursula` |
| `darwinBundleIdentifier` | `com.ursula.ide` |
| `extensionsGallery` | **Open VSX** (see below) |

### Open VSX gallery block
```
serviceUrl           = https://open-vsx.org/vscode/gallery
itemUrl              = https://open-vsx.org/vscode/item
resourceUrlTemplate  = https://open-vsx.org/vscode/asset/{publisher}/{name}/{version}/Microsoft.VisualStudio.Code.VSIXPackage
```
Why: Microsoft Marketplace ToS forbids non-Microsoft clients. Open VSX (Eclipse Foundation) is the legal equivalent and carries Kilo Code / Cline / Continue + the bulk of community extensions. It does **not** carry Microsoft-closed or proprietary-Cursor-agent extensions — which matches the "not the Cursor agent stuff yet" gate.

## Skin — Bone+Gold
Two layers:
1. **Color theme** — `extensions/theme-defaults/themes/ursula-dark.json` (token map below), contributed via `theme-defaults/package.json`, set as the boot default.
2. **Product icon / chrome** — bear mark in the product icon set; font stack Big Shoulders Display (display) + JetBrains Mono (mono/code/terminal).

### Tokens (ported from Tauri Ursula)
- bg `#0B0B0D` · surface `#141417` · sidebar `#101013` · border `#1E1E22`
- fg/bone `#F4F1EC` · muted `#9A958C`
- gold (accent) `#C2A878` · gold-bright `#D8BE8E`
- success `#7FB069` · error `#E06C75` · warn `#E5C07B`

## Integrated terminal (Warp-grade)
Base = VS Code's `xterm.js` + `node-pty` (already in `src/vs/workbench/contrib/terminal/`). Upgrades:
- **Command blocks** via OSC 133 (port zsh shell-integration + parser from `ursula-terminal/src/shell-integration`).
- **Exit-code dots** — gold = success, red = non-zero (ported).
- **GPU renderer** — ensure xterm WebGL renderer is on.
- **Inline previews** (phase 3b).
Also ports: the xterm **decoration-clipping fix** (`[[feedback-xterm-decoration-clipping]]`).

## Build & run
1. `npm install` (deps + native modules; node-pty is the failure point).
2. Launch dev: `./scripts/code.sh` (macOS) — compiles TS to `out/` and opens Electron.
3. First boot = **unsigned, unnotarized** dev Electron — fine for Drey to SEE it; gate behind signing before any distribution.

## File map
- `product.json` — rebrand + marketplace (keystone; surgical edits; `product.json.orig` = upstream backup)
- `extensions/theme-defaults/` — Bone+Gold theme
- `src/vs/workbench/contrib/terminal/` — terminal upgrade surface
- `build/` + `.vscode/launch.json` — build/run
- `~/My Apps/ursula-terminal/` — portable-asset source (read-only)
