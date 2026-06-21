# Changelog — Ursula (Code-OSS fork)

All notable changes to the Ursula fork. Format: `## [YYYY-MM-DD]` with sections, one line per change, include the why.

## [2026-06-21] — Modes hardening: red-team fixes, re-entry layout persistence, docs

### Fixed (an adversarial source review found these before users did)
- **Picking "Default" with a folder open did nothing** but showed a success toast — it only associated the profile and needed a reload. Now reloads on the folder path (mirrors the mode switch), so Default's settings + baseline layout actually load.
- **First pick of a never-used mode did nothing** — `createProfileFromTemplate` creates a profile but doesn't switch to it, so the reload reopened the same profile. Now switches to the freshly created profile first.
- **The Warp command bar mangled any command containing `${...}`** — it routed through `sendSequence`, which runs VS Code variable resolution. Now sends verbatim via the terminal service (and waits for the pty on cold start so the first command never loses characters).
- **The Cate session-tab strip rendered once and froze** (and was usually empty, since session data loads asynchronously). Now refreshes live every few seconds while you're in Cate, and disposes its old click-listeners each render instead of leaking them.
- **Panel maximize (Warp/Terax) mis-fired** when the user's panel alignment wasn't centered. Now keys off editor visibility, which is alignment-independent.
- **Resuming a session with no working directory** silently did nothing; it now resumes from the home directory.

### Added
- **Re-entry layout persistence** — customizations you make inside a mode now persist when you leave and come back to it (not just within one session). Stored per mode, and fail-safe: a missing or malformed snapshot falls back to the mode's defaults.
- **`docs/MODES.md`** (how the modes system works + how to add one) and **`docs/diagrams/Ursula-Modes-architecture.png`** (one-page architecture).

### Why
The reskin shipped without GUI test coverage (the dev window can't be driven headlessly here), so a five-way adversarial source review stood in for it and caught ten real bugs — several of which broke a mode's core behavior. All compile clean and boot clean.

## [2026-06-21] — Layout engine: each mode genuinely RESTRUCTURES the window + per-mode RAM right-sizing

### Added
- **Per-mode layout engine** (`applyModeLayout` in ursulaModes.contribution.ts + declarative `MODE_LAYOUT` in templates.ts): each mode now hides/shows/resizes the actual workbench parts, not just recolors. Warp/Terax → side bars hidden + terminal maximized (full-bleed); Cate → primary side bar hidden, right aux bar shown with the Sessions rail focused; Cursor → side bar hidden, right aux bar shown and widened to 480px for the AI composer (editor stays the hero); Lite → everything hidden but the editor + status bar. Driven by `layoutService.setPartHidden` + a `isPanelMaximized()`-guarded `toggleMaximizedPanel` + `setSize` (all deterministic — no blind toggles).
- **Per-mode RAM right-sizing** (WARP_RAM / CURSOR_RAM / TERAX_RAM / CATE_RAM / LITE_RAM): each mode trims only what it doesn't use and keeps its hero settings. Warp trims editor/TS-server weight but keeps terminal shell-integration + GPU (its blocks need them); Cursor trims ALL terminal weight (GPU off, shell-integration off, no persistent ptys) but keeps the editor index + AI; Terax aggressive (hover/validate stay on so it never reads as broken); Cate balanced + idle-pty trims; Lite the hardest, stacked on the existing optimizer block. Source: "Cursor is not going to take more RAM than it needs."

### Fixed / Changed
- **The reload-vanish + customization-clobber pair** (both caught by a pre-build skeptic pass): part visibility is per-*workspace* runtime state, not a profile setting, so the layout is re-asserted on the reload-proof path (constructor + profile-change) — but guarded by a per-workspace `ursula.mode.shapedFor` marker so it applies only on a real mode *change*. Result: the restructure survives a folder-open reload AND a layout tweak you make inside a mode persists (it doesn't get slammed back on the next relayout).
- **Replaced `runStartupCommands`** (blind `focusPanel`/`toggleMaximizedPanel`/`focusSideBar` — stateful, could un-maximize on a repeat entry) with deterministic `applyModeLayout` + an extension-gated `runModeExtras` (rail focus / openChatToSide behind `whenInstalledExtensionsRegistered`).
- **Settings reconciled:** Cate's activity bar flipped `default` → `hidden` (the Sessions rail moved to the aux bar); Cursor gained `activityBar.location: hidden` + explicit `statusBar.visible` (it's a standalone template, not BASE_LEAN).

### Why
Drey: "It's supposed to have the design of each of these… make the whole UI different, not just the colors," and each mode must use only the RAM it needs. The earlier CSS pass recolored a VS Code window, which still read as VS Code. This restructures the parts per mode and right-sizes RAM per mode. Compiles 0 errors, structurally verified in `out/`, boots clean. Public push still HELD pending Drey's GUI confirm.

### Also (same day, "continue all the way through")
- **Sessions rail moved to the LEFT** (`ursula-ram-guard` viewsContainers `auxiliarybar` → `activitybar`) to match the approved mockup, and `MODE_LAYOUT[Cate]` updated to show the left rail + right AI chat. This also frees the right aux bar for Cursor's composer (a collision the skeptic had flagged) and silenced the `ursulaSessionsContainer does not exist` boot warning.
- **Layout timing hardened:** the constructor's `applyModeLayout` now defers to `layoutService.whenRestored` so the workbench's own layout restore can't race/overwrite the per-mode `setPartHidden` on a cold boot into a mode.
- **Decision:** the bespoke Warp command bar + Cate session-tabs widgets were intentionally *not* built — they'd duplicate the real maximized-terminal prompt and the left rail's session list respectively. The restructure + skins + rail carry the looks. Re-entry layout persistence remains a v2 (within-a-mode-session customization already persists).

## [2026-06-20] — Reskin: per-mode skin CSS that genuinely re-skins the window (all 5 modes, source-verified)

### Added
- **`MODE_CSS` filled for all 5 modes** (`ursulaModes/browser/templates.ts`): per-mode scoped stylesheet bodies the contribution swaps into one persistent `<style class="ursula-mode-css">` when the mode changes (Mechanism A, the theme-engine pattern). Cate = warm near-black + ember-orange `#e0683c` session rail (activity bar / side bar / tree selection / tab underline); Terax = flat near-black monochrome, one gold hairline; Cursor = desaturated charcoal with the right-hand auxiliary (AI) bar as the hero; Lite = featherweight flat recolor only (no gradients/shadows/animation — perf is the point).

### Fixed
- **Warp's exit-code dots never rendered** — the old `WARP_CSS` styled `.successful-command` / `.error-command` / `.codicon-circle-filled` / `.codicon-error`, **none of which exist** in VS Code. Terminal command decorations are codicon glyphs colored via `color:`, keyed `.terminal-command-decoration` (success), `.error` (fail), `.default` (running) under a `.terminal` ancestor (decorationStyles.ts / terminal.css). Rewrote to recolor the real glyphs.
- **Warp's gold active-tab targeted a non-existent class** — `.panel-switcher-container` doesn't exist; the real chain is `.part.panel > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked` (panelpart.css:60), and the underline is a separate `.active-item-indicator` element, not a label border. Also corrected the terminal surface to `.pane-body.integrated-terminal`.

### Why
Drey rejected the VS-Code-Profiles look ("make it genuinely look like Warp/Cate/Terax"). The reskin mechanism was right but its selectors were the build agent's *guesses* at the live DOM — unverifiable without a GUI tap-test. Source-grounding every selector against `src/vs` (a stronger check than eyeballing) fixed Warp's real bugs and let all 4 other modes be authored at once, so one tap-test covers all five. Compiles 0 errors; verified structurally in `out/`. Public push still HELD pending Drey's visual confirm.

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
