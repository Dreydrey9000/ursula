# Changelog — Ursula (Code-OSS fork)

All notable changes to the Ursula fork. Format: `## [YYYY-MM-DD]` with sections, one line per change, include the why.

## [2026-06-20] — Modes system (Terax/Warp/Cursor/Cate/Lite) + movable Sessions rail + RAM Guard v2

### Added
- **Five one-click "modes"** (`src/vs/workbench/contrib/ursulaModes/`): Terax (minimal/fast/keyboard), Warp (maximized terminal + gold command blocks + the real Warp Dark ANSI palette + block/pane keys), Cursor (AI chat on the right via the bundled Claude agent + Cmd+L/Cmd+I + Tab autocomplete), Cate (warm Ember theme + Sessions rail, replicating Drey's daily driver), Lite (hardware-tuned RAM/VRAM optimizer). Each mode is a native VS Code **Profile** that shares ONE installed extension set (`useDefaultFlags.extensions=true`) — so Claude Code, Kilo Code, and the full marketplace work in EVERY mode and are never removed on switch. A left status-bar pill + `Cmd+K M` open the switcher.
- **Movable vertical Sessions rail** (`ursulaSessions` TreeView in ursula-ram-guard): lists live Claude Code sessions (reuses the `~/.claude/projects` scan), draggable between sidebars; plus vertical terminal tabs baked into the lean modes.
- **RAM Guard v2** — a dark Bone-on-black webview dashboard (RAM gauge + memory-pressure bar + VRAM/GPU readout + per-session Free/Resume/Reveal + "Optimize now"), **hardware-aware**: detects RAM (vm_stat) + VRAM (`system_profiler SPDisplaysDataType`) and recommends a mode by RAM tier (Apple-Silicon unified memory treated as capable, not a weak GPU). Optimizer is user-choice: `ursula.optimizer.mode` = recommend | auto | off.
- **"Ursula Cate" Ember color theme** (`extensions/theme-defaults/`).

### Fixed
- **RAM Guard "Free RAM now" was a dead branch** — the label said "Free RAM now" but the handler only matched `startsWith('Kill')`, so the #1-priority action silently did nothing. Deleted the dead path; kills now re-validate the pid against the current sessions snapshot before SIGTERM (never kill a recycled pid).
- **Switcher silent no-op** — picking "Default" while already on Default (or re-picking the current mode) now gives feedback instead of looking broken, and no longer re-runs the toggle-based startup commands (which had flipped the panel/side bar back off).

### Changed
- **Black backgrounds** (per Drey: "we do black in here"): RAM Guard dashboard converted from Bone-paper to warm near-black; gold kept as the accent.

### Why
Drey wanted to pick his own adventure across the terminal emulators he likes (Terax/Warp/Cursor/Cate) without losing capability or extensions, and to make Ursula run great on any machine regardless of RAM/VRAM. Modes-as-Profiles keeps it simple (data, not code) and the shared extension set keeps every room fully powered.

## [2026-06-19] — Overnight iter 4: Drey icon + clickable launcher

### Added
- **Clickable launcher `.app`** (`Ursula.app` at the repo root): a stable macOS app bundle whose executable is a shell script that runs `scripts/code.sh` (with `PATH` pinned to Node 24.15.0). Fixes "click the icon does nothing" — the `.build/electron/Ursula.app` is just the bare Electron runtime (opens empty without the dev launch args); the launcher is the working click target. Drag it to the Dock or `/Applications`.
- **Drey cartoon icon** (interim, per Drey): the runtime Dock icon (`resources/ursula-monogram.png`) and the launcher's `app.icns` are now the Pixar-style Drey cartoon (`~/Desktop/My Files/drey - pixar version.png`), built via `sips`→`iconutil`. "We can change it later."

### Why
Drey's two explicit wants: change the icon, and make the clicked icon actually open the app. The launcher solves the click-to-launch gap that the raw Electron bundle left.

## [2026-06-19] — Overnight iter 3: council-feedback fixes (Dave + Steve NEEDS-WORK → addressed)

### Fixed (per the Drey/Dave/Steve council review)
- **Terminal command-blocks: removed the broken 1-cell background tint** (it read as a random highlighted row on multi-line commands — Dave P0). Simplified `blockRendererAddon.ts` to a single clean job: a **gold left-edge bar marking each command** (clipping-safe, marker-anchored). The exit-code status itself is shown by the built-in `DecorationAddon`, so the addon no longer duplicates that. Cut the speculative "running" tint state + the fragile toggle re-attach path + the untunable `CRIT_FREE_MB` magic number (Dave P1). Verified live: gold bars present, tint gone, terminal clean.
- **Killed the `aka.ms/vscode-*` brand leaks** (Steve P0): tutorial-video URL → dreythomas.com, "Install Git" → git-scm.com/downloads, `learn.svg` xlink → dreythomas.com.
- **Deleted `gettingStartedContent.ts.bak`** (Steve P0) — the stale backup carried un-swept "VS Code" strings + tripped brand-leak scanners.
- **Dock monogram → solid geometric gold "U"** (Steve P1): replaced the serif Georgia placeholder (which fought the Big Shoulders brand) with a font-independent path mark, crisp at 32px, no hairline border.
- **RAM Guard copy** (Steve P2): status bar dropped the "sess" abbreviation (now `82% · 23`); dashboard action leads with the benefit ("Free RAM now — closes the session…" instead of "Kill process").
- **ram-safety.md**: added the "don't kill a session mid-action" nuance (chat is still safe, but side effects of an interrupted tool call aren't) — Drey's follow-up.

### Deferred (council P2, explicitly low-priority — not blocking the bar)
- `readSessionMeta` stat-storm mitigation (cache by pid+mtime) + `revealTranscript` folder-encoding guess — both flagged "not urgent" by Dave; track in ROADMAP.
- True multi-line Warp block backgrounds (span a command's full output range) — genuinely hard under xterm reflow; the gold prompt marker + built-in exit-status decoration deliver the Warp-ish feel without it. Future enhancement.

## [2026-06-19] — Overnight iter 2: Warp-style terminal command blocks

### Added
- **Terminal command blocks** (new `src/vs/workbench/contrib/terminal/browser/xterm/blockRendererAddon.ts`, wired in `xtermTerminal.ts`): a thin **gold (#C2A878) left-edge bar** + subtle per-command **background tint** (warm ~5% on exit 0, faint red ~8% on non-zero) on every command — the "feels like Warp" / Terax-small feature. Additive, behind `terminal.ursula.commandBlocks` (boolean, default `true`, live-reactive to setting changes). **Clipping-safe**: every decoration anchors on a real shell-integration command marker (never a cursor/line), disposes on command-invalidated, fully clears on resize; the bar uses opaque `backgroundColor` (sits beside the prompt) and the tint uses DOM `rgba()` via `onRender` (xterm's `backgroundColor` is opaque-only, confirmed in `xterm.d.ts`).
- Setting `terminal.ursula.commandBlocks` registered (new `TerminalSettingId.UrsulaCommandBlocks` in `terminal.ts` + node in `terminalConfiguration.ts`).

### Verified
- `npm run compile` → 0 errors; `blockRendererAddon.js` in `out/`. App boots clean (0 ReferenceError, 0 addon errors). Vision-verified live: ran `ls` / `false` / `ls` in a real terminal — gold bars at each prompt line, warm tint on success, red tint on the failed command, terminal renders cleanly (no breakage).

## [2026-06-19] — Overnight iter 1: memory defaults + ANSI recolor + docs filed

### Added
- **Memory-conscious product defaults** (via `ursula-ram-guard` `contributes.configurationDefaults`): `files.watcherExclude` now ignores `node_modules`/`.git/objects`/`dist`/`out`/`.ursula` (cuts file-watcher RAM on big repos), `search.followSymlinks:false`, `telemetry.telemetryLevel:off`, `workbench.enableExperiments:false`. Reduces Ursula's baseline so more RAM is free for Claude sessions; all user-overridable.
- **Overnight build ledger** `docs/OVERNIGHT-STATE.md` so the autonomous loop survives context resets.

### Changed
- **Terminal ANSI → true Bone+Gold** (`extensions/theme-defaults/themes/ursula-dark.json`): muddy One-Dark-Pro reds/greens → warm rust #D98B6B / sage #8FA68E / dusty slate #7C93A8; gold magenta preserved. `git status`/errors/`ls` now read on-brand + stay distinguishable.

### Moved
- `PLAN-URSULA-MAKE-IT-MINE-20260618.html` → `docs/`; `HANDOFF-…` → `docs/handoffs/` (off the Desktop, into the project).

### In progress
- Warp-grade terminal command-blocks (Terax-inspired: small/fast/good) — design subagent running; integration + verify next iteration.

## [2026-06-18] — RAM Guard: live RAM monitor + Claude-session dashboard + crash-recovery (P0 blocker)

### Why
Drey's real blocker: running many Claude Code sessions destroys RAM and he loses chats. Research confirmed chats are NOT actually lost — Claude Code writes every turn to `~/.claude/projects/<dir>/<session>.jsonl`, recoverable via `claude --resume`. The real pains are (1) surprise OOM with no warning, and (2) not knowing sessions are recoverable. Ursula can't cap Claude Code's own RAM, but it can make the pressure visible and recover "lost" sessions in one click. Hard constraint honored: full VS Code extension + terminal compatibility preserved (Claude Code / Kilo Code run as easily as in stock VS Code).

### Added
- **`extensions/ursula-ram-guard/`** — a new built-in extension (compiles in-tree via one line added to `build/gulpfile.extensions.ts` `compilations`; auto-loads at boot, no registry):
  - **Status bar**: live system RAM% + Claude session count, colored by pressure (normal → warning amber ≥75% → error red ≥88% or <300 MB free), refreshed every 5s. Tooltip lists the top-5 sessions by RAM + the "chats auto-save — safe to free RAM" reassurance.
  - **Dashboard** (`Ursula: Show RAM Guard Dashboard`): QuickPick of every live Claude session (dir, RSS, age, pid, status); per-session actions — Kill (frees RAM; chat is safe on disk), Copy `claude --resume`, Reveal transcript in Finder.
  - **Crash-recovery** (runs on boot + `Ursula: Scan for Interrupted Claude Sessions`): scans `~/.claude/sessions/*.json` for sessions that died `status=busy` (mid-turn) and offers one-click `claude --resume` in a terminal at the original cwd — the "lost chat" fix.
  - **Pressure alert**: non-spammy warning (60s cooldown) offering to open the dashboard when RAM goes critical with sessions running.
  - Config: `ursula.ramGuard.warnThresholdPct` (75), `criticalThresholdPct` (88), `pollSeconds` (5).
- Verified live (vision + runtime log): status bar renders the readout with a warning background against the live 23-session load; `isInstalledLocally: true` in the boot log; 0 activation errors.

### Known gaps (next loop iterations)
- macOS pressure accuracy: currently uses `os.freemem()` (optimistic). Next: parse `vm_stat` for compressor + truly-free pages so the warning fires before real jetsam, not after.
- Memory-conscious product defaults (trim Ursula's baseline so more RAM is free for sessions) — informed by the finish-plan research synthesis.
- A RAM-safety playbook doc (how many sessions fit in 36 GB, how chats persist, the recovery flow).

## [2026-06-18] — Identity pass: signature intro + Dock mark + name sweep (the "make it mine" round)

### Added
- **Signature launch intro** (`resources/ursula-intro.html`, wired in `src/vs/code/electron-main/app.ts` `startup()`): frameless ~940×560 splash with a canvas hyperspace starfield (stars emit from center, warp outward) + "Hello {Name}, build something great" greeting + `URSULA` wordmark in Big Shoulders Display, Bone+Gold. Held ≥2.7s over service-init, then hands off to the workbench. The "wow" first impression Drey asked for. Served via `vscode-file://vscode-app/` (NOT `loadFile` — see Fixed).
- **Branded macOS Dock icon at runtime**: `resources/ursula-monogram.png` (gold "U" on dark, 1024²) painted via `app.dock.setIcon(nativeImage.createFromPath(...))` so dev builds show the mark. Placeholder monogram until the mascot is locked.
- **Welcome/Getting-Started rebrand**: headline `h1` in Big Shoulders Display, subtitle "Fast. Full. Light on your machine.", and a full `VS Code`→`Ursula` sweep across `gettingStartedContent` + `terminalConfiguration`.
- **Terminal defaults**: `terminal.integrated.fontFamily` default → `JetBrains Mono`; `gpuAcceleration` default → `on` (instant Warp-ish feel).

### Fixed
- **Intro silently failed to load (`ERR_FAILED -2`):** VS Code's `protocolMainService` intercepts the `file://` protocol, so `BrowserWindow.loadFile()` was rejected on every launch (the "centered dark window" earlier was the empty `backgroundColor`, not content). Switched to `loadURL('vscode-file://vscode-app/resources/ursula-intro.html')` — the resource protocol built to serve local HTML from appRoot. Personalized name now injected via `webContents.executeJavaScript` on `dom-ready`.
- **Dock icon never painted:** `app.dock.setIcon(pathString)` is a silent no-op on this Electron/macOS combo; `nativeImage.createFromPath` is the reliably-rendering form.
- **App exited immediately on launch (one build):** stray `require()` calls in the ESM main bundle threw `ReferenceError: require is not defined`; replaced with ES imports.

### Known gaps (next session)
- Welcome header has no inline logo mark yet (`h1` in Big Shoulders deemed sufficient this pass); getting-started tutorial video URL still points at `aka.ms/vscode-getting-started-video`; Dock icon is a placeholder monogram — mascot pending Drey's data-backed call (bear vs flat-geometric mark).

## [2026-06-18] — Initial fork build (bootable dev)

### Added
- Forked **Code-OSS v1.126.0** (shallow clone) at `~/MyApps/ursula-ide`; fork lives on `ursula` branch, `main` kept as a clean upstream mirror for future merges.
- **product.json rebrand** (commit `5147772a`, surgical 14+/7- diff): nameShort/nameLong/applicationName → Ursula; dataFolderName `.ursula` + sharedDataFolderName `.ursula-shared` (isolated per-user config — does not collide with real VS Code); urlProtocol `ursula`; darwinBundleIdentifier `com.ursula.ide`.
- **Open VSX marketplace wired** (`extensionsGallery` → open-vsx.org). MS Marketplace ToS forbids non-Microsoft clients, so Code-OSS ships with no marketplace; this is what makes the editor able to install extensions. Kilo Code v7.3.49 confirmed present + verified on Open VSX.
- **Bone+Gold color theme** (commit `7289bce0`): full palette at `extensions/theme-defaults/themes/ursula-dark.json` (workbench + syntax + terminal ANSI, bone `#F4F1EC` / gold `#C2A878` on near-black `#0B0B0D`); registered as first contributed theme and set as the boot default by flipping `ThemeSettingDefaults.COLOR_THEME_DARK` → `'Ursula Bone+Gold'` + gutting the blue `COLOR_THEME_DARK_INITIAL_COLORS` override map.
- **Planning docs**: `CONTEXT.md` (pivot rationale + non-goals), `ARCHITECTURE-v2.md` (fork surface, verified against the clone), `ROADMAP-v2.md` (phased).

### Why
- Pivoted from the from-scratch **Tauri terminal** (`~/My Apps/ursula-terminal`, Phase 0+1, now parked on branch `phase-2-wip-parked`) because the VS Code **extension ecosystem** Drey wants (Kilo Code) requires the Extension Host + full Electron workbench — impossible to host on a Tauri/Rust shell. Language stays TypeScript/Electron (satisfies the Andreas Ehn rule); Rust removed.

### Known gaps (next session)
- **Title bar + Welcome screen still say "VS Code"** — separate branding layer (app bundle `Info.plist` display name + Welcome/gettingStarted localized strings), not yet changed.
- **Terminal = stock VS Code**; the Warp-grade upgrade (OSC 133 command blocks, exit-code dots, GPU renderer) is ROADMAP Phase 3 — port from `ursula-terminal`.
- **Unsigned / unnotarized** — distribution gate (Apple Dev $99/yr) is later.

### Build notes (gotchas)
- **Requires Node 24.15.0** (`.nvmrc`); VS Code's `build/npm/preinstall.ts` enforces it exactly (Node 24.11.1 fails). Also rejects npm >= 12.
- **Requires a SPACELESS project path** — spaces in `My Apps` break node-gyp's `make` (unquoted paths → `@vscode/sqlite3` make exit 2, zero native binaries). That's why this lives at `~/MyApps/` not `~/My Apps/`.
- **Launch dev:** `export PATH=~/.nvm/versions/node/v24.15.0/bin:$PATH && cd ~/MyApps/ursula-ide && ./scripts/code.sh` (nvm `use` does not persist across non-interactive shells).
