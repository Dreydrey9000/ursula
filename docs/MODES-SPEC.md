# Ursula Modes + Sessions Rail + Hardware-Aware RAM Guard v2 — Locked Implementation Spec

**Status:** LOCKED, buildable. FIVE distinct one-click modes + a hero optimizer (toggleable) + a cross-cutting movable Sessions rail + a hardware-aware RAM Guard.
**Date:** 2026-06-20. **Branch:** `ursula`. **Repo:** `~/MyApps/ursula-ide`.
**Verified against source this session** — every "load-bearing fact" below was grepped/read in-tree, not assumed.

> **Reconciliation note (why this revision exists):** an earlier pass over-cut the modes from 3 to 2 ("Focus + Cursor"). That was the wrong cut. Drey's requirement is **distinct, one-click-selectable modes**, each with its own NAME, preset, and feel. This revision (a) **adds a 5th mode, CATE** — a replica of Drey's actual daily driver (the open-source Cate IDE) — (b) adds a **cross-cutting movable "Ursula Sessions" rail** available in every mode, and (c) makes the optimizer **a user-chosen toggle** (recommend / auto / off) instead of an always-advisory badge. **All verified engineering from prior passes is kept verbatim** (profiles share one extension set via `useDefaultFlags.extensions=true`; upsert-by-name guard; the dead-branch RAM bug fix; pid re-validation on kill; Bone+Gold webview; Agents-window gate; CSP nonce; the hardware-tuned GPU lever). The modes section is **expanded, not reduced** — modes that overlap (Terax↔Warp) share template machinery, but ship as distinct named rooms.

---

## Goal

Give Ursula **five one-click "rooms"** — each a calmer, faster, more intentional setup than Cursor's default — while keeping the full Open VSX marketplace one click away, PLUS one cross-cutting surface (the Sessions rail) that's the same in every room:

- **TERAX** — ultra-minimal, terminal-forward, keyboard-driven. The leanest chrome possible. The "small/fast/good" room.
- **WARP** — Terax's base PLUS a maximized terminal panel, gold command blocks, and block-nav keybindings. The terminal-power room.
- **CURSOR** — the baseline layout you already know, plus AI chat on the right and minimap off. Simpler than Cursor (fewer tabs), full marketplace ceiling.
- **CATE** — a replica of Drey's actual daily driver. Warm-dark charcoal theme with brand-orange accent, the **Sessions rail pinned prominent**, and a rich Claude-session readout in the status bar. The "session-centric, calm" room.
- **LITE / OPTIMIZER (THE HERO)** — the most aggressive RAM/VRAM tuning preset for weak machines. Ursula reads your hardware and tunes itself so **anyone, on any Mac, gets a great AI vibe-coding setup.**

Each room is a native **VS Code User Data Profile** — a named bundle of *settings + keybindings* that VS Code already knows how to create and switch between. You change rooms with **one command + one status-bar pill**. All five rooms **share the exact same installed extensions** (so Claude Code and Kilo Code are never uninstalled and switching is fast and offline-safe). We write **zero new rendering code and zero native AI engine** — a mode is just *data* (a settings bundle) handed to VS Code's own profile machinery. Cate's distinct *look* ships as an additive Ursula color theme the Cate profile selects; no core theming changes.

Separately, two cross-cutting features ride on top of the modes:

1. **The Ursula Sessions rail** — a movable vertical TreeView listing live Claude Code sessions (a "flame-icon row per session"), available in **all five modes**, draggable between the left and right sidebars. It reuses the RAM Guard session scan verbatim — no second scanner.
2. **RAM Guard v2** — a Bone+Gold visual panel (a webview) that reuses the existing poll loop, fixes a live "Free RAM now" dead-branch bug, detects total RAM (`vm_stat`) AND VRAM/GPU (`system_profiler SPDisplaysDataType`), maps that to a **recommended mode**, and powers a **user-toggleable optimizer** (recommend / auto / off).

**The north star:** Ursula tunes itself to the machine. An 8GB integrated-GPU MacBook Air and a 64GB M3 Max both get a setup that feels great — because RAM Guard detects the hardware and (per the user's optimizer setting) points the user to, or auto-applies, the right preset.

```
User clicks pill  →  ursula.mode.switch  →  QuickPick (Terax / Warp / Cursor / Cate / Lite / Default)
       │                          │                        ▲
       │                          │              "Recommended for your Mac" badge
       │                          │              (from hardware detection — shown when optimizer.mode != "off")
       │            profile exists? ── yes ─→ switchProfile()
       │                          │
       │                         no ──→ createProfileFromTemplate() (once)
       ▼
  ext host reloads (~1-2s, extensions SHARED so it's light)  →  new room is live
                                                              (Sessions rail unchanged across rooms)
```

---

## The mechanism (shared by all five modes)

### Modes ARE profiles; profiles inherit extensions

- Each mode = **one non-default `IUserDataProfile`**, created from a static `IUserDataProfileTemplate` object literal.
- **`useDefaultFlags.extensions = true` on EVERY mode.** This is the keystone. It means every mode SHARES the default profile's installed extension set — no marketplace install/uninstall on switch, no offline failure, **Claude Code + Kilo Code always present.** Modes vary **only** settings + keybindings.
  - Verified at `userDataProfileImportExportService.ts:181` — `applyProfileTemplate` applies template settings only when `!profile.useDefaultFlags?.settings`. Since we set ONLY `extensions:true`, settings and keybindings still apply normally. The keystone is real and the side effect is understood.
- `Default` in the switcher = `switchProfile(defaultProfile)`. The default profile is the untouched baseline (it throws on edit), so "Default" is a guaranteed clean exit.

### Template inheritance — share machinery where modes overlap

The five modes are **not** five hand-written duplicates. They're authored as a base + deltas to keep the test matrix small while shipping distinct rooms:

```
BASE_LEAN  (the minimal-chrome settings block — activity bar hidden, single tab, less chrome)
   │
   ├── TERAX   = BASE_LEAN                                    (the lean room as-is)
   ├── WARP    = BASE_LEAN + { commandBlocks, maximized panel, block-nav keys }
   │
CURSOR   = {}  (inherits the DEFAULT profile look) + { claudeAgent, minimap off, chat-on-right }
CATE     = {}  (keeps useful chrome) + { ursula-ember-dark theme, Sessions-rail pinned, rich status bar }
LITE     = BASE_LEAN + { the full hardware-tuned optimization block }   (the hero)
```

`BASE_LEAN`, the optimization block, and the block-nav keybindings live as **shared object literals in `templates.ts`**. Terax and Warp share `BASE_LEAN`; Warp and Lite share the block-nav keys; Lite extends `BASE_LEAN` with the optimizer block. Cate is intentionally **not** lean — it keeps the activity bar and status bar because its soul is *session visibility*, not minimal chrome. Distinct NAMES + presets + feel are required and delivered; the **machinery** is shared so we author once.

### The upsert guard (mandatory — the single biggest trap)

`createProfileFromTemplate(template, options, token)` **creates a NEW profile every call — it does NOT upsert** (verified `userDataProfileImportExportService.ts:146`). The switcher MUST first check `userDataProfilesService.profiles` for an existing mode by name and `switchProfile` to it; only create from template if none exists. Without this guard, repeated clicks pile up duplicate profiles.

### Layout is authored by startup commands, NOT globalState

> **CUT — the `exportProfile` round-trip is fiction.** An earlier draft said: "run `exportProfile`, copy the dumped `globalState` string into the template." Verified at `userDataProfileImportExportService.ts:222` — `exportProfile(profile, exportFlags?): Promise<void>` returns **nothing**; it opens an editor panel via `doExportProfile`. There is no string to copy. The entire "GUI authoring phase" is deleted.

- `settings` / `keybindings` strings in the templates = hand-authored JSON (the exact IDs in the tables below). These are cheap, stable, and fully hand-authorable.
- **Sidebar/panel/aux-bar visibility (and panel maximize, view location) is runtime UI state, not a setting.** A `settings.json` can't set "panel=maximized" or "move the Sessions rail to the right bar." The few visibility/layout transitions a mode needs are run as **startup commands** inside the switcher right after switching (per-mode below). `globalState` authoring is abandoned entirely.

### Color contract

One accent across the lean rooms: warm gold **`#C2A878`** (the same color already hardcoded in `blockRendererAddon.ts` for the terminal command bar). The mode accent and RAM Guard's gauge reuse it. **Cate is the deliberate exception** — its soul is Drey's brand orange **`#E0683C`** on flame icons + the wordmark, with green for the context meter. Cate's orange is a *named, intentional* second accent scoped to one theme, not an accident; everywhere else stays gold.

---

## Mode 1 — TERAX ("small, fast, good")

**Feel:** A blank canvas that respects your attention. Cursor, code, and a clean terminal — keyboard-driven, leanest chrome of any mode. The activity bar is gone, tabs collapse to a single anchor, every non-essential ornament is off. You exhale when it opens. This is the minimal floor that WARP and LITE both build on.

| Setting | Value | Why |
|---|---|---|
| `workbench.editor.showTabs` | `"single"` | One orientation anchor (active file name) so the editor never feels broken. `"none"` is one keybinding away. |
| `workbench.activityBar.location` | `"hidden"` | Bare canvas — terminal-forward. |
| `workbench.statusBar.visible` | `true` | **KEEP — the RAM Guard pill and mode pill live here. RAM safety is the #1 product goal. Non-negotiable.** |
| `window.commandCenter` | `false` | Less chrome. |
| `breadcrumbs.enabled` | `false` | Less chrome. |
| `editor.minimap.enabled` | `false` | Less chrome. |
| `editor.stickyScroll.enabled` | `false` | Less chrome. |
| `workbench.layoutControl.enabled` | `false` | Less chrome. |
| `workbench.editor.editorActionsLocation` | `"hidden"` | Less chrome. |
| `window.menuBarVisibility` | `"compact"` | Less chrome. |
| `workbench.tree.renderIndentGuides` | `"none"` | Calmer tree. |
| `workbench.reduceMotion` | `"on"` | Calm. |
| `terminal.integrated.shellIntegration.enabled` | `true` | Keyboard-driven terminal flow (OSC 133). |
| `terminal.integrated.stickyScroll.enabled` | `false` | Calm terminal. |
| `terminal.integrated.gpuAcceleration` | `"on"` | Smooth (Terax assumes a capable machine; LITE is the one that tunes this down). |
| `terminal.integrated.tabs.enabled` | `true` | **Vertical terminal tabs** — terminal sessions render as a side list, not a dropdown (`terminalConfiguration.ts:63`). Part of the cross-cutting "sessions are vertical" baseline. |
| `terminal.integrated.tabs.location` | `"left"` | Put that vertical terminal-tab list on the left, beside the Sessions rail's natural home (`terminalConfiguration.ts:111-115`). |

**This block = `BASE_LEAN`.** Warp and Lite both extend it. (The two `terminal.integrated.tabs.*` lines are part of BASE_LEAN, so every lean room gets vertical terminal tabs for free.)

**Keybindings:** none beyond defaults (Terax is the pure minimal floor; block-nav is Warp's signature, not Terax's).
**Extensions:** SHARED via `useDefaultFlags.extensions=true`. Recommended: none.
**Startup commands on enter:** none required.
**Switcher toast:** *"Terax — small, fast, good. Bare canvas, keyboard-first."*

---

## Mode 2 — WARP ("terminal turned up to 11")

**Feel:** Terax's calm base, but the terminal is the star. The panel comes up **maximized**, every command gets a **warm-gold command block** (Warp's signature ornament), and **`Cmd+↑` / `Cmd+↓` jump between commands** like Warp's block navigation. The terminal-power room for shell-heavy work.

**Inherits all of `BASE_LEAN` (Terax)**, then adds:

| Setting | Value | Why |
|---|---|---|
| `terminal.ursula.commandBlocks` | `true` | The gold command bar = Warp's signature ornament. Real global setting (`terminalConfiguration.ts:618`). |
| `terminal.integrated.shellIntegration.enabled` | `true` | Required for command blocks + block-nav (OSC 133). (Already on from BASE_LEAN; restated for clarity.) |
| `terminal.integrated.shellIntegration.decorationsEnabled` | `"gutter"` | Subtle exit-code dots beside each command. |

**Keybindings (Warp's block-nav — ship inside this template's `keybindings` string; shared literal `BLOCK_NAV_KEYS`):**
```jsonc
[
  { "key": "cmd+down", "command": "workbench.action.terminal.scrollToNextCommand",     "when": "terminalFocus" },
  { "key": "cmd+up",   "command": "workbench.action.terminal.scrollToPreviousCommand", "when": "terminalFocus" }
]
```

**Extensions:** SHARED.
**Startup commands on enter (in order):**
1. ensure the panel is visible — if hidden, `workbench.action.togglePanel`.
2. `workbench.action.toggleMaximizedPanel` — bring the terminal panel up maximized (this is the runtime UI state a setting can't express).
**Switcher toast:** *"Warp — maximized terminal + gold command blocks. Open a fresh terminal to see the gold bars (they bind on new terminals only), Cmd+↑/↓ to jump commands."*

> **Why Warp is its own room, not a Terax setting:** the *feel* is genuinely different — a maximized panel + block-nav changes how you work, not just how it looks. It earns a name and a pill. The *machinery* is shared (BASE_LEAN + 3 settings + 2 keys + 2 startup commands), so it costs almost nothing to author while reading as a distinct mode.

---

## Mode 3 — CURSOR ("AI on your right")

**Feel:** The layout you already know — editor center, your familiar chrome — with the AI chat open on the right and the minimap gone. Simpler than Cursor (fewer tabs, less noise), but the full Open VSX marketplace ceiling is one click away. The AI is OUR bundled Claude agent, not a third-party engine.

> **CUT — don't re-author the baseline.** Cursor mode = **inherit the default look, change only what differs**, then open chat via one startup command. Authoring a near-duplicate of the baseline you already can't touch is wasted work.

**No native AI engine.** Rides the already-bundled `extensions/copilot` Claude agent (`github.copilot.chat.claudeAgent.enabled` exists at `extensions/copilot/package.json:3376`). It lives natively in the right Secondary Side Bar — layout is free.

| Setting | Value | Why |
|---|---|---|
| `github.copilot.chat.claudeAgent.enabled` | `true` | **GATE** — un-gates the Claude agent via setting (not an extension swap), so it rides the bundle safely. |
| `editor.minimap.enabled` | `false` | The one deliberate trim vs baseline. |

Everything else (tabs, activity bar, status bar, breadcrumbs, command center) **inherits the default profile values** — we do not restate them. That's what makes Cursor "the layout you already know."

**Keybindings:** none added (chat already binds `Cmd+Ctrl+I` on mac).
**Extensions:** SHARED (Claude Code + Kilo Code stay installed).
**Recommended extension (soft nudge — ships as a workspace file, NOT forced):**
`.vscode/extensions.json` → `{ "recommendations": ["kilocode.kilo-code"] }`. **Verify the exact Open VSX publisher id on open-vsx.org before shipping** — a wrong id silently no-ops. Gallery is already Open VSX (`product.json:30`), so install just works. Cursor mode is the room with the **full marketplace ceiling** — recommend Kilo Code here.

**Startup commands on enter (in order):**
1. ensure the auxiliary (right) bar is visible — if hidden, `workbench.action.toggleAuxiliaryBar`.
2. `workbench.action.openChatToSide` — opens the chat on the right.

> **CUT — the gated dynamic command.** An earlier step 3 (`workbench.action.chat.openNewChatSessionInPlace.claude-code`, wrapped in try/catch because it only exists after the agent registers) was the most fragile thing in the spec for the least payoff. `openChatToSide` already shows the chat. **Deleted.**

---

## Mode 4 — CATE ("your sessions, front and center")

**Feel:** Drey's actual daily driver, replicated on the VS Code base. Where Terax is bare and Warp is terminal-heavy, **Cate is session-centric and calm**: a warm near-black charcoal canvas, brand-orange accents on the flame icons and the wordmark, the **Ursula Sessions rail pinned prominent**, and a **rich Claude-session readout in the status bar** (model · context % · MCPs/hooks · cost · reset timers). Real Claude Code still runs in Ursula's terminal exactly as it does today — Cate is the host *shell* and *look*, not a Claude-only engine.

> **Source reconciliation (web + live observation):** Cate is a real, open-source, MIT-licensed IDE — `github.com/0-AI-UG/cate` (org Cero-AI), ~1.7k stars, Electron + React, Monaco editors, xterm.js terminals, built-in browser/doc/canvas panels. Drey runs v1.1.1 (current is v1.3.1). Cate's *own* in-app agent is "Pi" (multi-provider), but Drey runs **Claude Code-native sessions inside Cate's terminal/agent panels** — so the rich status bar he sees (Opus 4.8, 1M context, MCPs, hooks, $ spend, context %) is **Claude Code's own readout surfaced in Cate's chrome.** We replicate the *feel*, not Pi. No invention: warm-dark themes, sidebar that remembers workspace + tab order, per-chat model memory, git-decorated tree, and multi-project session restore are all corroborated by Cate's README/release notes.

**What "Cate mode" replicates on the VS Code base (highest-fidelity echoes):**
1. **Sessions are first-class** — the Sessions rail (below) is pinned visible and prominent. This is the vertical, flame-icon, status-dot list Drey saw.
2. **Warm-dark-with-orange theme** — near-black charcoal surfaces, off-white text, orange `#E0683C` accent on flame icons + the "Cate" wordmark area, green for the context meter / success ticks.
3. **Rich Claude-session status bar** — model + context %, MCP/rules/hooks/CLAUDE.md counts, cost, reset timers (built from data the RAM Guard scan + Claude session metadata already carry — see "Rich status readout" below).
4. **Minimal but not bare chrome** — calm, session-centric; keeps the activity bar (the Sessions rail lives there) and status bar, unlike the lean rooms.

| Setting | Value | Why |
|---|---|---|
| `workbench.colorTheme` | `"Ursula Ember Dark"` | The warm-dark-charcoal + orange-accent theme. Ships as an **additive Ursula color theme** (see file list); no core theming change. |
| `workbench.activityBar.location` | `"default"` | **KEEP visible** — the Sessions rail lives in the activity bar; hiding it would bury Cate's whole point. |
| `workbench.statusBar.visible` | `true` | The rich Claude-session readout lives here. Non-negotiable for Cate. |
| `editor.minimap.enabled` | `false` | Calm canvas. |
| `breadcrumbs.enabled` | `false` | Calm canvas. |
| `workbench.reduceMotion` | `"on"` | Calm. |
| `workbench.editor.showTabs` | `"multiple"` | Cate shows sessions as top tabs too; keep editor/session tabs visible (the default, restated as load-bearing). |
| `window.menuBarVisibility` | `"compact"` | Trim, not bare. |
| `terminal.integrated.tabs.enabled` | `true` | Vertical terminal tabs (matches Cate's vertical session list feel). |
| `terminal.integrated.tabs.location` | `"left"` | Side list on the left. |

**Theme:** `Ursula Ember Dark` ships as a JSON color theme in the RAM-Guard-adjacent contribution (additive, no core edit). Palette: bg `#1A1715` (near-black charcoal), surface `#221E1B`, text `#EDE6DD` (warm off-white), accent `#E0683C` (brand orange — flame icons, wordmark, active selections), success/context-meter green `#5FB871`. Maps onto standard VS Code theme token groups so every surface stays coherent.

**Keybindings:** none beyond defaults.
**Extensions:** SHARED.
**Startup commands on enter (in order):**
1. ensure the Sessions rail is visible and focused — `ursula.sessions.focus` (reveals the Ursula Sessions view container; see "The Sessions rail").
2. ensure the primary side bar is visible — if hidden, `workbench.action.toggleSidebarVisibility`.

**Rich status readout (Cate's signature, reusing data we already have):** Cate mode adds **one status-bar item** (registered by the modes contribution, shown only while `currentProfile.name === "Cate"`) that renders a compact Claude-session line: `$(flame) <activeSession> · ctx <pct>% · <n> MCPs · <n> hooks · $<chatCost>`. The counts and cost come from the **same Claude session metadata the RAM Guard scan already reads** (`~/.claude/sessions/*.json` + the live session list) plus a lightweight read of `~/.claude/settings.json` for the MCP/hook counts. **No new poll loop** — it refreshes on the existing RAM Guard tick via the shared message bus. Where a datum genuinely isn't available from local files (e.g. live token-reset timers, which only Claude Code's own UI knows), the item simply omits that segment rather than inventing it.

> **Why CATE is its own room:** it's the only mode whose *purpose* is session visibility and the warm-dark-orange identity Drey works in daily. Terax/Warp/Lite are about chrome and RAM; Cursor is about the AI panel; Cate is about **seeing all your sessions and their cost/context at a glance**, in his brand's skin. It earns a name, a pill, and the pinned Sessions rail.

---

## Mode 5 — LITE / OPTIMIZER (THE HERO — "tunes itself to your Mac")

**Feel:** The room that makes a weak machine feel capable. Ursula reads your RAM and VRAM and applies the most aggressive memory/VRAM-saving preset it safely can — GPU acceleration dialed to your hardware, file watchers narrowed, telemetry and experiments off, motion reduced, decorations limited. On a tired 8GB Air it's the difference between "laggy and hot" and "smooth." **This is the north star: anyone, regardless of RAM/VRAM, gets a great AI vibe-coding setup because Ursula tunes itself to the machine.**

**Inherits all of `BASE_LEAN` (Terax)** — minimal chrome is itself a RAM win — then adds the optimization block:

| Setting | Value | Why |
|---|---|---|
| `terminal.integrated.gpuAcceleration` | **hardware-tuned** → `"off"` on low-VRAM (<2GB / integrated), `"auto"` otherwise | **The VRAM lever.** Canvas/WebGL terminal rendering eats VRAM; turning it off on a weak GPU saves VRAM and reduces compositor pressure. RAM Guard's detected VRAM picks the value at apply-time. |
| `files.watcherExclude` | broadened — `**/node_modules/**`, `**/.git/objects/**`, `**/dist/**`, `**/build/**`, `**/.next/**`, `**/out/**`, `**/.cache/**`, `**/vendor/**` | Each watched dir holds OS file-watch handles + memory. Broadening the exclude list is one of the biggest real RAM wins on large repos. |
| `search.followSymlinks` | `false` | Stops the search indexer chasing symlink trees (can balloon memory + CPU). |
| `telemetry.telemetryLevel` | `"off"` | No background telemetry threads/network. |
| `workbench.enableExperiments` | `false` | Kills the experiments service (background fetch + state). |
| `editor.minimap.enabled` | `false` | Minimap renders a second copy of the file — pure overhead. (Already off via BASE_LEAN; restated as load-bearing for the optimizer.) |
| `workbench.reduceMotion` | `"on"` | Disables animations → fewer compositor frames, less GPU. (From BASE_LEAN; load-bearing here.) |
| `editor.stickyScroll.enabled` | `false` | Removes a sticky-render layer. (From BASE_LEAN.) |
| `editor.minimap.renderCharacters` | `false` | Belt-and-suspenders if a workspace re-enables the minimap. |
| `git.decorations.enabled` | `false` | Limit per-file decoration computation across the tree. |
| `problems.decorations.enabled` | `false` | Limit decorations. |
| `editor.occurrencesHighlight` | `"off"` | One fewer per-keystroke analysis pass. |
| `editor.lightbulb.enabled` | `"off"` | Removes a hover-time code-action probe. |
| `extensions.autoCheckUpdates` | `false` | No background update polling. |
| `extensions.autoUpdate` | `false` | No background update churn. |
| `terminal.integrated.gpuAcceleration` note | (see row 1) | **The single most hardware-dependent knob; RAM Guard supplies the value.** |

**Hardware-tuned at apply-time:** when LITE is applied via the **"Optimize now"** action (or picked while RAM Guard has a hardware reading), the switcher injects the detected `gpuAcceleration` value into the template's settings string **before** `createProfileFromTemplate`. If LITE is picked cold (no reading yet), it defaults `gpuAcceleration` to `"off"` (the safe low-VRAM choice — never worse than the default for a weak machine; a strong machine loses a little terminal smoothness but pays no correctness cost).

**Keybindings:** inherits BASE_LEAN (none extra). (Optionally shares `BLOCK_NAV_KEYS` — off by default to keep LITE about RAM, not terminal flair.)
**Extensions:** SHARED.
**Startup commands on enter:** none required (all gains are settings, applied on profile switch).
**Switcher toast:** *"Lite — tuned to your Mac (GPU accel {off|auto}, watchers trimmed, telemetry off). Watcher/GPU changes apply on this window; reopen a folder if a watcher feels stale."*

> **Why LITE is the hero and gets its own room:** it's the mode that delivers the product promise to the widest audience — people on cheap/old/loaded machines who'd otherwise bounce off a heavy AI IDE. It's also the target of the **optimizer toggle** (recommend / auto / off) and the **"Recommended for your Mac"** badge, so it must exist as a real, named, one-click profile — not a hidden setting.

---

## The Sessions rail (cross-cutting — available in ALL five modes)

**What it is:** a **movable, vertical "Ursula Sessions" TreeView** — a flame-icon row per live Claude Code session (`dir` · `MB` · `age` · status dot), with inline **Resume · Reveal · Free** actions per row, plus an "Interrupted sessions" group from crash-recovery data. It's the VS-Code-native answer to Cate's session list: sessions become **first-class, always-visible citizens** in every room, and Drey can drag the rail between the left and right sidebars to taste.

**Why a TreeView (not editor tabs):** editor tabs **cannot be vertical** — confirmed in source. `workbench.editor.showTabs` only accepts `"multiple" | "single" | "none"` (`editor.contribution.ts:377-384`); there is no orientation/vertical option anywhere in the editor parts. So the vertical/movable session surface **must be a contributed view**, not editor tabs. A TreeView is inherently vertical and inherently movable.

**Why it's "movable" for free:** every extension-contributed view is born `canMoveView: true` (verified `viewsExtensionPoint.ts:525` — only the built-in Remote container opts out). That flag lets the **user** drag the rail between the primary sidebar, the secondary (right) sidebar, and the bottom panel at runtime; VS Code persists the move. **We build zero drag mechanic** — the platform owns it.

**Lowest-effort correct wiring (TreeDataProvider, reuse the RAM Guard scan — do NOT duplicate it):**
1. Add `contributes.viewsContainers.activitybar` (a container + flame icon) and `contributes.views.<container>` (the "Ursula Sessions" view) to `extensions/ursula-ram-guard/package.json` — the same extension that already owns the scan. (Today it contributes only `commands` + `configuration` — verified — so this is net-new contribution wiring on top of existing-correct logic.)
2. Register `vscode.window.registerTreeDataProvider('ursulaSessions', provider)` whose `getChildren()` returns items from the **existing** `listClaudeSessions()` (`extension.ts:171`) + `scanInterrupted()` (`:243`). Reuse `resumeInTerminal()` (`:276`), `revealTranscript()` (`:327`), and the same re-validated kill path for the row actions.
3. The rail refreshes off the **existing RAM Guard tick** (fire the tree's `onDidChangeTreeData` from `updateStatusBar`) — **no second `setInterval`, no second scanner.**

> **Source correction (load-bearing — the brief's "scan `~/.claude/projects/*.jsonl` to enumerate sessions" is wrong):** the scan reads **two different places**, confirmed in source. It **enumerates** sessions from `~/.claude/sessions/*.json` (`listClaudeSessions`/`scanInterrupted`, `extension.ts:210` and `:244`), and only resolves the **transcript file** per-session from `~/.claude/projects/<dir>/<sessionId>.jsonl` for reveal/resume (`revealTranscript`, `:328`; `findTranscript`, `:340`). The rail reuses both exactly as the scan already uses them.

**Terminal sessions are vertical too (baked into the templates):** every lean room's `BASE_LEAN` (and Cate's settings) sets `terminal.integrated.tabs.enabled=true` + `terminal.integrated.tabs.location="left"` — confirmed real settings (`terminalConfiguration.ts:63` and `:111-115`) — so the *terminal* tab strip renders as a vertical side list, mirroring the Sessions rail. This is a free user setting; no build.

> **The clear, load-bearing caveat:** **native EDITOR tabs cannot be vertical** (`editor.contribution.ts:377-384`, enum `multiple|single|none` only — no orientation option). The **Sessions rail (a contributed TreeView) is the vertical, user-movable surface**, and the terminal tabs setting handles the terminal strip. Do not promise vertical editor tabs.

**Availability across modes:** because the rail is contributed by the always-active RAM Guard extension (`onStartupFinished`) and lives in its own activity-bar container, it's present in **every profile/mode** — the profile only changes settings/keybindings, never which extensions are installed. Cate mode additionally **focuses/pins** it on enter (startup command), but Terax/Warp/Cursor/Lite all have it available; the user just drags or reveals it. In the **Agents window** the rail still renders (it's window-agnostic scan data); only mode-switching is gated.

---

## RAM Guard v2 — Hardware-Aware Bone+Gold webview

**Scope:** additive. Add `openDashboardPanel()`, a module-level `let panel`, a one-time hardware probe + cache, the `ursula.ramGuard.openPanel` command, the exported `getRecommendedMode()` / `getDetectedGpuAccel()` helpers, the optimizer-toggle logic (below), the Sessions-rail `TreeDataProvider`, and **a couple of lines** in the existing tick. Every existing data source and helper in the file is reused verbatim.

### The live bug we fix (confirmed in source)
`extensions/ursula-ram-guard/src/extension.ts` builds the label `'Free RAM now — closes the session (chat is safe on disk)'` (line 306) but the handler tests `action.startsWith('Kill')` (line 314) — so **"Free RAM now" silently does nothing today.** The status-bar pill routes straight into this dead branch (`status.command = 'ursula.ramGuard.show'` → `showDashboard()`, lines 43/54). RAM safety, the #1 goal, is currently regressed.

> **Fix — delete, don't refactor.** Because v2 replaces the QuickPick drill-down with a webview, the dead `startsWith('Kill')` branch is **dead code to delete**, not to convert into typed actions. Repoint the pill to the panel; the orphaned QuickPick path goes away with it.

### Hardware detection (the hardware-aware core)

**Two probes, both already-present patterns:**

1. **RAM** — already detected. `getSystemRam()` spawns `vm_stat` (`extension.ts:90-93`) and `parseVmStat` yields `{ usedPct, usedGb, totalGb, compressorMb }` (`:105-122`). `totalGb` is the RAM signal. **Reused as-is.**
2. **VRAM / GPU** — NEW. Mirror the `getSystemRam` spawn pattern with `spawn('system_profiler', ['SPDisplaysDataType'])`, run **once at activation** (GPU doesn't change at runtime), parse the output, and cache it:

```ts
interface GpuInfo {
  readonly model: string;          // e.g. "Apple M3 Pro" | "Intel Iris Plus 640"
  readonly integrated: boolean;    // Apple Silicon GPU or "Intel/integrated" in the model line
  readonly vramMb: number | null;  // "VRAM (Total):" / "VRAM (Dynamic, Max):" in MB; null on Apple Silicon (shared memory)
}

let gpuInfo: GpuInfo | undefined;   // cached once; system_profiler is slow (~1-2s), never poll it

async function detectGpu(): Promise<GpuInfo> {
  return new Promise(resolve => {
    const proc = spawn('system_profiler', ['SPDisplaysDataType']);
    let out = '';
    proc.stdout.on('data', d => out += d);
    proc.on('close', () => resolve(parseDisplays(out)));
    proc.on('error', () => resolve({ model: 'unknown', integrated: true, vramMb: null })); // safe-low default
  });
}
// parseDisplays: read "Chipset Model:", "VRAM (Total):"/"VRAM (Dynamic, Max):", flag integrated when the
// model contains "Apple" (unified memory) or "Intel"/"integrated". On Apple Silicon, vramMb = null and the
// GPU is treated as sharing RAM — recommendation then leans on totalGb.
```

> **Apple-Silicon note (correct the "weak GPU" instinct):** on Apple Silicon, `vramMb = null` does **not** mean a weak GPU. Unified memory means the GPU shares system RAM — a fast integrated GPU, not a starved one. So the recommendation must **not** treat "integrated + no VRAM line" as automatically weak; it leans on `totalGb` for Apple Silicon and only treats *Intel-integrated / <2GB-discrete* as the genuinely VRAM-starved case for the GPU-off lever. (See the recommend-by-RAM-tier logic under the optimizer toggle.)

### Panel creation (reveal-don't-stack)
```ts
if (panel) { panel.reveal(); return; }
panel = vscode.window.createWebviewPanel(
  'ursulaRamGuard', 'RAM Guard', vscode.ViewColumn.Active,
  { enableScripts: true, retainContextWhenHidden: false }   // see note below
);
panel.onDidDispose(() => { panel = undefined; });
panel.webview.onDidReceiveMessage(msg => {
  // RE-VALIDATE every kill against the CURRENT session snapshot — never trust a pid from the webview:
  if (msg.type === 'kill') {
    const live = lastSessions.find(s => s.pid === msg.pid && s.cwd === msg.cwd);
    if (live) { try { process.kill(live.pid, 'SIGTERM'); } catch {} }
    // if not found in this tick's sessions, ignore — the pid is stale/recycled
  }
  if (msg.type === 'resume')   { resumeInTerminal(msg.cwd, msg.sessionId); }
  if (msg.type === 'reveal')   { revealTranscript(/* reconstruct from fields */); }
  if (msg.type === 'optimize') { vscode.commands.executeCommand('ursula.mode.lite'); }  // "Optimize now" → apply Lite
});
panel.webview.html = renderHtml(nonce, gpuInfo, getRecommendedMode());   // inline template literal, no asset files
```

> **CHANGE — `retainContextWhenHidden: false`.** That flag pins the hidden webview's entire DOM + JS heap in memory — a RAM cost inside a RAM tool. The panel's only state is `{ram, sessions, gpu}`, pushed every tick, so it repaints from scratch cheaply on reveal. `enableScripts:true` stays mandatory (else JS never runs).

> **CHANGE — pid re-validation on every kill.** The webview posts `{type:'kill', pid, cwd}` back; if the panel is stale (session died, OS recycled the pid) a blind `process.kill(pid)` could SIGTERM an unrelated process. Look the pid up in the **current** sessions snapshot (match pid AND cwd) before killing; ignore if absent. This is the real mitigation for the "cardinal sin" risk. **The Sessions rail's Free action routes through this same re-validated path.**

### Live updates (reuse the ONE timer)
Inside the existing `updateStatusBar(status)` — which already computes `r` and `sessions` — add:
```ts
lastSessions = sessions;                                   // keep the snapshot for kill re-validation + the rail
lastRamTotalGb = r.totalGb;                                // feed the hardware recommendation
sessionsTreeEmitter.fire();                                // refresh the Ursula Sessions rail (no 2nd scan)
if (panel) { panel.webview.postMessage({ ram: r, sessions, gpu: gpuInfo, recommended: getRecommendedMode() }); }
maybeAutoOptimize(r);                                      // optimizer toggle: auto-apply Lite once on weak machines (see below)
```
**No second timer** — a second `setInterval` would double the `vm_stat`/`ps` spawn rate. The GPU probe runs **once** at activation, never on the tick. Webview JS: `window.addEventListener('message', e => render(e.data))`.

### Layout (top → bottom)
1. **RAM gauge** — one big horizontal bar, fill driven by `usedPct`, color green → amber → red at the existing warn(75)/crit(88) thresholds.
2. **Compressor bar** — a thinner bar for `compressorMb / totalGb` (the true macOS memory-pressure signal — red past 30%). Called out separately because it's the honest danger sign, not `usedPct`.
3. **Hardware card** — one line: detected RAM (`totalGb`), GPU model + integrated/discrete + VRAM (or "shared memory" on Apple Silicon), and the **"Recommended for your Mac: Lite"** (or Terax) verdict with a `$(star-full)` badge. **(Shown only when `ursula.optimizer.mode != "off"`.)**
4. **"Optimize now" button (hero CTA)** — big gold button directly under the hardware card. Posts `{type:'optimize'}` → runs `ursula.mode.lite` with the detected GPU value baked in. Subtext: *"Applies Lite mode — tuned to this Mac. One click, reversible (switch back anytime)."* **(Shown when `optimizer.mode == "recommend"`; in `"auto"` mode it reads "Lite auto-applied — switch back anytime"; hidden in `"off"`.)**
5. **"Free the biggest hog"** — one button (kills `sessions[0]`, largest by RSS), routed through the same re-validated kill.
6. **Session table** — one card per Claude session (`dir`, `MB`, `age`, `status`) with **three inline buttons per row: Free · Resume · Reveal.** (Same data the Sessions rail shows; the panel is the deep view, the rail is the always-on glance.)
7. **Interrupted sessions** — a strip from `scanInterrupted` data with inline Resume buttons, so crash recovery is visible at a glance.
8. **Reassurance copy** next to every Free button: *"Your chat is safe on disk — resume anytime."* (the entire product promise; never drop it).

### Styling — Bone + Gold, theme-native
- Bone paper `#F6F2E9` background, ink `#20201E`, gold accent `#C2A878` (same as terminal bar). The "Optimize now" + "Recommended" badge use the gold. Map onto VS Code CSS vars where sensible (`var(--vscode-charts-red/green)` for gauge transitions) so it stays theme-coherent with zero asset files.
- **CSP mandatory:** per-render `nonce` (32 random chars), `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'">`, tag `<script nonce="${nonce}">`. **Fully offline — no CDN fonts/scripts.** A nonce-less script is silently blocked → if the panel renders blank, suspect the nonce first.

### Pill stays, repoint the buttons
The right-side status-bar pill is **unchanged** (always-on glance). Point `status.command` and the critical-alert "Open dashboard" button at `ursula.ramGuard.openPanel`. Keep `ursula.ramGuard.show` registered (have it call the panel too) so nothing breaks. Pill = glance, panel = deep view.

---

## The optimizer toggle (recommend / auto / off — a USER CHOICE)

**What changed and why:** the optimizer is no longer a fixed advisory badge. It's a **user setting** — Drey approved making recommend-vs-auto-apply the user's call. Some users want Ursula to *suggest* the Lite preset on a weak machine; some want it to *just happen*; some want it left alone entirely.

### The setting
```jsonc
"ursula.optimizer.mode": {
  "type": "string",
  "enum": ["recommend", "auto", "off"],
  "default": "recommend",
  "enumDescriptions": [
    "Recommend: show a 'Recommended for your Mac' badge + a one-click 'Optimize now' button. You decide. (Default.)",
    "Auto: on a weak machine, apply Lite automatically once at startup. Reversible — switch back anytime.",
    "Off: never suggest or apply Lite. No badge, no auto-switch."
  ]
}
```
Ships in `extensions/ursula-ram-guard/package.json` `contributes.configuration` (next to the existing threshold settings). Read via `vscode.workspace.getConfiguration('ursula.optimizer').get('mode')`.

### Behavior per value
- **`"recommend"` (default)** — advisory only. The QuickPick shows the `$(star-full) Recommended for your Mac` badge on the recommended entry; RAM Guard's hardware card + the gold **"Optimize now"** button appear. **Nothing is applied until the user clicks.** This preserves "a mode is a room you choose to walk into."
- **`"auto"`** — on a weak machine, `maybeAutoOptimize(r)` applies Lite automatically **once** at startup (guarded by a `hasAutoOptimizedThisSession` flag so it never fights the user mid-session, and never re-applies if they switch away). It fires a non-sticky toast: *"Lite auto-applied — tuned to this Mac. Switch modes anytime."* The badge/button still show in `recommend` style for re-applying after a manual switch.
- **`"off"`** — no badge, no hardware card verdict line, no "Optimize now" button, no auto-switch. The hardware card may still show *detected* RAM/GPU (informational), but offers no Lite verdict or CTA.

### Recommend-by-RAM-tier logic (Apple-Silicon-aware — unified memory is NOT a weak GPU)
```ts
export function getDetectedGpuAccel(): 'off' | 'auto' {
  if (!gpuInfo) return 'off';
  if (gpuInfo.integrated && gpuInfo.vramMb !== null) return 'off';     // Intel-integrated (has a VRAM line) → off
  if (gpuInfo.vramMb !== null && gpuInfo.vramMb < 2048) return 'off';  // <2GB discrete → off
  return 'auto';                                                        // Apple Silicon (vramMb null) or healthy discrete → auto
}

export function getRecommendedMode(): 'lite' | 'terax' | undefined {
  if (mode === 'off') return undefined;            // optimizer off → no recommendation at all
  if (!lastRamTotalGb) return undefined;           // no reading yet → no badge

  // Apple Silicon: unified memory, fast integrated GPU — judge by RAM only, never by "no VRAM line".
  const appleSilicon = gpuInfo?.integrated && gpuInfo?.vramMb === null;

  if (appleSilicon) {
    return lastRamTotalGb <= 16 ? 'lite' : 'terax';   // ≤16GB Apple Silicon is memory-tight → Lite; 24GB+ → Terax
  }
  // Intel / discrete machines:
  const weakRam = lastRamTotalGb <= 8;
  const tightRam = lastRamTotalGb <= 16 && gpuInfo?.integrated;           // 16GB on Intel-integrated is still tight
  const weakGpu  = gpuInfo?.integrated || (gpuInfo?.vramMb !== null && (gpuInfo?.vramMb ?? 0) < 2048);
  return (weakRam || tightRam || weakGpu) ? 'lite' : 'terax';
}
```
- **The Apple-Silicon correction is the load-bearing tier rule:** an 8GB or 16GB M-series Air is recommended Lite **because of RAM pressure**, not because its GPU is weak (it isn't). A 24GB+ / 36GB+ M-series machine is recommended Terax — plenty of headroom, keep GPU smoothness. We **never** turn GPU accel off on Apple Silicon for "low VRAM," because there's no separate VRAM to starve.
- `lastRamTotalGb` is set from the existing tick (one assignment) so the recommendation reflects the real machine.
- **Failure-safe by design:** any probe failure resolves to `integrated:true / vramMb:null` (looks like Apple Silicon) → judged by RAM, recommends Lite when tight. The worst case is "recommends the optimizer on a machine that didn't strictly need it," which costs the user nothing but a little terminal smoothness. Never recommends a heavy config on a weak machine.

> **Lite caching caveat (build note):** because the Lite template bakes the detected GPU value in at first-create, a profile created on a low-VRAM reading keeps that value until re-created. Same machine = same hardware, so fine. If a user moves the same login to very different hardware (rare), "Optimize now" should `switchProfile` to a freshly-recreated Lite if the detected GPU value no longer matches the stored one. v1.1 polish, not a v1 blocker; document it.

---

## The switcher (one command + one pill)

### The pill
- **Left-aligned** status-bar item (low priority) so it sits apart from the **right-aligned** RAM Guard pill.
- Text: `$(layers) Terax` (icon + active mode name). Reads `IUserDataProfileService.currentProfile`, refreshes on `onDidChangeCurrentProfile`, so it always shows truth.
- `command = "ursula.mode.switch"`.
- **Gated off in the Agents window:** if `currentProfile.id === AGENTS_WINDOW_PROFILE_ID` (`'agents'`), hide the pill and no-op the switcher. Modes are not supported there.

### The command
`ursula.mode.switch` opens a `QuickPick` with **six** entries, each with a feel-line. The entry matching the **hardware-recommended mode** carries a `$(star-full) Recommended for your Mac` detail badge **only when `ursula.optimizer.mode != "off"`**:
- `Terax — small, fast, good`
- `Warp — maximized terminal + gold blocks`
- `Cursor — AI on your right`
- `Cate — your sessions, front and center`
- `Lite — tuned to your Mac` &nbsp;`$(star-full) Recommended for your Mac` *(badge appears here on low-RAM machines when optimizer != off)*
- `Default — back to baseline`

Plus **five thin per-mode commands** (`ursula.mode.terax` / `ursula.mode.warp` / `ursula.mode.cursor` / `ursula.mode.cate` / `ursula.mode.lite`) so each is palette-searchable and keybindable. Chord: `Cmd+K M` → opens the switcher.

### Switch logic (the contribution owns this)
```
onPick(mode):
  if currentProfile.id == 'agents': return            // gated — modes unsupported in Agents window
  if mode == Default: switchProfile(defaultProfile); toast("Default"); return
  template = TEMPLATE[mode]
  if mode == Lite:
    gpu = ramGuard.getDetectedGpuAccel() ?? 'off'     // hardware-tuned; safe default 'off'
    template = withGpuAcceleration(template, gpu)      // inject before create
  existing = userDataProfilesService.profiles.find(p => p.name == MODE_NAME[mode])
  if existing:
    await switchProfile(existing)
  else:
    // first create pops a sticky cancellable progress notification — see Risk #1; do NOT also toast here
    await createProfileFromTemplate(template,
                  { name: MODE_NAME[mode], useDefaultFlags: { extensions: true } },
                  CancellationToken.None)
  runStartupCommands(mode)        // Warp: panel+maximize. Cursor: aux-bar+chat. Cate: focus Sessions rail+sidebar. Terax/Lite: none.
  toast(mode + new-terminals/window note where relevant)   // only on re-switch, not first-create
```

> **CUT — no first-run modal picker.** The visible pill in the status bar IS the discovery mechanism. A modal that interrupts first launch contradicts Terax's "you exhale when it opens" promise. The **optimizer toggle** (recommend / auto / off) is the user's lever for how proactive Ursula gets — passive by default.

### Naming guard
Mode profile names: `"Terax"`, `"Warp"`, `"Cursor"`, `"Cate"`, `"Lite"`. **Never name a mode `agents`** — collides with the reserved `AGENTS_WINDOW_PROFILE_ID` (`userDataProfile.ts:24`). We use display names, so we're clear by construction.

---

## Agents window (under-stated risk, now a hard rule)

`update.config.contribution.ts:80` declares `agentsWindow: { default: false, readOnly: true }`, and `userDataProfile.ts:300` **force-sets** `AGENTS_WINDOW_PROFILE_FLAGS` for the agents profile regardless of stored flags. In the Agents window the platform overrides your `useDefaultFlags` and treats several settings as read-only — so **a mode switch there may silently no-op.**

- **Hide the mode pill and disable the switcher + auto-optimize when `currentProfile.id === AGENTS_WINDOW_PROFILE_ID` (`'agents'`).** Modes are explicitly unsupported in the Agents window. Document it in the README one-liner. (RAM Guard + its dashboard **and the Sessions rail** still run there — hardware detection, the rail, and "Free a session" are window-agnostic; only the **mode switch / "Optimize now" / auto-optimize** actions are gated.)

---

## File-by-file change list (lowest-effort correct path)

> **Architecture decision (locked):** the mode switcher is a **core workbench contribution**, NOT a standalone extension. It needs the profile services (`IUserDataProfileManagementService`, `IUserDataProfileImportExportService`, `IUserDataProfileService`, `IUserDataProfilesService`) which are NOT exposed to `vscode.d.ts`. A standalone extension could only reach profiles through registered commands, which **cannot pass `useDefaultFlags` or do the upsert-by-name check**. So we clone the `registerWorkbenchContribution2(...)` pattern from `userDataProfile.contribution.ts` (which has DI access). **No new extension, no `gulpfile.extensions.ts` line for modes.** The Sessions rail + theme + optimizer setting, by contrast, live in the **RAM Guard extension**, which already owns the session scan.

### NEW — mode switcher (core workbench contribution)

| File | Content |
|---|---|
| `src/vs/workbench/contrib/ursulaModes/browser/ursulaModes.contribution.ts` | The contribution. Clones `registerWorkbenchContribution2`. On startup: create the **left** mode pill via `IStatusbarService`; register `ursula.mode.switch` + the **five** per-mode commands (`terax`/`warp`/`cursor`/`cate`/`lite`); subscribe `onDidChangeCurrentProfile` → refresh pill; **register the Cate-only rich status-bar item** (shown when `currentProfile.name === "Cate"`); gate everything off when `currentProfile.id === 'agents'`. Switch logic = the upsert-guarded block above + per-mode startup commands + the Lite GPU-injection step. Reads `getRecommendedMode()` + `ursula.optimizer.mode` from the RAM Guard extension (via the exported command `ursula.ramGuard.getHardware`) to draw the "Recommended for your Mac" badge in the QuickPick (only when optimizer != off). |
| `src/vs/workbench/contrib/ursulaModes/browser/templates.ts` | The shared literals + **five** `IUserDataProfileTemplate`-shaped objects. `BASE_LEAN` (minimal chrome + vertical terminal-tabs lines), `BLOCK_NAV_KEYS`, `OPTIMIZER_BLOCK`, then `TERAX = BASE_LEAN`, `WARP = BASE_LEAN + warp settings + BLOCK_NAV_KEYS`, `CURSOR = {claudeAgent, minimap}` (inherits default), `CATE = {emberTheme, activityBar-visible, statusBar, vertical terminal-tabs}` (keeps chrome, not lean), `LITE = BASE_LEAN + OPTIMIZER_BLOCK`. `withGpuAcceleration(template, value)` injects the hardware-tuned GPU value into LITE at apply-time. **No `globalState`.** |
| Workbench contributions barrel | One registration line wiring `ursulaModes.contribution.ts`, mirroring `userDataProfile.contribution.ts`. Compiles with core `npm run compile` — no gulpfile change. |

### CHANGE — Hardware-Aware RAM Guard v2 + Sessions rail + theme + optimizer (`extensions/ursula-ram-guard/`)

| File | Change |
|---|---|
| `src/extension.ts` | (a) Add module vars `let panel`, `let lastSessions`, `let lastRamTotalGb`, `let gpuInfo`, `let hasAutoOptimizedThisSession`, `const sessionsTreeEmitter`. (b) Add `detectGpu()` + `parseDisplays()` (the `system_profiler SPDisplaysDataType` probe, run **once** in `activate`). (c) Add exported `getDetectedGpuAccel()` + `getRecommendedMode()` (Apple-Silicon-aware) + `maybeAutoOptimize(r)`; register `ursula.ramGuard.getHardware`. (d) Add `openDashboardPanel()`, `renderHtml(nonce, gpu, recommended, optimizerMode)`, `getNonce()`. (e) **Register the `ursulaSessions` `TreeDataProvider`** whose `getChildren()` calls existing `listClaudeSessions()` + `scanInterrupted()`; row actions reuse `resumeInTerminal`/`revealTranscript`/re-validated-kill; refresh via `sessionsTreeEmitter`. (f) Add `lastSessions=sessions; lastRamTotalGb=r.totalGb; sessionsTreeEmitter.fire(); maybeAutoOptimize(r);` + the `postMessage(...)` line inside `updateStatusBar`. (g) **Delete** the dead `startsWith('Kill')` branch (line 314) + the orphaned `showDashboard` QuickPick path; repoint the pill to the panel. (h) Repoint `status.command` + alert button to `ursula.ramGuard.openPanel`. (i) Kill handler re-validates pid against `lastSessions` before `process.kill`. (j) Webview `optimize` message → `executeCommand('ursula.mode.lite')`. |
| `package.json` | Add `contributes.viewsContainers.activitybar` (flame-icon container) + `contributes.views.<container>` (the "Ursula Sessions" view, `id: ursulaSessions`). Add commands `ursula.ramGuard.openPanel`, `ursula.ramGuard.getHardware`, `ursula.sessions.focus`, and the per-row session commands (resume/reveal/free). Add the `ursula.optimizer.mode` enum setting under `contributes.configuration`. Add `contributes.themes` → `Ursula Ember Dark` (path to the JSON theme). No new deps. |
| `themes/ursula-ember-dark.json` (NEW) | The warm-dark-charcoal + brand-orange (`#E0683C`) color theme for Cate mode. Standard VS Code theme JSON; additive. |

### CHANGE — keybinding + recommendation file
- Mode chord `Cmd+K M` → `ursula.mode.switch`: register in the contribution's keybinding registration (no separate package).
- Warp block-nav keys ship **inside the Warp profile template's `keybindings` string** (shared `BLOCK_NAV_KEYS` literal) so they apply only in Warp.
- Cursor recommendation: ship `.vscode/extensions.json` with `recommendations: ["kilocode.kilo-code"]` (verify the Open VSX id first). **Do NOT** add `product.json extensionImportantTips` (forced startup nag = anti-soul).

### Settings defaults — ONE new setting
`ursula.optimizer.mode` (enum, default `"recommend"`) is the **only** new user-facing setting. All mode behavior still lives inside profile templates, invisible to the user. The referenced setting IDs (`terminal.ursula.commandBlocks`, `github.copilot.chat.claudeAgent.enabled`, `terminal.integrated.tabs.*`, the optimizer knobs) already exist in-tree. Do **not** add any other per-knob settings UI.

### DO NOT TOUCH
- `extensions/copilot/package.json` (7186-line vendor manifest — drive Cursor via setting + startup commands only).
- The default profile (throws on edit).
- `blockRendererAddon.ts` gold const (leave it; theming is a no-payoff code change).
- No second timer, no new deps, no bundler, no JS/CSS asset files (the Ember theme JSON is data, not an asset bundle). The GPU probe runs **once** at activation, not on the poll loop. The Sessions rail reuses the existing scan — **no second scanner.**

---

## Simplicity guardrails (the locked floor)

1. **Five named rooms + untouched Default.** Terax / Warp / Cursor / Cate / Lite. Distinct names, presets, feel — but authored from shared literals (`BASE_LEAN`, `BLOCK_NAV_KEYS`, `OPTIMIZER_BLOCK`) so the code is small. No custom-mode builder, no per-knob UI.
2. **One shared extension set** (`useDefaultFlags.extensions=true`) — switching never installs/uninstalls; Claude Code + Kilo Code always live; fast + offline-safe.
3. **Cursor inherits the baseline; Cate keeps useful chrome.** Cursor changes only `claudeAgent.enabled` + `minimap` + opens chat. Cate selects the Ember theme + pins the Sessions rail + adds a rich status item — no re-authoring of the default look.
4. **Modes are DATA, not code.** Static `settings`/`keybindings` literals — no `globalState`, no `exportProfile` round-trip. Layout (Warp maximize, Cursor chat, Cate rail-focus) via startup commands. Lite's one hardware-dependent value injected at apply-time.
5. **The Sessions rail is one TreeView, reusing the existing scan.** Vertical + user-movable for free (native `canMoveView`); available in all five modes; no second scanner, no second timer. Editor tabs can't be vertical — the rail is the vertical surface; the terminal-tabs setting handles the terminal strip.
6. **The optimizer is a user toggle, not a forced behavior.** `recommend` (default) suggests, `auto` applies once on weak machines, `off` does nothing. Apple-Silicon-aware tiers (unified memory ≠ weak GPU).
7. **RAM Guard v2 is additive + hardware-aware:** one function for the panel, one one-time GPU probe, a few tick lines; reuses every data source, helper, and the single poll loop. The dead branch is *deleted*, not refactored.
8. **Webview doesn't hoard RAM:** `retainContextWhenHidden:false`; repaint from the next tick.
9. **Everything guarded.** New commands; settings-gated behavior; default profile untouched; pill + "Optimize now" + auto-optimize disabled in the Agents window. Touch nothing → nothing changes.
10. **Color language:** gold `#C2A878` everywhere (terminal bar, mode accent, RAM gauge, Optimize-now, Recommended badge) — with Cate's brand-orange `#E0683C` as the one named, theme-scoped exception.
11. **Hardware detection is failure-safe.** Any probe failure → judged by RAM (looks like Apple Silicon) → recommends Lite / GPU off when tight — the safe-low choice that never hurts a weak machine.

---

## Risks (carry into build + verify)

| # | Risk | Mitigation |
|---|---|---|
| 1 | **First create pops a sticky cancellable progress notification** (`createProfileFromTemplate`, sticky:true, cancellable:true, verified line 151). Fires only on first create per mode. | Acknowledge it; do NOT also fire your own toast on first create. With five modes it's at most five lifetime notifications. |
| 2 | Profile switch reloads the ext host (~1-2s). Not instant. | Shared extensions keep it light. Toast on re-switch sets the "a mode is a room you walk into" expectation. |
| 3 | **Profile-per-workspace stickiness** — switch binds to the current workspace; in an empty window it's global. | Document global-vs-per-project in the toast/README. |
| 4 | Warp terminal feel (command blocks, block-nav) only applies to **NEW terminals**; the maximize is window-local. | Switcher toast says so on apply. |
| 5 | Cursor inert unless `claudeAgent.enabled=true` AND auth path chosen (Copilot sub vs Anthropic API key). | Ship the setting flipped on; pick auth before defaulting. |
| 6 | Wrong Open VSX id silently no-ops the Kilo recommendation. | **Verify `kilocode.kilo-code` on open-vsx.org before shipping.** |
| 7 | **Agents window override** — modes silently no-op there. | **Hide the pill + disable switcher + "Optimize now" + auto-optimize when `currentProfile.id === 'agents'`.** Rail + RAM gauge still render. |
| 8 | RAM webview CSP — nonce-less script silently blocked (blank panel). | Per-render nonce + `default-src 'none'`; if blank, suspect nonce first. |
| 9 | **RAM-safety regression is the cardinal sin** — killing the wrong pid (from the panel OR the Sessions rail Free action). | Re-validate every kill pid against the **current** sessions snapshot (pid AND cwd) before `process.kill`; ignore stale. Keep "safe on disk" copy. Smoke-test Free from BOTH surfaces before shipping. |
| 10 | Don't name a mode profile `agents` (reserved id collision). | Names locked to Terax/Warp/Cursor/Cate/Lite (display names). |
| 11 | **`system_profiler SPDisplaysDataType` is slow (~1-2s) and format varies** (Apple Silicon = no VRAM line / unified memory; Intel = "VRAM (Total)"/"VRAM (Dynamic, Max)"; eGPU possible). | Run it **once** at activation, never on the tick. Parse defensively; on failure default to `integrated:true, vramMb:null` (judged by RAM). **Treat Apple Silicon as shared-memory + fast GPU — judge by `totalGb`, never flag it "weak GPU."** |
| 12 | **Lite bakes the detected GPU value at first-create**; same login on very different hardware keeps a stale value. | Same machine = same hardware, fine. v1.1: "Optimize now" re-creates Lite if detected GPU value differs. Document; not a v1 blocker. |
| 13 | **Over-aggressive watcher excludes could hide real file changes** in an excluded dir. | The Lite exclude list targets known-generated dirs only. Documented in the Lite toast: "reopen a folder if a watcher feels stale." Lite is opt-in per room. |
| 14 | **Editor tabs cannot be vertical** (`editor.contribution.ts:377-384`, enum `multiple|single|none`). Promising vertical editor tabs would be a dead end. | The **Sessions rail (TreeView)** is the vertical/movable surface; the **terminal-tabs setting** handles the terminal strip. Do not attempt vertical editor tabs. |
| 15 | **Sessions rail availability** — a contributed view only shows if its host extension is active. | RAM Guard activates `onStartupFinished` and the rail lives in its own activity-bar container, so it's present in every mode + the Agents window. Cate just focuses it on enter. |
| 16 | **`auto` optimizer fighting the user** — auto-applying Lite repeatedly or after a manual switch would feel hostile. | Guard `maybeAutoOptimize` with `hasAutoOptimizedThisSession` (apply once per session, never re-apply after the user switches away). Non-sticky toast only. |
| 17 | **Cate rich status bar inventing data** — live token-reset timers aren't in local files. | Build the status item from data we genuinely have (`~/.claude/sessions/*.json`, the live scan, `~/.claude/settings.json` counts); **omit** any segment we can't source. Never fabricate a reset timer. |

---

## Verification ritual (per `reference-ursula-dev-compile-gotcha`)

**Never trust boot-success; verify structurally first.** (`./scripts/code.sh` does NOT recompile — `npm run compile` MUST run first.)

1. **Compile:** `npm run compile` (Node 24.15.0). Mode contribution = core compile; RAM Guard = `gulp compile-extension:ursula-ram-guard`. Confirm `Finished compilation` with no errors.
2. **Structural check in `out/`** (NOT boot) — grep the compiled output to prove the change landed:
   - `out/.../ursulaModes.contribution.js` exists and contains `createProfileFromTemplate`, the upsert `find` guard, `useDefaultFlags`, the `'agents'` gate, `withGpuAcceleration`, the Cate status item, and all **five** mode names (`Terax`,`Warp`,`Cursor`,`Cate`,`Lite`).
   - `extensions/ursula-ram-guard/out/extension.js` contains `createWebviewPanel`, `postMessage`, the pid re-validation, `system_profiler`/`SPDisplaysDataType`, `getRecommendedMode`, `registerTreeDataProvider`/`ursulaSessions`, `maybeAutoOptimize`, the `optimize` message handler, **and NO surviving `startsWith('Kill')`**.
   - `extensions/ursula-ram-guard/package.json` declares the `ursulaSessions` view + container, the `ursula.optimizer.mode` enum, and the `Ursula Ember Dark` theme.
3. **Boot:** clear the lockfile, `pkill -9 -f "Ursula.app/Contents/MacOS/Ursula"`, relaunch.
4. **Vision-verify each changed surface** (screenshot + eyeball):
   - Mode pill visible (left) + RAM pill (right), distinct.
   - Switch to each of the **five** modes → chrome matches the tables:
     - **Terax** bare/minimal;
     - **Warp** = Terax + maximized terminal panel + gold bars in a NEW terminal + Cmd+↑/↓ block-nav;
     - **Cursor** = familiar baseline + chat on right + no minimap;
     - **Cate** = warm-dark Ember theme + Sessions rail pinned/focused + rich Claude status line in the status bar;
     - **Lite** = minimal chrome, and (on a low-VRAM/Intel machine) terminal GPU accel off.
   - `Default` returns to baseline; repeated clicks create NO duplicate profiles.
   - **Sessions rail:** visible in every mode; lists live sessions with flame icons + status dots; **drag it from the left sidebar to the right sidebar and confirm it docks + persists**; Resume/Reveal/Free per row work; Free routes through re-validated kill.
   - **Terminal tabs vertical:** open 2+ terminals, confirm the tab list renders vertically on the left.
   - RAM Guard panel opens in Bone+Gold; gauge + compressor bar render; **hardware card shows detected RAM + GPU + recommended mode**; **"Optimize now" applies Lite**; session cards show Free/Resume/Reveal.
5. **Optimizer-toggle check:** set `ursula.optimizer.mode` to each value →
   - `recommend`: badge + hardware verdict + "Optimize now" appear; nothing applies until clicked.
   - `auto`: on a weak reading, Lite auto-applies **once** with a non-sticky toast; does NOT re-apply after you switch away.
   - `off`: no badge, no verdict, no "Optimize now", no auto-switch.
6. **Apple-Silicon tier check:** confirm `getRecommendedMode()` recommends Lite for ≤16GB Apple Silicon and Terax for 24GB+; confirm `getDetectedGpuAccel()` returns `auto` (never `off`) on Apple Silicon; confirm Intel-integrated / <2GB-discrete returns `off`.
7. **Agents-window check:** open an Agents window; confirm the mode pill is hidden and the switcher + "Optimize now" + auto-optimize no-op, **but the Sessions rail + RAM gauge still render**.
8. **Hardware-detection check:** run `system_profiler SPDisplaysDataType` in a terminal, confirm the dashboard's hardware card matches (GPU model, integrated/discrete, VRAM or "shared"). Force a probe failure once → confirm it falls back to Lite/GPU-off without crashing.
9. **RAM-safety smoke test:** spawn a throwaway `claude` process, click its row's **Free** in BOTH the panel AND the Sessions rail, confirm the pid dies, the "chat safe on disk" copy showed, AND a stale/wrong pid is ignored (re-validation works). Required before "done."
10. Update `docs/MODES-BUILD-STATE.md` progress log + `CHANGELOG.md` (date, Added/Fixed, the "why").

---

## Definition of Done

- [ ] `ursulaModes` workbench contribution compiles; mode pill + `Cmd+K M` switcher work; **all five modes** (Terax/Warp/Cursor/Cate/Lite) apply their exact settings; `Default` returns to baseline; **no duplicate profiles on repeated clicks**; pill hidden + switcher no-op in the Agents window.
- [ ] All five modes share extensions (verify Claude Code + Kilo Code still installed after switching all five + Default).
- [ ] **Warp** brings up a maximized terminal + gold blocks + block-nav; **Cursor** opens chat right + no minimap; **Cate** loads the Ember theme + focuses the Sessions rail + shows the rich Claude status line; **Lite** applies the optimizer block with the hardware-tuned GPU value.
- [ ] **Sessions rail:** the `ursulaSessions` TreeView lists live sessions in every mode, is user-draggable between left/right sidebars (and persists), reuses the existing scan (no second scanner/timer), and its Free action routes through re-validated kill. Terminal tabs render vertically on the left.
- [ ] **Optimizer toggle:** `ursula.optimizer.mode` (default `recommend`) drives badge/CTA in `recommend`, applies Lite once in `auto`, and silences everything in `off`. Apple-Silicon tiers correct (≤16GB AS → Lite, 24GB+ → Terax; never GPU-off on AS).
- [ ] RAM Guard v2 panel (Bone+Gold) opens, live-updates on the existing loop, **shows the hardware card (RAM + GPU + recommended mode)**, **"Optimize now" applies Lite**, Free/Resume/Reveal work per-row, "Free the biggest hog" + interrupted-sessions strip present, reassurance copy intact, `retainContextWhenHidden:false`.
- [ ] **Hardware-aware:** `system_profiler` GPU probe runs once at activation, parses Apple-Silicon + Intel formats, fails safe to Lite/GPU-off; `getRecommendedMode()` drives the switcher badge.
- [ ] **The `startsWith('Kill')` dead branch is deleted; Free is smoke-tested killing a real pid from BOTH the panel and the rail; a stale pid is re-validated and ignored.**
- [ ] Verified structurally in `out/`, booted, vision-verified, optimizer-toggle-tested, Apple-Silicon-tier-tested, hardware-detection-tested, RAM-safety-tested. CHANGELOG + ledger updated.

---

### Load-bearing source facts (verified this session)
- `exportProfile(profile, exportFlags?): Promise<void>` returns nothing (`userDataProfileImportExportService.ts:222`) → the "copy the dumped globalState string" workflow does not exist; layout authored via startup commands instead.
- `createProfileFromTemplate` wraps creation in `ProgressLocation.Notification, sticky:true, cancellable:true` (`userDataProfileImportExportService.ts:151`) and does NOT upsert (`:146`) → first create shows a sticky notification; upsert-by-name guard is mandatory.
- `applyProfileTemplate` applies template settings only when `!profile.useDefaultFlags?.settings` (`:181`) → setting only `extensions:true` keeps settings/keybindings applying. Keystone holds.
- RAM bug confirmed: label `'Free RAM now — closes the session (chat is safe on disk)'` (extension.ts:306) vs handler `action.startsWith('Kill')` (:314); pill routes here via `status.command = 'ursula.ramGuard.show'` (:43) → `showDashboard()` (:54).
- RAM detection reusable: `getSystemRam()` spawns `vm_stat` (`extension.ts:90-93`), `parseVmStat` → `{usedPct, usedGb, totalGb, compressorMb}` (`:105-122`). The `spawn(...) → stdout → close → parse` pattern is the template for the new `system_profiler SPDisplaysDataType` GPU probe.
- **Session scan sources (corrected):** sessions are ENUMERATED from `~/.claude/sessions/*.json` (`listClaudeSessions`/`scanInterrupted`, `extension.ts:210`, `:244`); the transcript `.jsonl` is resolved per-session from `~/.claude/projects/<dir>/<sessionId>.jsonl` only for reveal/resume (`revealTranscript` `:328`, `findTranscript` `:340`). The Sessions rail reuses both verbatim. `ClaudeSession` shape = `{pid, rssMb, age, sessionId, cwd, status}` (`:22`).
- **Terminal tabs CAN be vertical:** `terminal.integrated.tabs.enabled` (default true, `terminalConfiguration.ts:63`) renders tabs as a side list; `terminal.integrated.tabs.location` = `"left"|"right"` (`:111-115`). Baked into BASE_LEAN + Cate.
- **Editor tabs CANNOT be vertical:** `workbench.editor.showTabs` enum = `multiple|single|none` only (`editor.contribution.ts:377-384`); no orientation option exists. The Sessions rail is the vertical surface.
- **Views are user-movable for free:** every contributed view is born `canMoveView: true` (`viewsExtensionPoint.ts:525` — only the Remote container opts out) → the user drags the rail between sidebars at runtime; VS Code persists it. No drag mechanic to build.
- RAM Guard `package.json` today contributes only `commands` + `configuration` (no `views`/`viewsContainers`) — verified → the Sessions rail, theme, and optimizer setting are net-new contribution wiring on top of the existing-correct scan logic.
- `agentsWindow: { default:false, readOnly:true }` (`update.config.contribution.ts:80`) + `AGENTS_WINDOW_PROFILE_FLAGS` force-set (`userDataProfile.ts:300`), `AGENTS_WINDOW_PROFILE_ID = 'agents'` (`:24`) → modes unsupported in the Agents window; gate the pill + Optimize-now + auto-optimize off (rail + gauge still run).
- `terminal.ursula.commandBlocks` exists (`terminalConfiguration.ts:618`) and `github.copilot.chat.claudeAgent.enabled` exists (`extensions/copilot/package.json:3376`) → both referenced settings are real, no new settings needed.
- `product.json:30` gallery = Open VSX → Kilo Code installs natively (verify exact publisher id before shipping).
- Cate is real + open-source: `github.com/0-AI-UG/cate` (org Cero-AI), MIT, ~1.7k stars, Electron + React + Monaco + xterm.js; Drey runs v1.1.1 (current v1.3.1). In-app agent is "Pi" (multi-provider); Drey's rich status bar = **Claude Code running inside Cate**, surfaced in Cate's chrome. Cate mode replicates the feel, not Pi.
