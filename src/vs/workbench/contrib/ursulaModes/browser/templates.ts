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
	'editor.minimap.enabled': false,                     // the one deliberate trim vs baseline
	'editor.inlineSuggest.enabled': true,                // Cursor "Tab" inline suggestions
	'github.copilot.nextEditSuggestions.enabled': true,  // Cursor "next edit"
	'chat.agent.enabled': true,                          // Cursor Agent mode
	'editor.tabCompletion': 'on',                        // Tab-to-accept
};

// Cate keeps useful chrome (its soul is session visibility, not minimal chrome).
const CATE_SETTINGS: Record<string, unknown> = {
	'workbench.colorTheme': CATE_THEME_NAME,         // CONTRACT with component B
	'workbench.activityBar.location': 'default',     // KEEP — the Sessions rail lives here
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
	settings: settingsString({ ...BASE_LEAN, ...TERAX_EXTRA }),
};

const WARP_TEMPLATE: IUserDataProfileTemplate = {
	name: MODE_NAME[UrsulaMode.Warp],
	icon: 'terminal',
	settings: settingsString({ ...BASE_LEAN, ...WARP_SETTINGS }),
	keybindings: keybindingsString([...BLOCK_NAV_KEYS, ...WARP_EXTRA_KEYS]),
};

const CURSOR_TEMPLATE: IUserDataProfileTemplate = {
	name: MODE_NAME[UrsulaMode.Cursor],
	icon: 'comment-discussion',
	settings: settingsString(CURSOR_SETTINGS),
	keybindings: keybindingsString(CURSOR_KEYS),
};

const CATE_TEMPLATE: IUserDataProfileTemplate = {
	name: MODE_NAME[UrsulaMode.Cate],
	icon: 'flame',
	settings: settingsString(CATE_SETTINGS),
};

const LITE_TEMPLATE: IUserDataProfileTemplate = {
	name: MODE_NAME[UrsulaMode.Lite],
	icon: 'dashboard',
	settings: settingsString({ ...BASE_LEAN, ...OPTIMIZER_BLOCK }),
};

export const MODE_TEMPLATE: Record<UrsulaMode, IUserDataProfileTemplate> = {
	[UrsulaMode.Terax]: TERAX_TEMPLATE,
	[UrsulaMode.Warp]: WARP_TEMPLATE,
	[UrsulaMode.Cursor]: CURSOR_TEMPLATE,
	[UrsulaMode.Cate]: CATE_TEMPLATE,
	[UrsulaMode.Lite]: LITE_TEMPLATE,
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
