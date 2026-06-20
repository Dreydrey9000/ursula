# Ursula Modes — Enrichment Spec

**What this is:** A SAFE, additive-only enrichment of the five Ursula mode templates in
`src/vs/workbench/contrib/ursulaModes/browser/templates.ts`. Each mode gets a few
authentic touches stolen from the tool it echoes (Warp / Terax / Cursor / Cate) — nothing
that breaks compile, the terminal, or the editor.

**Ground rules baked into this spec:**
- Every settings id and command id below was grepped and CONFIRMED present in this repo,
  EXCEPT the handful in the **⚠️ VERIFY IN-TREE** section at the bottom — do NOT add those
  until verified.
- Additive only. We extend the existing `BASE_LEAN` / `WARP_SETTINGS` / `CURSOR_SETTINGS` /
  `CATE_SETTINGS` / `OPTIMIZER_BLOCK` literals and the keybindings arrays. We do not remove
  or flip any existing key.
- Keybindings stay terminal- or context-scoped where the source tool scopes them, so they
  never shadow a global editor binding. No `cmd+p`, `cmd+w`, `cmd+t`, `cmd+k` global
  rebinds — those collide with core VS Code and the existing UX. We only add the safe,
  scoped ones.
- "Taste, not bloat": 3–6 additions per mode max.

---

## TERAX — `BASE_LEAN` (the lean room)

Terax's identity is keyboard-first + instant + zero distraction. BASE_LEAN already nails
chrome-hiding. Add only a couple of read-comfort + scrollback touches; do NOT add `vim.enabled`
(no bundled Vim extension in-tree — would be a dead setting).

**Settings to add to `BASE_LEAN`:**

| setting id | value | echoes | note |
|---|---|---|---|
| `terminal.integrated.scrollback` | `5000` | Terax | longer history, matches Terax default; cheap |
| `editor.renderWhitespace` | `none` | Terax | clean canvas feel |
| `editor.cursorBlinking` | `solid` | Terax | steady editor caret |
| `workbench.startupEditor` | `none` | Terax | open straight into work, no welcome |

**Keybindings:** none added. (Terax's editor split keys map 1:1 to VS Code defaults already;
adding them is redundant noise.)

---

## WARP — `BASE_LEAN + WARP_SETTINGS` + `BLOCK_NAV_KEYS`

Warp's soul = command Blocks. The repo already ships `WARP_SETTINGS` (commandBlocks +
gutter decorations) and `BLOCK_NAV_KEYS` (Cmd+↑/↓). Enrich with the rest of the
shell-integration block feel + the authentic Warp Dark ANSI palette, and a few MORE
block-scoped keys (all terminal-focused, so zero global collisions).

**Settings to add to `WARP_SETTINGS`:**

| setting id | value | echoes | note |
|---|---|---|---|
| `terminal.integrated.shellIntegration.decorationsEnabled` | `both` | Warp | gutter dot + overview-ruler tick = the visible block boundary. UPGRADE from existing `gutter`; safe superset |
| `terminal.integrated.stickyScroll.enabled` | `true` | Warp | pins running command header while output scrolls (Warp keeps cmd visible). Overrides BASE_LEAN's `false` — intentional, Warp-only |
| `terminal.integrated.smoothScrolling` | `true` | Warp | echoes Warp's GPU buttery scroll |
| `terminal.integrated.cursorStyle` | `block` | Warp | Warp's editor-style block caret |
| `terminal.integrated.cursorBlinking` | `false` | Warp | steady caret |

**Warp Dark ANSI palette** — add as `workbench.colorCustomizations` inside `WARP_SETTINGS`.
This is the exact `default_dark.yaml` palette; accent `#7cafc2` is the signature Warp blue.
Scoped to colorCustomizations so it only tints the terminal, leaves the active theme intact:

```json
"workbench.colorCustomizations": {
  "terminal.background": "#181818",
  "terminal.foreground": "#d8d8d8",
  "terminalCursor.foreground": "#7cafc2",
  "terminal.ansiBlack": "#181818",
  "terminal.ansiRed": "#ab4642",
  "terminal.ansiGreen": "#a1b56c",
  "terminal.ansiYellow": "#f7ca88",
  "terminal.ansiBlue": "#7cafc2",
  "terminal.ansiMagenta": "#ba8baf",
  "terminal.ansiCyan": "#86c1b9",
  "terminal.ansiWhite": "#d8d8d8",
  "terminal.ansiBrightBlack": "#585858",
  "terminal.ansiBrightRed": "#ab4642",
  "terminal.ansiBrightGreen": "#a1b56c",
  "terminal.ansiBrightYellow": "#f7ca88",
  "terminal.ansiBrightBlue": "#7cafc2",
  "terminal.ansiBrightMagenta": "#ba8baf",
  "terminal.ansiBrightCyan": "#86c1b9",
  "terminal.ansiBrightWhite": "#f8f8f8"
}
```

**Keybindings to add to `BLOCK_NAV_KEYS` (all `when: terminalFocus` — no global collisions):**

| key | command id | echoes | verified |
|---|---|---|---|
| `cmd+k` | `workbench.action.terminal.clear` | Warp "Clear Blocks" | ✅ in-tree |
| `shift+cmd+c` | `workbench.action.terminal.copyLastCommandOutput` | Warp "Copy Output" | ✅ in-tree |
| `ctrl+r` | `workbench.action.terminal.runRecentCommand` | Warp "Command History Search" | ✅ in-tree |
| `cmd+]` | `workbench.action.terminal.focusNextPane` | Warp "Next Pane" | ✅ in-tree |
| `cmd+[` | `workbench.action.terminal.focusPreviousPane` | Warp "Previous Pane" | ✅ in-tree |
| `shift+cmd+enter` | `workbench.action.toggleMaximizedPanel` | Warp "Toggle Maximize Pane" | ✅ in-tree |

> NOTE on `cmd+k` in terminal: VS Code's default `cmd+k` in terminal is also a chord prefix
> in some contexts, but `when: terminalFocus` + single binding to `terminal.clear` is exactly
> what Warp does and is the standard VS Code terminal-clear pattern. Keep it terminal-scoped.

---

## CURSOR — `CURSOR_SETTINGS` (the AI room)

Cursor's soul = Cmd+K inline edit, Cmd+L chat, Cmd+I agent, driven by Ursula's OWN bundled
Claude/Copilot agent (no extension swap). The repo already un-gates the agent
(`github.copilot.chat.claudeAgent.enabled: true`). Add the inline-suggestion settings +
the safe, confirmed bindings. The Cmd+Enter/Cmd+Backspace accept/discard pair is FLAGGED —
those command ids did not verify.

**Settings to add to `CURSOR_SETTINGS`:**

| setting id | value | echoes | verified |
|---|---|---|---|
| `editor.inlineSuggest.enabled` | `true` | Cursor Tab | ✅ core VS Code setting |
| `github.copilot.nextEditSuggestions.enabled` | `true` | Cursor "next edit" | ✅ in extensions/copilot |
| `chat.agent.enabled` | `true` | Cursor Agent mode | ✅ in-tree (chat contrib) |
| `editor.tabCompletion` | `on` | Cursor Tab-accept | ✅ core VS Code setting |

**Keybindings (new `keybindings` array for CURSOR_TEMPLATE — it currently has none):**

| key | command id | when | echoes | verified |
|---|---|---|---|---|
| `cmd+i` | `workbench.action.chat.open` | (global) | Cursor Agent/Composer | ✅ in-tree |
| `cmd+l` | `workbench.action.chat.toggle` | (global) | Cursor Ask/Chat panel | ✅ in-tree |
| `shift+cmd+l` | `github.copilot.chat.attachSelection` | `editorTextFocus` | Cursor add-selection-to-chat | ✅ in extensions/copilot |
| `cmd+.` | `copilot.claude.agents` | (global) | Cursor mode menu → Ursula's Claude agents | ✅ in extensions/copilot |

> `cmd+k` inline-edit (`inlineChat.start`) IS verified in-tree, BUT `cmd+k` global is a core
> VS Code chord prefix — binding it risks breaking the chord system. RECOMMENDATION: bind
> inline edit to `cmd+i` is already taken by agent; instead leave inline-edit on its existing
> default and do NOT add a `cmd+k` global rebind. If Drey wants the literal Cursor `cmd+k`,
> that's a deliberate, separate decision — flagged, not shipped here.

---

## CATE — `CATE_SETTINGS` (the session-visibility room, Ember theme)

Cate's soul = session status visibility + the warm Ember identity. The theme
(`Ursula Cate`) is already wired and is a faithful Ember theme (accent `#e0683c`). Cate keeps
chrome on purpose. Enrich with git-decoration + a couple of warm-theme-friendly touches and
two SAFE rebindable keys. Do NOT clone Cate's canvas/zoom keys (no VS Code mechanism — would
be dead bindings).

**Settings to add to `CATE_SETTINGS`:**

| setting id | value | echoes | note |
|---|---|---|---|
| `git.decorations.enabled` | `true` | Cate | Cate shows rich git state; theme already defines `gitDecoration.*` colors |
| `editor.renderWhitespace` | `none` | Cate | matches Cate editor panel |
| `breadcrumbs.enabled` | `true` | Cate | Cate keeps breadcrumbs (overrides the `false` it currently sets — intentional, Cate values context) |

**Cate theme hex tweaks (OPTIONAL, in `ursula-cate-color-theme.json`):**
The current theme is already a strong Ember theme using `#e0683c`. Two small, faithful
additions from Cate's real source — additive, won't change existing keys:

| theme color key | suggested value | source | rationale |
|---|---|---|---|
| `activityBarBadge.background` | keep `#e0683c` | — | already correct (Ember badge = Cate await-dot vibe) |
| `terminal.ansiBlue` | `#5f90c4` → keep | — | already matches Cate's `#4a7ab0`-family blue; no change needed |

> VERDICT on theme: the Ursula Cate theme is already tasteful and Ember-correct. RECOMMEND
> NO hex changes — the research's `#4a9eff` is Cate's *default* blue accent, but Drey's
> established identity is the Ember `#e0683c` (per his cate-theme skill). Keep Ember. The one
> authentic Cate detail worth noting is the amber await-pulse `#c08a5a`; that's a runtime
> status-item color, NOT a theme token — it belongs in the (separate) session-status
> status-bar feature, not this theme JSON. Leave the theme as-is.

**Keybindings (new `keybindings` array for CATE_TEMPLATE — currently none):**

| key | command id | echoes | verified |
|---|---|---|---|
| `cmd+t` | `workbench.action.terminal.new` | Cate newTerminal | ✅ in-tree |
| `shift+cmd+a` | `workbench.action.chat.open` | Cate newAgent / Pi | ✅ in-tree |

> Dropped from research: Cate's `cmd+k`-as-palette and `cmd+shift+x`/`cmd+shift+e`/
> `cmd+shift+m` rebinds — they collide with core VS Code (Extensions view, Explorer focus,
> Problems panel) and would degrade the editor. Not worth the breakage for a "feel" match.

---

## LITE — `BASE_LEAN + OPTIMIZER_BLOCK` (the low-resource room)

Lite's job is RAM/VRAM frugality, NOT a tool clone. Keep it lean. The only authentic add is
optionally letting Lite opt into Warp's block-nav (it's a shared literal already) — but that's
a judgment call, and Lite's point is minimalism. **RECOMMENDATION: add nothing to Lite.**
It's already correct and any addition fights its purpose.

| change | verdict |
|---|---|
| add block-nav keys | ❌ skip — Lite is about doing less |
| add scrollback bump | ❌ skip — memory cost |
| (no change) | ✅ Lite stays as-is |

---

## ⚠️ VERIFY IN-TREE BEFORE ADDING (did NOT confirm by grep)

These appeared in the research but were **not found** in this repo. Do NOT add them until a
maintainer confirms the exact id exists, or they'll be dead settings / broken keybindings:

| id | claimed by | status | safe fallback |
|---|---|---|---|
| `inlineChat.acceptChanges` | Cursor (cmd+enter) | ❌ NOT in `src/vs/workbench/contrib/inlineChat` | omit the accept keybinding |
| `inlineChat.discard` | Cursor (cmd+backspace) | ❌ NOT found | omit the discard keybinding |
| `chat.commandCenter.enabled` | Cursor settings | ❌ NOT found in chat contrib | omit |
| `github.copilot.chat.openModelPicker` (as keybinding target) | Cursor | ✅ id exists in extensions/copilot, but its trigger key is uncertain — DON'T rebind a global, leave on default | use existing default |
| `vim.enabled` | Terax | ⚠️ no bundled Vim extension in-tree → dead setting | omit |
| `terminal.ursula.commandBlocks` | (existing in WARP_SETTINGS) | ✅ already shipped — assumed valid custom setting; not re-verified | leave as-is |

The confirmed-in-tree command ids (safe to ship): `workbench.action.terminal.clear`,
`copyLastCommandOutput`, `runRecentCommand`, `focusNextPane`, `focusPreviousPane`, `new`,
`scrollToNextCommand`, `scrollToPreviousCommand`, `workbench.action.toggleMaximizedPanel`,
`workbench.action.chat.open`, `workbench.action.chat.toggle`, `inlineChat.start`,
`copilot.claude.agents`, `github.copilot.chat.attachSelection`,
`github.copilot.chat.openModelPicker`, `github.copilot.chat.copilotCLI.addFileReference`,
`editor.action.toggleMinimap`, `workbench.action.terminal.split`/`splitActiveTab`.

---

## Files the main loop should edit

1. **`src/vs/workbench/contrib/ursulaModes/browser/templates.ts`** — apply all the
   per-mode settings + keybinding additions above by extending the existing literals
   (`BASE_LEAN` for Terax, `WARP_SETTINGS` + a new keybindings entry for `BLOCK_NAV_KEYS`,
   `CURSOR_SETTINGS` + a new `keybindings` on `CURSOR_TEMPLATE`, `CATE_SETTINGS` + a new
   `keybindings` on `CATE_TEMPLATE`). LITE: no change.
2. **`extensions/theme-defaults/themes/ursula-cate-color-theme.json`** — NO change
   recommended (already a faithful Ember theme). Only touch if Drey explicitly wants the
   `#4a9eff` Cate-blue identity instead of Ember.
