/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataProfileTemplate } from '../../../services/userDataProfile/common/userDataProfile.js';

/**
 * Ursula Modes — the FIVE one-click "rooms", authored as `IUserDataProfileTemplate`
 * literals (settings + keybindings are JSON strings, exactly as the profile machinery
 * consumes them). Modes are DATA, not code: no `globalState`, no `exportProfile` round-trip.
 * Runtime layout transitions (Warp maximize, Cursor chat, Cate rail focus) are run as
 * startup commands by the switcher, NOT authored here.
 *
 * Shared literals (`BASE_LEAN`, `BLOCK_NAV_KEYS`, `OPTIMIZER_BLOCK`) keep the test matrix
 * small: Terax = BASE_LEAN; Warp = BASE_LEAN + warp settings + BLOCK_NAV_KEYS;
 * Cursor inherits the default look + two deltas; Cate keeps useful chrome + the Ember theme;
 * Lite = BASE_LEAN + OPTIMIZER_BLOCK. Every mode sets `useDefaultFlags.extensions = true`
 * at create-time (in the switcher) so all rooms share one installed extension set.
 */

// The five mode names. NEVER name a mode `agents` (collides with AGENTS_WINDOW_PROFILE_ID).
export const enum UrsulaMode {
	Terax = 'terax',
	Warp = 'warp',
	Cursor = 'cursor',
	Cate = 'cate',
	Lite = 'lite',
}

// Display name = the profile name written to disk. Must stay stable (used by the upsert-by-name guard).
export const MODE_NAME: Record<UrsulaMode, string> = {
	[UrsulaMode.Terax]: 'Terax',
	[UrsulaMode.Warp]: 'Warp',
	[UrsulaMode.Cursor]: 'Cursor',
	[UrsulaMode.Cate]: 'Cate',
	[UrsulaMode.Lite]: 'Lite',
};

/**
 * CONTRACT with component B (the Cate color theme): this is the theme's display name
 * (`label` in its `contributes.themes` entry). The Cate template selects it via
 * `workbench.colorTheme`. If component B ships a different label, Cate mode silently
 * falls back to the active theme.
 */
export const CATE_THEME_NAME = 'Ursula Cate';

// ---------------------------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------------------------

/**
 * BASE_LEAN — the minimal-chrome settings block. Terax IS this; Warp and Lite extend it.
 * The two `terminal.integrated.tabs.*` lines give every lean room vertical terminal tabs
 * for free (mirrors the Sessions rail's vertical feel).
 */
const BASE_LEAN: Record<string, unknown> = {
	'workbench.editor.showTabs': 'single',
	'workbench.activityBar.location': 'hidden',
	'workbench.statusBar.visible': true,          // KEEP — RAM Guard pill + mode pill live here. Non-negotiable.
	'window.commandCenter': false,
	'breadcrumbs.enabled': false,
	'editor.minimap.enabled': false,
	'editor.stickyScroll.enabled': false,
	'workbench.layoutControl.enabled': false,
	'workbench.editor.editorActionsLocation': 'hidden',
	'window.menuBarVisibility': 'compact',
	'workbench.tree.renderIndentGuides': 'none',
	'workbench.reduceMotion': 'on',
	'terminal.integrated.shellIntegration.enabled': true,
	'terminal.integrated.stickyScroll.enabled': false,
	'terminal.integrated.gpuAcceleration': 'on',  // Terax assumes a capable machine; LITE tunes this down.
	'terminal.integrated.tabs.enabled': true,      // vertical terminal tabs
	'terminal.integrated.tabs.location': 'left',
};

/**
 * Warp's signature block-nav keybindings — shared literal so it could also be opted into LITE.
 * Cmd+↑ / Cmd+↓ jump between shell commands (OSC 133), terminal-focused only.
 */
const BLOCK_NAV_KEYS: unknown[] = [
	{ key: 'cmd+down', command: 'workbench.action.terminal.scrollToNextCommand', when: 'terminalFocus' },
	{ key: 'cmd+up', command: 'workbench.action.terminal.scrollToPreviousCommand', when: 'terminalFocus' },
];

/**
 * The aggressive RAM/VRAM-saving block for LITE. `terminal.integrated.gpuAcceleration` is the
 * one hardware-dependent value — it is injected at apply-time by `withGpuAcceleration` BEFORE
 * create (defaults to `'off'`, the safe low-VRAM choice, if no hardware reading exists yet).
 */
const OPTIMIZER_BLOCK: Record<string, unknown> = {
	'terminal.integrated.gpuAcceleration': 'off', // placeholder; replaced by withGpuAcceleration at apply-time
	'files.watcherExclude': {
		'**/node_modules/**': true,
		'**/.git/objects/**': true,
		'**/dist/**': true,
		'**/build/**': true,
		'**/.next/**': true,
		'**/out/**': true,
		'**/.cache/**': true,
		'**/vendor/**': true,
	},
	'search.followSymlinks': false,
	'telemetry.telemetryLevel': 'off',
	'workbench.enableExperiments': false,
	'editor.minimap.enabled': false,
	'workbench.reduceMotion': 'on',
	'editor.stickyScroll.enabled': false,
	'editor.minimap.renderCharacters': false,
	'git.decorations.enabled': false,
	'problems.decorations.enabled': false,
	'editor.occurrencesHighlight': 'off',
	'editor.lightbulb.enabled': 'off',
	'extensions.autoCheckUpdates': false,
	'extensions.autoUpdate': false,
};

// Warp's extra settings on top of BASE_LEAN — the gold command bar + exit-code dots + the
// authentic Warp Dark feel (sticky running-command header, block caret, GPU-smooth scroll,
// the real Warp Dark ANSI palette scoped to the terminal only).
const WARP_SETTINGS: Record<string, unknown> = {
	'terminal.ursula.commandBlocks': true,
	'terminal.integrated.shellIntegration.enabled': true,                  // required for blocks + block-nav (restated)
	'terminal.integrated.shellIntegration.decorationsEnabled': 'both',     // gutter dot + overview-ruler tick = the visible block boundary
	'terminal.integrated.stickyScroll.enabled': true,                      // pin the running command header (Warp keeps the cmd visible)
	'terminal.integrated.smoothScrolling': true,                           // echoes Warp's GPU buttery scroll
	'terminal.integrated.cursorStyle': 'block',                            // Warp's editor-style block caret
	'terminal.integrated.cursorBlinking': false,
	// Warp Dark ANSI palette (exact default_dark.yaml). Scoped to colorCustomizations so it only
	// tints the terminal and leaves the active theme intact. Accent #7cafc2 = the signature Warp blue.
	'workbench.colorCustomizations': {
		'terminal.background': '#181818',
		'terminal.foreground': '#d8d8d8',
		'terminalCursor.foreground': '#7cafc2',
		'terminal.ansiBlack': '#181818',
		'terminal.ansiRed': '#ab4642',
		'terminal.ansiGreen': '#a1b56c',
		'terminal.ansiYellow': '#f7ca88',
		'terminal.ansiBlue': '#7cafc2',
		'terminal.ansiMagenta': '#ba8baf',
		'terminal.ansiCyan': '#86c1b9',
		'terminal.ansiWhite': '#d8d8d8',
		'terminal.ansiBrightBlack': '#585858',
		'terminal.ansiBrightRed': '#ab4642',
		'terminal.ansiBrightGreen': '#a1b56c',
		'terminal.ansiBrightYellow': '#f7ca88',
		'terminal.ansiBrightBlue': '#7cafc2',
		'terminal.ansiBrightMagenta': '#ba8baf',
		'terminal.ansiBrightCyan': '#86c1b9',
		'terminal.ansiBrightWhite': '#f8f8f8',
	},
};

// Cursor's deltas — inherit the default look, change only what differs, and switch on the
// Cursor-style AI affordances (Tab autocomplete, next-edit, agent) — all on the BUNDLED agent.
const CURSOR_SETTINGS: Record<string, unknown> = {
	'github.copilot.chat.claudeAgent.enabled': true,    // un-gate the bundled Claude agent (no extension swap)
	'workbench.activityBar.location': 'hidden',          // RESKIN: editor hero; the AI composer is the RIGHT aux bar (Cursor doesn't inherit BASE_LEAN)
	'workbench.statusBar.visible': true,                 // RAM Guard pill + mode pill (Cursor is standalone, not BASE_LEAN)
	'editor.minimap.enabled': false,                     // the one deliberate trim vs baseline
	'editor.inlineSuggest.enabled': true,                // Cursor "Tab" inline suggestions
	'github.copilot.nextEditSuggestions.enabled': true,  // Cursor "next edit"
	'chat.agent.enabled': true,                          // Cursor Agent mode
	'editor.tabCompletion': 'on',                        // Tab-to-accept
};

// Cate keeps useful chrome (its soul is session visibility, not minimal chrome).
const CATE_SETTINGS: Record<string, unknown> = {
	'workbench.colorTheme': CATE_THEME_NAME,         // CONTRACT with component B
	'workbench.activityBar.location': 'hidden',      // RESKIN: rail lives in the right aux bar now; Cate hides the activity bar (mockup)
	'workbench.statusBar.visible': true,             // the rich Claude-session readout lives here
	'editor.minimap.enabled': false,
	'breadcrumbs.enabled': true,                      // Cate values context — keep breadcrumbs on
	'git.decorations.enabled': true,                  // Cate shows rich git state (theme defines gitDecoration.* colors)
	'editor.renderWhitespace': 'none',                // matches Cate's clean editor panel
	'workbench.reduceMotion': 'on',
	'workbench.editor.showTabs': 'multiple',
	'window.menuBarVisibility': 'compact',
	'terminal.integrated.tabs.enabled': true,
	'terminal.integrated.tabs.location': 'left',
};

// Terax-only read-comfort touches (kept OFF the shared BASE_LEAN so they never leak into Lite).
const TERAX_EXTRA: Record<string, unknown> = {
	'terminal.integrated.scrollback': 5000,   // longer history (Terax default)
	'editor.renderWhitespace': 'none',         // clean canvas
	'editor.cursorBlinking': 'solid',          // steady caret
	'workbench.startupEditor': 'none',         // straight into work, no welcome
};

// Warp's terminal-scoped keys (every binding when: terminalFocus → zero editor/global collisions).
const WARP_EXTRA_KEYS: unknown[] = [
	{ key: 'cmd+k', command: 'workbench.action.terminal.clear', when: 'terminalFocus' },
	{ key: 'shift+cmd+c', command: 'workbench.action.terminal.copyLastCommandOutput', when: 'terminalFocus' },
	{ key: 'ctrl+r', command: 'workbench.action.terminal.runRecentCommand', when: 'terminalFocus' },
	{ key: 'cmd+]', command: 'workbench.action.terminal.focusNextPane', when: 'terminalFocus' },
	{ key: 'cmd+[', command: 'workbench.action.terminal.focusPreviousPane', when: 'terminalFocus' },
	{ key: 'shift+cmd+enter', command: 'workbench.action.toggleMaximizedPanel', when: 'terminalFocus' },
];

// Cursor's two iconic AI keys — profile-scoped, so they only remap INSIDE Cursor mode (where the
// user picked Cursor and expects Cursor's bindings), driving the bundled agent. cmd+k inline-edit
// and cmd+. are deliberately NOT rebound (cmd+k = chord prefix; cmd+. = Quick Fix — too valuable).
const CURSOR_KEYS: unknown[] = [
	{ key: 'cmd+l', command: 'workbench.action.chat.toggle' },
	{ key: 'cmd+i', command: 'workbench.action.chat.open' },
];

// ---------------------------------------------------------------------------------------------
// Per-mode RAM right-sizing — each mode trims ONLY what it does NOT use, and KEEPS its hero
// settings (Drey: "Cursor is not going to take more RAM than it needs"). Source-grounded against
// real VS Code setting ids (workflow ursula-reskin-build-ground, 2026-06-21). These are settings
// (profile-scoped) so they persist + revert on Default and never touch another mode.
// ---------------------------------------------------------------------------------------------

// WARP — terminal-forward: editor is minimized, so trim EDITOR + TS-server weight. NEVER trim
// terminal shellIntegration/gpuAcceleration/stickyScroll — Warp's gold blocks + buttery scroll need them.
const WARP_RAM: Record<string, unknown> = {
	'editor.largeFileOptimizations': true,
	'editor.maxTokenizationLineLength': 2000,
	'editor.semanticHighlighting.enabled': false,
	'editor.experimental.asyncTokenization': true,
	'editor.codeLens': false,
	'editor.inlayHints.enabled': 'off',
	'editor.colorDecorators': false,
	'editor.bracketPairColorization.enabled': false,
	'editor.occurrencesHighlight': 'off',
	'typescript.tsserver.useSyntaxServer': 'auto',
	'typescript.disableAutomaticTypeAcquisition': true,
	'typescript.tsserver.maxTsServerMemory': 1536,
	'telemetry.telemetryLevel': 'off',
	'workbench.enableExperiments': false,
	'extensions.autoCheckUpdates': false,
	'extensions.autoUpdate': false,
};

// CURSOR — editor+AI hero: trim ALL terminal weight (it isn't a Cursor feature). KEEP every
// editor/index/AI setting — the index + composer ARE the product here.
const CURSOR_RAM: Record<string, unknown> = {
	'terminal.integrated.gpuAcceleration': 'off',
	'terminal.integrated.scrollback': 1000,
	'terminal.integrated.enablePersistentSessions': false,
	'terminal.integrated.persistentSessionScrollback': 100,
	'terminal.integrated.shellIntegration.enabled': false,
	'editor.codeLens': false,
	'telemetry.telemetryLevel': 'off',
	'workbench.enableExperiments': false,
	'extensions.autoCheckUpdates': false,
	'extensions.autoUpdate': false,
};

// TERAX — bare/terminal-forward: aggressive editor + TS trims (editor is minimized). KEEP a
// readable editor where it matters — hover + TS validate stay ON so it never reads as "broken".
const TERAX_RAM: Record<string, unknown> = {
	'editor.largeFileOptimizations': true,
	'editor.maxTokenizationLineLength': 1000,
	'editor.semanticHighlighting.enabled': false,
	'editor.codeLens': false,
	'editor.inlayHints.enabled': 'off',
	'editor.colorDecorators': false,
	'editor.bracketPairColorization.enabled': false,
	'editor.guides.bracketPairs': false,
	'editor.occurrencesHighlight': 'off',
	'editor.lightbulb.enabled': 'off',
	'editor.wordBasedSuggestions': 'off',
	'editor.folding': false,
	'typescript.tsserver.useSyntaxServer': 'auto',
	'typescript.disableAutomaticTypeAcquisition': true,
	'typescript.tsserver.maxTsServerMemory': 1024,
	'git.decorations.enabled': false,
	'problems.decorations.enabled': false,
	'telemetry.telemetryLevel': 'off',
	'workbench.enableExperiments': false,
	'extensions.autoCheckUpdates': false,
	'extensions.autoUpdate': false,
};

// CATE — sessions, balanced: terminal isn't its feature, so idle-pty trims; KEEP its rich chrome
// (activity-less rail in aux, git/breadcrumb decorations, theme, shellIntegration for resume-in-terminal).
const CATE_RAM: Record<string, unknown> = {
	'terminal.integrated.enablePersistentSessions': false,
	'terminal.integrated.persistentSessionScrollback': 100,
	'terminal.integrated.scrollback': 1500,
	'terminal.integrated.gpuAcceleration': 'off',
	'editor.largeFileOptimizations': true,
	'editor.maxTokenizationLineLength': 4000,
	'editor.codeLens': false,
	'telemetry.telemetryLevel': 'off',
	'workbench.enableExperiments': false,
	'extensions.autoCheckUpdates': false,
	'extensions.autoUpdate': false,
};

// LITE — the hero perf room: stacks the hardest trims ON TOP of OPTIMIZER_BLOCK. Does NOT set
// gpuAcceleration (withGpuAcceleration injects the hardware-tuned value at apply-time).
const LITE_RAM: Record<string, unknown> = {
	'terminal.integrated.scrollback': 1000,
	'terminal.integrated.enablePersistentSessions': false,
	'terminal.integrated.persistentSessionScrollback': 50,
	'terminal.integrated.shellIntegration.enabled': false,
	'editor.largeFileOptimizations': true,
	'editor.maxTokenizationLineLength': 800,
	'editor.semanticHighlighting.enabled': false,
	'editor.codeLens': false,
	'editor.inlayHints.enabled': 'off',
	'editor.colorDecorators': false,
	'editor.bracketPairColorization.enabled': false,
	'editor.guides.bracketPairs': false,
	'editor.occurrencesHighlight': 'off',
	'editor.folding': false,
	'editor.wordBasedSuggestions': 'off',
	'typescript.tsserver.useSyntaxServer': 'always',
	'typescript.disableAutomaticTypeAcquisition': true,
	'typescript.tsserver.maxTsServerMemory': 768,
	'search.searchOnType': false,
	'workbench.editor.enablePreview': true,
	'workbench.editor.limit.enabled': true,
	'workbench.editor.limit.value': 6,
};

// ---------------------------------------------------------------------------------------------
// The five templates
// ---------------------------------------------------------------------------------------------

// Helper: serialize a settings object to the JSON string the template expects.
function settingsString(obj: Record<string, unknown>): string {
	return JSON.stringify(obj, undefined, 2);
}
function keybindingsString(arr: unknown[]): string {
	return JSON.stringify(arr, undefined, 2);
}

const TERAX_TEMPLATE: IUserDataProfileTemplate = {
	name: MODE_NAME[UrsulaMode.Terax],
	icon: 'rocket',
	settings: settingsString({ ...BASE_LEAN, ...TERAX_EXTRA, ...TERAX_RAM }),
};

const WARP_TEMPLATE: IUserDataProfileTemplate = {
	name: MODE_NAME[UrsulaMode.Warp],
	icon: 'terminal',
	settings: settingsString({ ...BASE_LEAN, ...WARP_SETTINGS, ...WARP_RAM }),
	keybindings: keybindingsString([...BLOCK_NAV_KEYS, ...WARP_EXTRA_KEYS]),
};

const CURSOR_TEMPLATE: IUserDataProfileTemplate = {
	name: MODE_NAME[UrsulaMode.Cursor],
	icon: 'comment-discussion',
	settings: settingsString({ ...CURSOR_SETTINGS, ...CURSOR_RAM }),
	keybindings: keybindingsString(CURSOR_KEYS),
};

const CATE_TEMPLATE: IUserDataProfileTemplate = {
	name: MODE_NAME[UrsulaMode.Cate],
	icon: 'flame',
	settings: settingsString({ ...CATE_SETTINGS, ...CATE_RAM }),
};

const LITE_TEMPLATE: IUserDataProfileTemplate = {
	name: MODE_NAME[UrsulaMode.Lite],
	icon: 'dashboard',
	settings: settingsString({ ...BASE_LEAN, ...OPTIMIZER_BLOCK, ...LITE_RAM }),
};

export const MODE_TEMPLATE: Record<UrsulaMode, IUserDataProfileTemplate> = {
	[UrsulaMode.Terax]: TERAX_TEMPLATE,
	[UrsulaMode.Warp]: WARP_TEMPLATE,
	[UrsulaMode.Cursor]: CURSOR_TEMPLATE,
	[UrsulaMode.Cate]: CATE_TEMPLATE,
	[UrsulaMode.Lite]: LITE_TEMPLATE,
};

// ---------------------------------------------------------------------------------------------
// Per-mode SKIN CSS — Mechanism A (the live reskin)
// ---------------------------------------------------------------------------------------------

/**
 * MODE_CSS — the per-mode stylesheet body that the contribution swaps into ONE persistent
 * `<style class="ursula-mode-css">` element whenever the mode changes. Modes are DATA: the
 * look lives here next to MODE_TEMPLATE, never in the contribution code.
 *
 * CONTRACT: every rule MUST be scoped under `.monaco-workbench.ursula-mode-<name>` so that
 * removing the class fully reverts the window (Default profile = no class = no skin). The
 * contribution adds `ursula-mode-warp` (etc.) to `layoutService.mainContainer` and sets this
 * string as the style element's `textContent`.
 *
 * Split of duties (see RESKIN-PLAN Part 2): startup COMMANDS own layout GEOMETRY (panel
 * maximize, sidebar side) because they survive the grid recompute; CSS here owns SKIN only
 * (recolor / hide / header chrome). `!important` is used where a part carries inline
 * grid-measured styles that a plain rule would lose to.
 *
 * All five are filled and source-verified (see the block comment below). Default / unknown
 * profiles map to no class -> empty textContent -> no skin (safe fallback).
 */

// Per-mode skin CSS bodies. Selectors source-verified against the live VS Code DOM in
// src/vs (workflow ursula-mode-css-ground, 2026-06-20): Warp's guessed selectors fixed,
// Cate / Terax / Cursor / Lite authored. CSS = skin only (recolor/hide/header); layout
// geometry stays in the switcher startup commands. Every rule scoped under
// .monaco-workbench.ursula-mode-<name> so Default (no class) = no skin.

const WARP_CSS = `/* ---- Warp skin: terminal-forward, gold command-bar header, warm-dark chrome ---- */
/* Every rule scoped under .monaco-workbench.ursula-mode-warp so removing the class fully reverts. */

/* Warm-dark panel shell so the bottom panel reads like a Warp window.
   .part.panel = panelpart.css:6 */
.monaco-workbench.ursula-mode-warp .part.panel {
	background-color: #161616 !important;
	border-top: 1px solid #2a2520 !important;
}

/* The panel TITLE row = the "gold command bar". createTitleArea() appends $('.composite')
   then classList.add('title') -> the element is .composite.title, and panelpart.css:11
   confirms \`.part.panel.bottom .composite.title\`. Turn it into Warp's gold strip. */
.monaco-workbench.ursula-mode-warp .part.panel > .composite.title {
	background: linear-gradient(180deg, #1d1a14 0%, #161310 100%) !important;
	border-top: 2px solid #C2A878 !important;
	box-shadow: inset 0 1px 0 0 rgba(194, 168, 120, 0.18);
}

/* Active panel tab (e.g. TERMINAL) painted gold. REAL DOM chain from panelpart.css:60:
   .part.panel > .title > .composite-bar-container > .composite-bar > .monaco-action-bar
   .action-item.checked .action-label  (the fake \`.panel-switcher-container\` is removed). */
.monaco-workbench.ursula-mode-warp .part.panel > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked .action-label {
	color: #C2A878 !important;
}
/* The active-tab underline is its own element (compositeBarActions.ts:281 appends
   $('.active-item-indicator')), not a border on the label. Paint it gold. */
.monaco-workbench.ursula-mode-warp .part.panel > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item.checked .active-item-indicator::before {
	border-top-color: #C2A878 !important;
	border-bottom-color: #C2A878 !important;
}
/* Inactive tab labels: warm muted, not stock grey. */
.monaco-workbench.ursula-mode-warp .part.panel > .title > .composite-bar-container > .composite-bar > .monaco-action-bar .action-item:not(.checked) .action-label {
	color: #b8ab97 !important;
}

/* Signature Warp blue on the panel title text. The title-label is $('.title-label')
   with a child <h2> (compositePart.ts:438-439); paneCompositePart has hasTitle:true
   (panelPart.ts:88) so it is rendered. */
.monaco-workbench.ursula-mode-warp .part.panel > .composite.title .title-label,
.monaco-workbench.ursula-mode-warp .part.panel > .composite.title .title-label > h2 {
	color: #7cafc2 !important;
	letter-spacing: 0.04em;
}

/* Terminal surface: warm-dark, terminal-forward. Real containers live UNDER
   .pane-body.integrated-terminal (terminal.css:22 outer-container, :69 wrapper).
   Bare \`.integrated-terminal\` / \`.terminal-wrapper\` without that ancestor was wrong. */
.monaco-workbench.ursula-mode-warp .part.panel .pane-body.integrated-terminal,
.monaco-workbench.ursula-mode-warp .part.panel .pane-body.integrated-terminal .terminal-outer-container,
.monaco-workbench.ursula-mode-warp .part.panel .pane-body.integrated-terminal .terminal-wrapper {
	background-color: #181818 !important;
}

/* Exit-code DOTS — shell-integration gutter decorations.
   GROUND TRUTH (decorationStyles.ts:20-25 + decorationAddon.ts:374): the element is
   \`.terminal-command-decoration.codicon.xterm-decoration\` and is a CODICON GLYPH colored
   via \`color:\` (terminal.css:544-552), NOT a background box. Status classes actually applied
   (decorationStyles.ts:195-205): success = base class only (no \`.successful-command\`);
   error = \`.error\`; running/unknown = \`.default-color.default\`. The ancestor is \`.terminal\`,
   not the panel root. So we recolor the GLYPH. The fake \`.successful-command\`,
   \`.error-command\`, \`.codicon-circle-filled\`, \`.codicon-error\` are all removed. */
.monaco-workbench.ursula-mode-warp .part.panel .terminal .terminal-command-decoration {
	color: #a1b56c !important;   /* exit 0 = green dot (base class = success) */
}
.monaco-workbench.ursula-mode-warp .part.panel .terminal .terminal-command-decoration.error {
	color: #ab4642 !important;   /* exit !=0 = red dot */
}
.monaco-workbench.ursula-mode-warp .part.panel .terminal .terminal-command-decoration.default {
	color: #C2A878 !important;   /* running / pending = warm gold dot */
}

/* Sticky running-command header painted as Warp's pinned gold block.
   .terminal-sticky-scroll is real: terminalStickyScrollOverlay.ts:393 $('.terminal-sticky-scroll')
   + stickyScroll.css:6. */
.monaco-workbench.ursula-mode-warp .part.panel .terminal-sticky-scroll {
	background-color: #1d1a14 !important;
	border-left: 2px solid #C2A878 !important;
	color: #e7dcc6 !important;
}

/* Editor canvas warmed off the cold VS Code blue-grey.
   .part.editor > .content is real: editorPart.ts:153 \`$('.content')\`,
   used as \`.part.editor > .content\` in breadcrumbscontrol.css:10. */
.monaco-workbench.ursula-mode-warp .part.editor > .content {
	background-color: #1a1815 !important;
}

/* Status bar tinted warm-dark (mode pill + RAM Guard pill stay — NEVER hidden).
   .part.statusbar is real: statusbarpart.css:6. */
.monaco-workbench.ursula-mode-warp .part.statusbar {
	background-color: #161310 !important;
	color: #cbbfa6 !important;
}`;

const CATE_CSS = `/* ============================================================================
   Cate skin — warm near-black "session rail" + ember-orange accent.
   Cate's soul = session visibility, so the activity bar + side bar STAY and get
   skinned into a warm rail. Gold #C2A878 is the shared Ursula accent; Cate adds
   ember orange #e0683c (the flame / agent-rgb accent) on active/selected state.
   Palette: #141210 warm near-black, #19120e darker rail, #e0683c ember,
            #C2A878 gold, #d8cfc2 warm foreground, #b09f8c muted.
   SKIN ONLY — no geometry. Backgrounds use !important to beat inline grid styles
   and theme-injected color rules; accents use !important to beat the theme's
   non-important injected border/color rules (listWidget.ts / theming participant).
   ============================================================================ */

/* ---- Activity bar = warm session rail (KEPT, recolored) ---- */
/* .part.activitybar: part.classList.add('part', ...classes) at workbench.ts:372,
   classes carry partContainerClass 'activitybar' (activitybarPart.ts:143). */
.monaco-workbench.ursula-mode-cate .part.activitybar {
	background-color: #19120e !important;
	border-right: 1px solid #2a201a !important;
}

/* Active (checked) activity item's left accent bar -> ember orange.
   The theme injects this EXACT selector with NON-important border-left-color
   (activitybarPart.ts:647), so !important here wins. */
.monaco-workbench.ursula-mode-cate .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .active-item-indicator:before {
	border-left-color: #e0683c !important;
}
/* Focused-active accent ember (theme injects at activitybarPart.ts:660). */
.monaco-workbench.ursula-mode-cate .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:focus .active-item-indicator:before {
	border-left-color: #e0683c !important;
}
/* Active item tile background warmed (.active-item-indicator box; injected target
   at activitybarPart.ts:670; element created compositeBarActions.ts:281). */
.monaco-workbench.ursula-mode-cate .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .active-item-indicator {
	background-color: rgba(224, 104, 60, 0.12) !important;
}
/* Active icon glyph itself -> gold (.action-label::before; theme injects the
   .checked/.active variants at activitybarPart.ts:685-687; label className set
   to 'action-label' at compositeBarActions.ts:394). */
.monaco-workbench.ursula-mode-cate .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .action-label::before,
.monaco-workbench.ursula-mode-cate .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active .action-label::before {
	color: #C2A878 !important;
}

/* Activity item badge -> ember (.badge created compositeBarActions.ts:277,
   .badge-content at :278). */
.monaco-workbench.ursula-mode-cate .activitybar .badge .badge-content {
	background-color: #e0683c !important;
	color: #141210 !important;
}

/* ---- Side bar = warm rail body ---- */
/* .part.sidebar: partContainerClass 'sidebar' (sidebarPart.ts:199) added via
   workbench.ts:372. */
.monaco-workbench.ursula-mode-cate .part.sidebar {
	background-color: #141210 !important;
	border-right: 1px solid #2a201a !important;
}

/* Side bar composite header (.composite at compositePart.ts:411, 'title' class
   added at :412 -> .composite.title) warmed, with a thin gold top edge. */
.monaco-workbench.ursula-mode-cate .part.sidebar > .composite.title {
	background-color: #19120e !important;
	border-bottom: 1px solid #2a201a !important;
	box-shadow: inset 0 1px 0 0 rgba(194, 168, 120, 0.14);
}

/* Side bar TITLE text (.title-label at compositePart.ts:438, h2 at :439) -> gold. */
.monaco-workbench.ursula-mode-cate .part.sidebar > .composite.title .title-label,
.monaco-workbench.ursula-mode-cate .part.sidebar > .composite.title .title-label h2 {
	color: #C2A878 !important;
	letter-spacing: 0.05em;
}

/* ---- Tree / list row focus + selection in the rail ---- */
/* .monaco-list-row at list.css:34; focus/selection BACKGROUND is theme-owned
   (listWidget.ts injects \`.monaco-list:focus .monaco-list-row.focused {...}\`),
   so the Cate color theme handles fill. We add an ember LEFT BORDER (box-shadow)
   the injected rule never sets -> free territory, no !important fight. */
.monaco-workbench.ursula-mode-cate .part.sidebar .monaco-list .monaco-list-row.focused {
	box-shadow: inset 2px 0 0 0 #e0683c;
}
.monaco-workbench.ursula-mode-cate .part.sidebar .monaco-list .monaco-list-row.selected {
	box-shadow: inset 2px 0 0 0 rgba(224, 104, 60, 0.55);
}

/* ---- Editor tabs: thin ember active-tab underline ---- */
/* Real selectors: multiEditorTabsControl.css:117 (active tab) and :120
   (active-group active tab). Theme owns the tab background. */
.monaco-workbench.ursula-mode-cate .part.editor > .content .editor-group-container > .title .tabs-container > .tab.active {
	border-bottom: 2px solid #e0683c !important;
}
.monaco-workbench.ursula-mode-cate .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab.active {
	border-bottom: 2px solid #e0683c !important;
}

/* ---- Editor canvas: warm near-black so the window leaves cold VS Code grey ---- */
/* .part.editor > .content is the editor canvas wrapper (prefix of every
   multiEditorTabsControl.css rule, e.g. :117). */
.monaco-workbench.ursula-mode-cate .part.editor > .content {
	background-color: #141210 !important;
}

/* ---- Status bar: warm near-black, ember flame accent on the left ---- */
/* NEVER hidden (mode pill + RAM Guard live here) — recolor only.
   .part.statusbar at statusbarpart.css:6. */
.monaco-workbench.ursula-mode-cate .part.statusbar {
	background-color: #19120e !important;
	color: #d8cfc2 !important;
}
/* Ember flame accent on the FIRST left status item
   (.statusbar-item.left.first-visible-item, statusbarpart.css:87). */
.monaco-workbench.ursula-mode-cate .part.statusbar > .items-container > .statusbar-item.left.first-visible-item {
	color: #e0683c !important;
	box-shadow: inset 3px 0 0 0 #e0683c;
}
/* Remaining left items read warm gold (.left-items, statusbarpart.css:44/54). */
.monaco-workbench.ursula-mode-cate .part.statusbar > .left-items {
	color: #C2A878 !important;
}`;

const TERAX_CSS = `/* ---- Terax skin: the barest room. Flat near-black monochrome, one gold hairline. ---- */
/* Skin only — recolor + neutralize decorative chrome. No geometry. Every rule scoped to
   .monaco-workbench.ursula-mode-terax so removing the class fully reverts the window. */

/* Editor canvas wrapper — flat near-black so the editor part stops reading as the cold
   VS Code blue-grey IDE shell. The .content wrapper is the editor part's outer container
   (editorPart.ts:153 $('.content')); the active color theme still paints the code inside. */
.monaco-workbench.ursula-mode-terax .part.editor > .content {
	background-color: #0c0c0c !important;
}

/* Editor tab header (the .title row, editorGroupView.ts:211) — flat dark, no shadow,
   so the single tab bar disappears into the canvas instead of looking like a chrome strip. */
.monaco-workbench.ursula-mode-terax .part.editor > .content .editor-group-container > .title {
	background-color: #0c0c0c !important;
	box-shadow: none !important;
	border-bottom: none !important;
}

/* Kill the decorative bottom hairline VS Code draws under the tab bar
   (multiEditorTabsControl.ts:1519 adds .tabs-border-bottom + --tabs-border-bottom-color). */
.monaco-workbench.ursula-mode-terax .part.editor > .content .editor-group-container > .title > .tabs-and-actions-container.tabs-border-bottom {
	border-bottom: none !important;
}

/* Single-tab label row (showTabs:single → singleEditorTabsControl.ts:49 .label-container):
   flat, calm, no tint. */
.monaco-workbench.ursula-mode-terax .part.editor > .content .editor-group-container > .title .label-container {
	background-color: transparent !important;
}

/* Bottom panel (.part.panel, workbench.ts:352) — same flat near-black canvas,
   one quiet top divider so the terminal reads as a bare surface, not a panel with chrome. */
.monaco-workbench.ursula-mode-terax .part.panel {
	background-color: #0c0c0c !important;
	border-top: 1px solid #171717 !important;
}

/* Panel composite header (TERMINAL/PROBLEMS/OUTPUT tab row, compositePart.ts:411-412
   $('.composite')+.title; panelpart.css:11 uses .part.panel.bottom .composite.title):
   flat dark, monochrome label, no accent — the calm bare-terminal feel. */
.monaco-workbench.ursula-mode-terax .part.panel > .composite.title {
	background-color: #0c0c0c !important;
	border-top: none !important;
	box-shadow: none !important;
}
.monaco-workbench.ursula-mode-terax .part.panel > .composite.title .title-label,
.monaco-workbench.ursula-mode-terax .part.panel > .composite.title .title-label h2 {
	color: #8a8a8a !important;
	letter-spacing: 0.02em;
}

/* Side bar (if visible) — flat near-black. .sidebar.part.pane-composite-part
   (paneCompositePart.ts:243) + its composite header (sidebarpart.css:120). */
.monaco-workbench.ursula-mode-terax .part.sidebar.pane-composite-part {
	background-color: #0c0c0c !important;
}
.monaco-workbench.ursula-mode-terax .part.sidebar.pane-composite-part > .composite.title {
	background-color: #0c0c0c !important;
	box-shadow: none !important;
}
.monaco-workbench.ursula-mode-terax .part.sidebar.pane-composite-part > .composite.title .title-label {
	color: #8a8a8a !important;
}

/* Status bar — NEVER hidden (mode pill + RAM Guard live here, statusbarPart.ts).
   Flat near-black + the ONE accent in Terax: a single 1px gold #C2A878 hairline top edge. */
.monaco-workbench.ursula-mode-terax .part.statusbar {
	background-color: #0c0c0c !important;
	color: #9a9a9a !important;
	border-top: 1px solid #C2A878 !important;
}
/* Status bar item glyphs/text monochrome so nothing in the bar reads VS Code blue
   (statusbarPart.ts:699 ships .part.statusbar > .items-container > .statusbar-item a). */
.monaco-workbench.ursula-mode-terax .part.statusbar > .items-container > .statusbar-item a,
.monaco-workbench.ursula-mode-terax .part.statusbar > .left-items > .statusbar-item a,
.monaco-workbench.ursula-mode-terax .part.statusbar > .right-items > .statusbar-item a {
	color: #9a9a9a !important;
}

/* Sash hover tint — strip the residual blue accent that flashes on drag handles
   (sash.css:118-119 .monaco-sash.hover:before / .active:before paints var sash-hoverBorder).
   Terax has almost no accent, so make the hover a quiet monochrome grey. */
.monaco-workbench.ursula-mode-terax .monaco-sash.hover:before,
.monaco-workbench.ursula-mode-terax .monaco-sash.active:before {
	background: #2a2a2a !important;
}`;

const CURSOR_CSS = `/* ---- Cursor skin: AI-fork look — desaturated near-black, the RIGHT-hand AI panel is the hero ---- */

/* Editor canvas: flat charcoal so the editor reads as a neutral workspace, not the focus.
   .part.editor > .content is the editor part's content area ($('.content') in editorPart.ts:153). */
.monaco-workbench.ursula-mode-cursor .part.editor > .content {
	background-color: #141414 !important;
}

/* ── THE HERO: the auxiliary bar (right secondary side bar) = Cursor's AI/chat panel ──
   The part container carries an inline backgroundColor from updateStyles() (auxiliaryBarPart.ts:185),
   so the skin background MUST use !important to win. Distinct near-black + a subtle gold LEFT accent
   edge (inset box-shadow, not a layout-affecting border) so it reads as a separate, focused panel. */
.monaco-workbench.ursula-mode-cursor .part.auxiliarybar {
	background-color: #0d0d0d !important;
	box-shadow: inset 3px 0 0 0 rgba(194, 168, 120, 0.55), inset -1px 0 0 0 #000 !important;
}

/* The AI panel's title row (TERMINAL/PROBLEMS-style title bar — here the AI/chat container header).
   titleArea = $('.composite') + .add('title') (compositePart.ts:411-412) → .composite.title. */
.monaco-workbench.ursula-mode-cursor .part.auxiliarybar > .composite.title {
	background: linear-gradient(180deg, #131110 0%, #0d0d0d 100%) !important;
	border-bottom: 1px solid #221d16 !important;
}

/* The AI panel title text (title-label > h2). h2 color is set inline (compositePart.ts:454),
   so a restrained gold needs !important. This is the only loud accent — keeps it "hero". */
.monaco-workbench.ursula-mode-cursor .part.auxiliarybar > .composite.title > .title-label,
.monaco-workbench.ursula-mode-cursor .part.auxiliarybar > .composite.title > .title-label h2 {
	color: #C2A878 !important;
	letter-spacing: 0.04em;
}

/* The chat/view body inside the AI panel: any embedded monaco-editor surfaces (chat input,
   rendered code blocks) sit on the same near-black so the panel reads as one dark slab.
   Confirmed selector shape in auxiliaryBarPart.css:11-13 (.part.auxiliarybar > .content .monaco-editor*). */
.monaco-workbench.ursula-mode-cursor .part.auxiliarybar > .content {
	background-color: #0d0d0d !important;
}
.monaco-workbench.ursula-mode-cursor .part.auxiliarybar > .content .monaco-editor,
.monaco-workbench.ursula-mode-cursor .part.auxiliarybar > .content .monaco-editor .margin,
.monaco-workbench.ursula-mode-cursor .part.auxiliarybar > .content .monaco-editor .monaco-editor-background {
	background-color: #0d0d0d !important;
}

/* Active composite tab in the AI panel's composite-bar painted gold so the focused view reads Cursor-ish.
   .composite-bar-container > .composite-bar action-items confirmed in auxiliaryBarPart.css:37,89-92. */
.monaco-workbench.ursula-mode-cursor .part.auxiliarybar > .composite.title .monaco-action-bar .action-item.checked .action-label {
	color: #C2A878 !important;
}
.monaco-workbench.ursula-mode-cursor .part.auxiliarybar > .composite.title .monaco-action-bar .action-item .action-label {
	color: #8a8278;
}

/* Status bar: flat charcoal to match the editor. NEVER hidden (mode pill + RAM Guard live here);
   only recolored. .part.statusbar confirmed at statusbarpart.css:6 + statusbarPart.ts:751. */
.monaco-workbench.ursula-mode-cursor .part.statusbar {
	background-color: #0d0d0d !important;
	color: #9a9286 !important;
}`;

const LITE_CSS = `/* ---- Lite skin: featherweight optimizer room. FLAT near-black recolor only.
       NO gradients / NO box-shadows / NO transitions / NO animation — every one of
       those costs paint, and PERF is the whole point of this room. Smallest rule set
       that still stops the window looking like stock VS Code. ---- */

/* Editor canvas: flat near-black behind the editor groups (the part container, NOT the
   theme-driven token colors inside the code view — so we don't fight the active theme). */
.monaco-workbench.ursula-mode-lite .part.editor > .content {
	background-color: #0c0c0c !important;
}

/* Bottom panel: same flat near-black so the terminal/problems area matches the canvas. */
.monaco-workbench.ursula-mode-lite .part.panel {
	background-color: #0c0c0c !important;
	border-top: 1px solid #1c1c1c !important;
}

/* Panel content area flat too (one rule, no inner restyle). */
.monaco-workbench.ursula-mode-lite .part.panel > .content {
	background-color: #0c0c0c !important;
}

/* Status bar: KEEP it (mode pill + RAM Guard live here). Recolor near-black with the
   single flat gold accent — one solid top border, no glow, no gradient. */
.monaco-workbench.ursula-mode-lite .part.statusbar {
	background-color: #0a0a0a !important;
	color: #C2A878 !important;
	border-top: 1px solid #C2A878 !important;
}`;

export const MODE_CSS: Record<UrsulaMode, string> = {
	[UrsulaMode.Terax]: TERAX_CSS,
	[UrsulaMode.Warp]: WARP_CSS,
	[UrsulaMode.Cursor]: CURSOR_CSS,
	[UrsulaMode.Cate]: CATE_CSS,
	[UrsulaMode.Lite]: LITE_CSS,
};

/**
 * Reverse of MODE_NAME: profile name (as written to disk) -> UrsulaMode. Used by
 * `applyModeCss` to map the active profile back to a mode so it can pick the skin class +
 * MODE_CSS body. Names that aren't a mode (e.g. "Default", "Agents") are simply absent,
 * which the contribution treats as "no skin".
 */
export const MODE_BY_NAME: Record<string, UrsulaMode> = {
	[MODE_NAME[UrsulaMode.Terax]]: UrsulaMode.Terax,
	[MODE_NAME[UrsulaMode.Warp]]: UrsulaMode.Warp,
	[MODE_NAME[UrsulaMode.Cursor]]: UrsulaMode.Cursor,
	[MODE_NAME[UrsulaMode.Cate]]: UrsulaMode.Cate,
	[MODE_NAME[UrsulaMode.Lite]]: UrsulaMode.Lite,
};

// ---------------------------------------------------------------------------------------------
// Per-mode LAYOUT — Mechanism B (the genuine restructure). DATA, not code: the contribution's
// applyModeLayout() reads this and drives layoutService.setPartHidden / toggleMaximizedPanel /
// setSize deterministically. Part visibility is per-WORKSPACE runtime state (NOT a profile
// setting), so the contribution re-asserts this on a reload-proof path, guarded so it only fires
// on a real mode CHANGE (never clobbering a customization made inside a mode).
// `sidebar`/`auxbar`: show|hide the primary/secondary side bars. `panel`: hide | show (visible,
// un-maximized) | maximize (terminal full-bleed; the maximize hides the editor internally).
// `focusSessions`/`openChat`: extension-contributed extras, fired after the ext host re-registers.
// ---------------------------------------------------------------------------------------------
export interface IModeLayout {
	readonly sidebar: 'show' | 'hide';
	readonly auxbar: 'show' | 'hide';
	readonly panel: 'show' | 'hide' | 'maximize';
	readonly focusSessions?: boolean;   // Cate — reveal the Sessions rail (lives in the aux bar)
	readonly openChat?: boolean;        // Cursor — open the AI composer to the side
	readonly auxWidth?: number;         // Cursor — widen the aux bar so the composer is the hero
}

// Default profile = baseline VS Code: side bar shown, panel visible (not maximized), aux hidden.
// Applied only when LEAVING a mode (so it restores), never forced over a fresh window's own layout.
export const DEFAULT_LAYOUT: IModeLayout = { sidebar: 'show', auxbar: 'hide', panel: 'show' };

export const MODE_LAYOUT: Record<UrsulaMode, IModeLayout> = {
	// terminal-forward: no side bars, terminal fills the window.
	[UrsulaMode.Warp]: { sidebar: 'hide', auxbar: 'hide', panel: 'maximize' },
	// bare: same strip as Warp, terminal full-bleed; the CSS makes it the quietest room.
	[UrsulaMode.Terax]: { sidebar: 'hide', auxbar: 'hide', panel: 'maximize' },
	// sessions: LEFT side bar = the Sessions rail (focused), RIGHT aux bar = AI chat, editor center.
	[UrsulaMode.Cate]: { sidebar: 'show', auxbar: 'show', panel: 'show', focusSessions: true },
	// editor hero: no primary side bar, editor center, RIGHT aux bar shown + widened for the AI composer.
	[UrsulaMode.Cursor]: { sidebar: 'hide', auxbar: 'show', panel: 'show', openChat: true, auxWidth: 480 },
	// stripped: editor + status bar only.
	[UrsulaMode.Lite]: { sidebar: 'hide', auxbar: 'hide', panel: 'hide' },
};

/**
 * Inject the hardware-tuned `terminal.integrated.gpuAcceleration` value into LITE's settings
 * string BEFORE `createProfileFromTemplate`. Parses the settings JSON, overwrites the one key,
 * re-serializes. Safe on any template; only LITE is ever passed here.
 */
export function withGpuAcceleration(template: IUserDataProfileTemplate, value: 'off' | 'auto'): IUserDataProfileTemplate {
	if (!template.settings) {
		return template;
	}
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(template.settings) as Record<string, unknown>;
	} catch {
		return template; // never block a switch on a serialization edge case
	}
	parsed['terminal.integrated.gpuAcceleration'] = value;
	return { ...template, settings: settingsString(parsed) };
}
