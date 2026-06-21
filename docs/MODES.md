# Ursula Modes — How It Works

Ursula has five one-click **modes** — Terax, Warp, Cursor, Cate, Lite. Each one genuinely
restructures the whole window so it looks and feels like that app, while every mode keeps your
full extension set (Claude Code, Kilo Code, the marketplace) and right-sizes the RAM it uses.

This doc explains the architecture, how to add or change a mode, and the two design rules that
make it safe. See `docs/diagrams/Ursula-Modes-architecture.png` for the one-page picture.

---

## The one-sentence version

A "mode" is a VS Code **Profile** (settings + keybindings + a shared extension set) plus three
things the contribution bolts on at runtime: a **skin** (swappable CSS), a **layout** (which
workbench parts are hidden/shown/resized), and optional **widgets** (Warp's command bar, Cate's
session tabs). You switch modes from a bottom slide-up launcher; the window transforms.

Restaurant analogy: the kitchen (extension host) keeps cooking no matter how we redecorate the
dining room (chrome). We only change wallpaper, lighting, and furniture — the food still comes out.

---

## The pieces

| File | What it owns |
|------|--------------|
| `src/vs/workbench/contrib/ursulaModes/browser/templates.ts` | **The data.** `MODE_TEMPLATE` (5 profiles), `MODE_CSS` (per-mode skins), `MODE_LAYOUT` (per-mode part layout), the per-mode RAM blocks. Modes are DATA, not code. |
| `src/vs/workbench/contrib/ursulaModes/browser/ursulaModes.contribution.ts` | **The orchestrator.** Switches profiles, injects the skin, applies the layout, shows the widgets, runs extension extras, owns the bottom launcher. |
| `src/vs/workbench/contrib/ursulaModes/browser/media/ursulaModeBar.css` | The launcher + Warp command bar + Cate session-tab styling. |
| `extensions/ursula-ram-guard/` | RAM Guard dashboard, the Sessions rail (a TreeView), hardware detection + optimizer, and the session data the Cate tabs read. |

### Three mechanisms (all hung off `UrsulaModesContribution`)

1. **Skin — `applyModeCss`** swaps the body of one persistent `<style class="ursula-mode-css">`
   element (the same trick the color-theme engine uses) and toggles an `ursula-mode-<name>` class
   on the workbench root. Every rule in `MODE_CSS` is scoped under that class, so removing it fully
   reverts. Selectors are source-verified against the real VS Code DOM.

2. **Layout — `applyModeLayout`** reads `MODE_LAYOUT[mode]` and drives `layoutService.setPartHidden`
   / `toggleMaximizedPanel` (guarded by `isPanelMaximized()`) / `setSize`. This is the genuine
   restructure: Warp/Terax maximize the terminal and hide the side bars; Cate shows the left rail +
   right chat; Cursor widens the right AI panel; Lite strips to editor + status.

3. **Widgets — `updateModeWidgets`** shows the Warp command bar (bottom; Enter runs the typed
   command in the terminal) only in Warp, and the Cate session-tab strip (top; one tab per live
   Claude session) only in Cate.

---

## The two rules that make it safe

**Rule 1 — re-assert layout on the reload-proof path, but only on a real mode change.**
Part visibility (side bar / panel / aux bar) is **per-workspace runtime state**, not a profile
setting — it does not travel with the profile, and switching a mode with a folder open *reloads
the window*. So `applyModeLayout` runs in the constructor (after `whenRestored`, so the workbench's
own restore can't overwrite it) **and** on `onDidChangeCurrentProfile`. To avoid clobbering a
layout tweak you made inside a mode, it guards on a per-workspace storage key
(`ursula.mode.shapedFor`) and applies geometry **only when the mode actually changes**.

**Rule 2 — the skin re-applies on every load; the activity bar is a setting.**
The skin (CSS) is not user-editable, so it re-applies on every load. Chrome that *is* a profile
setting (activity bar location, status bar visibility, side bar side) lives in the templates and
persists per profile.

---

## How to add or change a mode

1. **Add the profile** in `templates.ts`: a `MODE_TEMPLATE[mode]` entry (settings + keybindings).
   Keep `useDefaultFlags.extensions = true` so it shares the one installed extension set.
2. **Add the skin**: a scoped string in `MODE_CSS[mode]`, every rule under
   `.monaco-workbench.ursula-mode-<name>`. CSS = recolor / hide / header chrome only.
3. **Add the layout**: a `MODE_LAYOUT[mode]` entry (`sidebar`, `auxbar`, `panel`, optional
   `focusSessions` / `openChat` / `auxWidth`). Geometry — not CSS — moves and resizes parts.
4. **Add the RAM block** (optional): trim only what that mode doesn't use; never trim a setting its
   own feature needs (Warp keeps terminal shell-integration; Cursor keeps the AI/index).
5. `npm run compile` (Node 24.15.0), then verify in `out/` — never trust boot-success alone.

---

## The RAM model

Every mode carries a live RAM gauge (RAM Guard, right side of the status bar) and a per-mode RAM
profile baked into its settings:

| Mode | RAM posture | Trims | Keeps |
|------|-------------|-------|-------|
| Warp | moderate | editor + TS-server weight (it's terminal-forward) | terminal shell-integration + GPU |
| Cursor | moderate | all terminal weight (not a Cursor feature) | editor index + AI composer |
| Terax | light | most editor intelligence (bare room) | hover + TS validate (so it isn't "broken") |
| Cate | balanced | idle terminal sessions + moderate editor | the rich session chrome |
| Lite | lowest (hero) | everything, hardest caps | the status bar (the RAM readout lives there) |

Lite is the optimizer room, so the experience modes don't have to sacrifice quality for RAM. The
optimizer (`ursula.optimizer.mode`) can recommend, auto-apply, or stay off — your choice. Apple
Silicon unified memory is treated as capable, not a weak GPU.

---

## Build & run (dev)

```bash
# Node 24.15.0 is required (.nvmrc); the project path must have no spaces.
export PATH=~/.nvm/versions/node/v24.15.0/bin:$PATH
cd ~/MyApps/ursula-ide
npm run compile        # compile FIRST — code.sh does not recompile
./scripts/code.sh      # boot the dev build (open a folder to test mode switching)
```

Switch modes with the bottom launcher or `Cmd+K M`; keys `1`–`5` jump between rooms.
