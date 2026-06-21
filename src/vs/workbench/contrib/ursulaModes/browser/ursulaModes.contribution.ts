/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { $, append, addDisposableListener, clearNode } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { createStyleSheet } from '../../../../base/browser/domStylesheets.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { AGENTS_WINDOW_PROFILE_ID, IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { DEFAULT_LAYOUT, IModeLayout, MODE_BY_NAME, MODE_CSS, MODE_LAYOUT, MODE_NAME, MODE_TEMPLATE, UrsulaMode, withGpuAcceleration } from './templates.js';
import './media/ursulaModeBar.css';

// Command ids — palette-searchable + keybindable. Stable contract.
const CMD_SWITCH = 'ursula.mode.switch';
const CMD_TERAX = 'ursula.mode.terax';
const CMD_WARP = 'ursula.mode.warp';
const CMD_CURSOR = 'ursula.mode.cursor';
const CMD_CATE = 'ursula.mode.cate';
const CMD_LITE = 'ursula.mode.lite';

// Feel-lines for the QuickPick + toasts.
const MODE_FEEL: Record<UrsulaMode, string> = {
	[UrsulaMode.Terax]: localize('ursula.feel.terax', "small, fast, good"),
	[UrsulaMode.Warp]: localize('ursula.feel.warp', "maximized terminal + gold blocks"),
	[UrsulaMode.Cursor]: localize('ursula.feel.cursor', "AI on your right"),
	[UrsulaMode.Cate]: localize('ursula.feel.cate', "your sessions, front and center"),
	[UrsulaMode.Lite]: localize('ursula.feel.lite', "tuned to your Mac"),
};

const MODE_PILL_ID = 'ursula.mode.pill';
const CATE_STATUS_ID = 'ursula.mode.cateStatus';
const SESSIONS_BTN_ID = 'ursula.sessions.statusbar';

// Per-mode command ids, keyed by mode, so a sheet row / number key fires the SAME command the
// QuickPick fires (single source of truth for "switch to mode X").
const CMD_FOR_MODE: Record<UrsulaMode, string> = {
	[UrsulaMode.Terax]: CMD_TERAX,
	[UrsulaMode.Warp]: CMD_WARP,
	[UrsulaMode.Cursor]: CMD_CURSOR,
	[UrsulaMode.Cate]: CMD_CATE,
	[UrsulaMode.Lite]: CMD_LITE,
};

// Sheet command ids — keyboard-driven, scoped to the sheet so they never hijack typing.
const CMD_SHEET_TOGGLE = 'ursula.mode.sheet.toggle';
const CMD_SHEET_HIDE = 'ursula.mode.sheet.hide';
const CMD_SHEET_PICK_PREFIX = 'ursula.mode.sheet.pick'; // + '1'..'5'

// Context key that is TRUE only while the slide-up sheet is open. Scopes the 1-5 / Esc
// keybindings so they fire ONLY when the launcher is visible.
const SHEET_VISIBLE_KEY = 'ursulaModeSheetVisible';
const SheetVisibleContext = new RawContextKey<boolean>(SHEET_VISIBLE_KEY, false);

// Bottom-bar geometry. The bar sits ABOVE the status bar; z below quick input (2550) so the
// Cmd+K M QuickPick opens on top. The sheet sits above the modal backdrop (2540), below quick
// input — same band the notification toasts use (2545).
const BAR_HEIGHT = 30;
const BAR_GAP_ABOVE_STATUSBAR = 3;
const BAR_Z_INDEX = 2400;
const SHEET_Z_INDEX = 2545;

// The order the rooms appear in the sheet (mirrors the QuickPick order). Index + 1 = the number key.
const SHEET_ORDER: UrsulaMode[] = [UrsulaMode.Warp, UrsulaMode.Cate, UrsulaMode.Terax, UrsulaMode.Cursor, UrsulaMode.Lite];

// The exported RAM Guard command that returns the hardware reading + optimizer setting.
// Shape (best-effort — the contribution degrades gracefully if absent or shaped differently):
//   { recommended?: 'lite' | 'terax', optimizerMode?: 'recommend' | 'auto' | 'off', gpuAccel?: 'off' | 'auto' }
const RAMGUARD_GET_HARDWARE = 'ursula.ramGuard.getHardware';
interface IHardwareInfo {
	readonly recommended?: 'lite' | 'terax';
	readonly optimizerMode?: 'recommend' | 'auto' | 'off';
	readonly gpuAccel?: 'off' | 'auto';
}

interface IModePickItem extends IQuickPickItem {
	readonly mode?: UrsulaMode;
	readonly isDefault?: boolean;
}

export class UrsulaModesContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.ursulaModes';

	private readonly pill = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly cateStatus = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly sessionsBtn = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	// Mechanism A — the ONE persistent <style class="ursula-mode-css"> we swap per mode.
	private readonly modeStyle: HTMLStyleElement;

	// Mechanism C — the bottom bar + slide-up sheet (plain DOM on mainContainer, not grid parts).
	private bar: HTMLElement | undefined;
	private sheet: HTMLElement | undefined;
	private barLabel: HTMLElement | undefined;
	// Mode-specific overlay widgets: Warp's command bar (bottom) + Cate's session-tab strip (top).
	private warpBar: HTMLElement | undefined;
	private cateTabs: HTMLElement | undefined;
	private sheetVisibleCtx: IContextKey<boolean>;
	private sheetOpen = false;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IUserDataProfileImportExportService private readonly userDataProfileImportExportService: IUserDataProfileImportExportService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@ICommandService private readonly commandService: ICommandService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@INotificationService private readonly notificationService: INotificationService,
		@IHostService private readonly hostService: IHostService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		// Mechanism A: head-scoped style sheet (auto-clones to aux windows, MutationObserver-synced).
		// Default container = mainWindow.document.head; we just tag it so applyModeCss can swap textContent.
		// createStyleSheet returns the <style> element (not a disposable); pass _store so it cleans up.
		this.modeStyle = createStyleSheet(undefined, s => { s.className = 'ursula-mode-css'; }, this._store);

		this.sheetVisibleCtx = SheetVisibleContext.bindTo(this.contextKeyService);

		this.registerCommands();
		this.refreshStatusbar();

		// Mechanism C: build the bottom switcher (gated to non-Agents windows).
		this.buildSwitcher();

		// Mechanism A: apply the skin for whatever mode the window opened in. LOAD-BEARING — without
		// this the skin would vanish after every folder-open reload (mirrors refreshStatusbar()).
		this.applyModeCss(this.userDataProfileService.currentProfile.name);
		// Mechanism B: re-assert the per-mode part LAYOUT. Part visibility is per-workspace runtime
		// state (not a profile setting), so it must be re-applied on this reload-proof path too — but
		// applyModeLayout guards on a "shapedFor" marker so it only fires on a real mode change. Defer to
		// whenRestored: the workbench's own layout restore reads the SAME per-workspace state, so applying
		// before it finishes would let the restore overwrite our setPartHidden calls on a cold boot.
		this.layoutService.whenRestored.then(() => {
			if (!this._store.isDisposed) {
				this.applyModeLayout(this.userDataProfileService.currentProfile.name);
			}
		});

		// Pill + skin + layout + switcher all follow profile changes (also covers entering/leaving Agents window).
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => {
			this.refreshStatusbar();
			this.applyModeCss(this.userDataProfileService.currentProfile.name);
			this.applyModeLayout(this.userDataProfileService.currentProfile.name);
			this.refreshSwitcher();
		}));

		// Keep the overlay glued above the status bar as the main container relayouts.
		this._register(this.layoutService.onDidLayoutMainContainer(() => this.positionSwitcher()));
	}

	// ---------------------------------------------------------------------------------------------
	// Agents-window gate
	// ---------------------------------------------------------------------------------------------

	private get isAgentsWindow(): boolean {
		return this.userDataProfileService.currentProfile.id === AGENTS_WINDOW_PROFILE_ID;
	}

	// ---------------------------------------------------------------------------------------------
	// Status bar: the LEFT mode pill + the Cate-only rich status item
	// ---------------------------------------------------------------------------------------------

	private refreshStatusbar(): void {
		// Gate everything off in the Agents window — modes are unsupported there.
		if (this.isAgentsWindow) {
			this.pill.clear();
			this.cateStatus.clear();
			this.sessionsBtn.clear();
			return;
		}

		const profileName = this.userDataProfileService.currentProfile.name;

		const pillEntry: IStatusbarEntry = {
			name: localize('ursula.mode.pill.name', "Ursula Mode"),
			text: `$(layers) ${profileName}`,
			ariaLabel: localize('ursula.mode.pill.aria', "Ursula mode: {0}. Click to switch.", profileName),
			tooltip: localize('ursula.mode.pill.tooltip', "Ursula mode: {0} — click to switch rooms", profileName),
			command: CMD_SWITCH,
		};
		if (this.pill.value) {
			this.pill.value.update(pillEntry);
		} else {
			// LEFT-aligned, low priority so it sits apart from the RIGHT-aligned RAM Guard pill.
			this.pill.value = this.statusbarService.addEntry(pillEntry, MODE_PILL_ID, StatusbarAlignment.LEFT, 100);
		}

		// A visible door to the movable Sessions rail in EVERY mode — the lean modes hide the activity
		// bar, so without this the rail would only be reachable in Cate. Always present (kept off only
		// in the Agents window, handled above). Click opens the rail; it's draggable left/right.
		const sessionsEntry: IStatusbarEntry = {
			name: localize('ursula.sessions.btn.name', "Ursula Sessions"),
			text: '$(list-tree) Sessions',
			ariaLabel: localize('ursula.sessions.btn.aria', "Open the Ursula Sessions rail"),
			tooltip: localize('ursula.sessions.btn.tooltip', "Your live Claude sessions — click to open the rail (drag it left or right to move it)"),
			command: 'ursula.sessions.focus',
		};
		if (this.sessionsBtn.value) {
			this.sessionsBtn.value.update(sessionsEntry);
		} else {
			this.sessionsBtn.value = this.statusbarService.addEntry(sessionsEntry, SESSIONS_BTN_ID, StatusbarAlignment.LEFT, 98);
		}

		// Cate's signature rich Claude-session readout — only while the Cate profile is active.
		if (profileName === MODE_NAME[UrsulaMode.Cate]) {
			this.showCateStatus();
		} else {
			this.cateStatus.clear();
		}
	}

	private showCateStatus(): void {
		// A compact, honest Claude-session line. Counts/cost come from the same Claude session
		// metadata the RAM Guard scan reads; where a datum genuinely isn't available locally
		// (e.g. live reset timers), the segment is simply omitted rather than invented.
		const text = '$(flame) Claude session';
		const entry: IStatusbarEntry = {
			name: localize('ursula.cate.status.name', "Claude Session"),
			text,
			ariaLabel: localize('ursula.cate.status.aria', "Claude session readout"),
			tooltip: localize('ursula.cate.status.tooltip', "Active Claude session — model, context, MCPs, hooks and cost"),
			command: 'ursula.ramGuard.openPanel',
		};
		if (this.cateStatus.value) {
			this.cateStatus.value.update(entry);
		} else {
			this.cateStatus.value = this.statusbarService.addEntry(entry, CATE_STATUS_ID, StatusbarAlignment.LEFT, 99);
		}
	}

	// ---------------------------------------------------------------------------------------------
	// Commands
	// ---------------------------------------------------------------------------------------------

	private registerCommands(): void {
		// The switcher (QuickPick).
		this._register(CommandsRegistry.registerCommand(CMD_SWITCH, () => this.openSwitcher()));

		// Five thin per-mode commands (palette-searchable + keybindable).
		this._register(CommandsRegistry.registerCommand(CMD_TERAX, () => this.applyMode(UrsulaMode.Terax)));
		this._register(CommandsRegistry.registerCommand(CMD_WARP, () => this.applyMode(UrsulaMode.Warp)));
		this._register(CommandsRegistry.registerCommand(CMD_CURSOR, () => this.applyMode(UrsulaMode.Cursor)));
		this._register(CommandsRegistry.registerCommand(CMD_CATE, () => this.applyMode(UrsulaMode.Cate)));
		this._register(CommandsRegistry.registerCommand(CMD_LITE, () => this.applyMode(UrsulaMode.Lite)));

		// Chord: Cmd+K M → toggle the bottom SHEET (the new launcher). Bind the KEY to the
		// ALREADY-registered CMD_SHEET_TOGGLE command. (registerCommandAndKeybindingRule would
		// RE-register the command with a recursive handler — "Maximum call stack size exceeded";
		// registerKeybindingRule binds the key without adding a second handler.)
		this._register(CommandsRegistry.registerCommand(CMD_SHEET_TOGGLE, () => this.toggleSheet()));
		this._register(KeybindingsRegistry.registerKeybindingRule({
			id: CMD_SHEET_TOGGLE,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.notEquals('currentProfile', AGENTS_WINDOW_PROFILE_ID),
			primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyM),
		}));

		// Sheet-scoped keys. ALL gated by `ursulaModeSheetVisible` so they fire ONLY while the sheet
		// is open — number keys never hijack normal typing, Esc never steals from other widgets.
		const sheetVisible = ContextKeyExpr.has(SHEET_VISIBLE_KEY);

		this._register(CommandsRegistry.registerCommand(CMD_SHEET_HIDE, () => this.hideSheet()));
		this._register(KeybindingsRegistry.registerKeybindingRule({
			id: CMD_SHEET_HIDE,
			weight: KeybindingWeight.WorkbenchContrib + 50, // beat the editor's own Escape
			when: sheetVisible,
			primary: KeyCode.Escape,
		}));

		// Number keys 1..5 → pick the room at that sheet row (the SHEET_ORDER index).
		const numberKeys = [KeyCode.Digit1, KeyCode.Digit2, KeyCode.Digit3, KeyCode.Digit4, KeyCode.Digit5];
		for (let i = 0; i < SHEET_ORDER.length; i++) {
			const idx = i;
			const id = CMD_SHEET_PICK_PREFIX + (idx + 1);
			this._register(CommandsRegistry.registerCommand(id, () => this.pickRow(idx)));
			this._register(KeybindingsRegistry.registerKeybindingRule({
				id,
				weight: KeybindingWeight.WorkbenchContrib + 50,
				when: sheetVisible,
				primary: numberKeys[idx],
			}));
		}
	}

	// ---------------------------------------------------------------------------------------------
	// Mechanism A — per-mode CSS injection (the reskin)
	// ---------------------------------------------------------------------------------------------

	private clearModeCss(): void {
		const root = this.layoutService.mainContainer;
		Array.from(root.classList).forEach(c => {
			if (c.startsWith('ursula-mode-')) {
				root.classList.remove(c);
			}
		});
		this.modeStyle.textContent = '';
	}

	private applyModeCss(profileName: string): void {
		// Honor the existing Agents-window gate — no skin there.
		if (this.isAgentsWindow) {
			this.clearModeCss();
			return;
		}
		const root = this.layoutService.mainContainer; // the .monaco-workbench element
		// Strip any previous ursula-mode-* class first so switching modes never stacks skins.
		Array.from(root.classList).forEach(c => {
			if (c.startsWith('ursula-mode-')) {
				root.classList.remove(c);
			}
		});
		const mode = MODE_BY_NAME[profileName];
		if (mode !== undefined) {
			root.classList.add('ursula-mode-' + MODE_NAME[mode].toLowerCase());
			this.modeStyle.textContent = MODE_CSS[mode] ?? '';
		} else {
			// Default / unknown profile -> no skin (safe fallback).
			this.modeStyle.textContent = '';
		}
	}

	// ---------------------------------------------------------------------------------------------
	// Mechanism B — per-mode LAYOUT (the genuine restructure: hide/show/resize workbench parts)
	// ---------------------------------------------------------------------------------------------

	// Part visibility (side bar / panel / aux bar) is per-WORKSPACE runtime state, NOT a profile
	// setting (verified: layout.ts LayoutStateKeys.*_HIDDEN are StorageScope.WORKSPACE). So it does
	// NOT travel with the profile and MUST be re-asserted on the reload-proof path (constructor +
	// onDidChangeCurrentProfile, exactly like applyModeCss). But re-asserting on EVERY load would
	// clobber a layout tweak the user made inside a mode (Drey: customizations must persist) — so we
	// guard on a per-workspace "shapedFor" marker and apply ONLY on a genuine mode change.
	private static readonly SHAPED_FOR_KEY = 'ursula.mode.shapedFor';

	private applyModeLayout(profileName: string): void {
		if (this.isAgentsWindow) {
			return; // modes (and their layout) are unsupported in the Agents window
		}
		const prev = this.storageService.get(UrsulaModesContribution.SHAPED_FOR_KEY, StorageScope.WORKSPACE);
		if (prev === profileName) {
			return; // already shaped this mode in this workspace — respect the user's saved layout
		}

		const mode = MODE_BY_NAME[profileName];
		// First boot into Default (no prior shape): do NOT force the baseline over the window's own
		// restored layout — just record it. We restore the baseline only when LEAVING a mode (prev != undefined).
		if (mode === undefined && prev === undefined) {
			this.storageService.store(UrsulaModesContribution.SHAPED_FOR_KEY, profileName, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			return;
		}

		const spec: IModeLayout = mode !== undefined ? MODE_LAYOUT[mode] : DEFAULT_LAYOUT;
		try {
			const L = this.layoutService;
			L.setPartHidden(spec.sidebar === 'hide', Parts.SIDEBAR_PART);
			L.setPartHidden(spec.auxbar === 'hide', Parts.AUXILIARYBAR_PART);
			if (spec.panel === 'hide') {
				L.setPartHidden(false, Parts.EDITOR_PART);     // keep one focusable surface — never hide editor + panel together
				L.setPartHidden(true, Parts.PANEL_PART);
			} else if (spec.panel === 'maximize') {
				L.setPartHidden(false, Parts.PANEL_PART);      // ensure visible (idempotent) before maximize
				if (!L.isPanelMaximized()) {
					L.toggleMaximizedPanel();                  // GUARDED — maximize hides the editor internally; never un-maximize on a repeat entry
				}
			} else {
				L.setPartHidden(false, Parts.EDITOR_PART);
				L.setPartHidden(false, Parts.PANEL_PART);
				if (L.isPanelMaximized()) {
					L.toggleMaximizedPanel();                  // back to a normal split
				}
			}
			if (spec.auxWidth !== undefined && spec.auxbar === 'show') {
				const size = L.getSize(Parts.AUXILIARYBAR_PART);
				L.setSize(Parts.AUXILIARYBAR_PART, { width: spec.auxWidth, height: size.height });  // widen the composer (Cursor)
			}
		} catch {
			// a layout call must never break a mode switch
		}

		this.storageService.store(UrsulaModesContribution.SHAPED_FOR_KEY, profileName, StorageScope.WORKSPACE, StorageTarget.MACHINE);

		// Extension-contributed extras (Sessions rail focus / AI chat) only exist after the ext host
		// re-registers post-switch, so run them async-gated. The native part toggles above already landed.
		if (spec.focusSessions || spec.openChat) {
			void this.runModeExtras(spec);
		}
	}

	private async runModeExtras(spec: IModeLayout): Promise<void> {
		// Wait for the extension host to re-register after the profile switch, else rail-focus /
		// openChatToSide (extension-contributed) silently no-op while the host is mid-restart.
		await this.extensionService.whenInstalledExtensionsRegistered();
		const run = async (commandId: string) => {
			try {
				await this.commandService.executeCommand(commandId);
			} catch {
				// command not available in this window/state — the layout already applied
			}
		};
		if (spec.focusSessions) {
			await run('ursula.sessions.focus');
		}
		if (spec.openChat) {
			await run('workbench.action.openChatToSide');
		}
	}

	private async getHardware(): Promise<IHardwareInfo | undefined> {
		// Reads the recommendation + optimizer mode from the RAM Guard extension. Best-effort:
		// if the extension hasn't activated / the command isn't registered, return undefined and
		// the switcher simply shows no badge.
		try {
			return await this.commandService.executeCommand<IHardwareInfo>(RAMGUARD_GET_HARDWARE);
		} catch {
			return undefined;
		}
	}

	private async openSwitcher(): Promise<void> {
		if (this.isAgentsWindow) {
			return; // gated — modes unsupported in the Agents window
		}

		const hardware = await this.getHardware();
		const showBadge = hardware?.optimizerMode !== 'off';
		const recommended = showBadge ? hardware?.recommended : undefined;

		const items: IModePickItem[] = [];
		const order: UrsulaMode[] = [UrsulaMode.Terax, UrsulaMode.Warp, UrsulaMode.Cursor, UrsulaMode.Cate, UrsulaMode.Lite];
		for (const mode of order) {
			const isRecommended = recommended === mode;
			items.push({
				mode,
				label: `$(${this.iconFor(mode)}) ${MODE_NAME[mode]}`,
				description: MODE_FEEL[mode],
				detail: isRecommended ? localize('ursula.recommended', "$(star-full) Recommended for your Mac") : undefined,
			});
		}
		items.push({
			isDefault: true,
			label: localize('ursula.default', "$(history) Default"),
			description: localize('ursula.feel.default', "back to baseline"),
		});

		const picked = await this.quickInputService.pick(items, {
			placeHolder: localize('ursula.switch.placeholder', "Switch Ursula mode — pick a room"),
			matchOnDescription: true,
		});
		if (!picked) {
			return;
		}
		if (picked.isDefault) {
			await this.applyDefault();
		} else if (picked.mode) {
			await this.applyMode(picked.mode);
		}
	}

	private iconFor(mode: UrsulaMode): string {
		switch (mode) {
			case UrsulaMode.Terax: return 'rocket';
			case UrsulaMode.Warp: return 'terminal';
			case UrsulaMode.Cursor: return 'comment-discussion';
			case UrsulaMode.Cate: return 'flame';
			case UrsulaMode.Lite: return 'dashboard';
		}
	}

	// ---------------------------------------------------------------------------------------------
	// Switch logic — upsert-by-NAME guard + Lite GPU injection + per-mode startup commands
	// ---------------------------------------------------------------------------------------------

	private async applyDefault(): Promise<void> {
		if (this.isAgentsWindow) {
			return;
		}
		const defaultProfile = this.userDataProfilesService.defaultProfile;
		if (this.userDataProfileService.currentProfile.id === defaultProfile.id) {
			// Don't no-op silently — that reads as "nothing happened". Reaffirm instead.
			this.notificationService.info(localize('ursula.toast.alreadyDefault', "Already on Default — baseline layout."));
			return; // already baseline
		}
		await this.userDataProfileManagementService.switchProfile(defaultProfile);
		this.notificationService.info(localize('ursula.toast.default', "Default — back to baseline."));
	}

	private async applyMode(mode: UrsulaMode): Promise<void> {
		if (this.isAgentsWindow) {
			return; // gated — a mode switch silently no-ops in the Agents window
		}

		const modeName = MODE_NAME[mode];

		// Upsert-by-NAME guard: createProfileFromTemplate does NOT upsert — it creates a NEW profile
		// every call. Find an existing mode profile by name first; only create if none exists.
		const existing = this.userDataProfilesService.profiles.find(p => p.name === modeName);

		// Already in this mode — reaffirm with the toast, but do NOT re-run the toggle-based startup
		// commands (they'd flip the panel/side bar back OFF on a repeat pick).
		if (existing && this.userDataProfileService.currentProfile.id === existing.id) {
			this.toastForMode(mode);
			return;
		}

		if (existing) {
			await this.userDataProfileManagementService.switchProfile(existing);
		} else {
			// First create per mode. Inject Lite's hardware-tuned GPU value BEFORE create.
			let template = MODE_TEMPLATE[mode];
			if (mode === UrsulaMode.Lite) {
				const hardware = await this.getHardware();
				template = withGpuAcceleration(template, hardware?.gpuAccel ?? 'off'); // safe low-VRAM default
			}
			await this.userDataProfileImportExportService.createProfileFromTemplate(
				template,
				{ name: modeName, useDefaultFlags: { extensions: true } }, // keystone: share the default extension set
				CancellationToken.None,
			);
		}

		// Did the LIVE window actually adopt the mode? switchProfile/create only flips the live profile
		// for an EMPTY window; with a FOLDER open it just associates the profile with the workspace,
		// which takes effect on reload. If we're now in the mode -> run the layout startup + toast.
		// Otherwise (folder open, no live change yet) -> reload so the mode's settings/theme/keybindings
		// actually apply. The reload IS the feedback — never fire a false "switched!" toast on a no-op.
		if (this.userDataProfileService.currentProfile.name === modeName) {
			// Empty-window live switch: the profile-change event already re-asserted the layout via
			// applyModeLayout; call it directly too for immediacy (it self-guards on shapedFor, so this
			// is a no-op if already shaped). Folder-open switches reload -> the constructor re-applies it.
			this.applyModeLayout(modeName);
			this.toastForMode(mode);
		} else {
			await this.hostService.reload();
		}
	}

	private toastForMode(mode: UrsulaMode): void {
		// Only on re-switch (existing profile), never on first-create (the progress notification covers that).
		switch (mode) {
			case UrsulaMode.Terax:
				this.notificationService.info(localize('ursula.toast.terax', "Terax — small, fast, good. Bare canvas, keyboard-first."));
				break;
			case UrsulaMode.Warp:
				this.notificationService.info(localize('ursula.toast.warp', "Warp — maximized terminal + gold command blocks. Open a fresh terminal to see the gold bars; Cmd+up/down to jump commands."));
				break;
			case UrsulaMode.Cursor:
				this.notificationService.info(localize('ursula.toast.cursor', "Cursor — AI on your right, minimap off. Full marketplace one click away."));
				break;
			case UrsulaMode.Cate:
				this.notificationService.info(localize('ursula.toast.cate', "Cate — your sessions, front and center. Warm-dark theme + Sessions rail pinned."));
				break;
			case UrsulaMode.Lite:
				this.notificationService.info(localize('ursula.toast.lite', "Lite — tuned to your Mac (watchers trimmed, telemetry off). Reopen a folder if a watcher feels stale."));
				break;
		}
	}


	// ---------------------------------------------------------------------------------------------
	// Mechanism C — bottom bar + slide-up sheet (overlay DOM on mainContainer, NOT a grid part)
	// ---------------------------------------------------------------------------------------------

	private buildSwitcher(): void {
		// Gate: never show the switcher in the Agents window (modes unsupported there).
		if (this.isAgentsWindow) {
			return;
		}

		const root = this.layoutService.mainContainer; // .monaco-workbench

		// --- The persistent bottom bar (current mode + Cmd+K M hint). Tap to open the sheet. ---
		const bar = $('.ursula-mode-bar');
		bar.style.zIndex = String(BAR_Z_INDEX);
		bar.style.height = `${BAR_HEIGHT}px`;
		const glyph = append(bar, $('span.ursula-mode-bar-glyph'));
		glyph.textContent = '⌘'; // ⌘ — reads as a command bar
		const label = append(bar, $('span.ursula-mode-bar-label'));
		const hint = append(bar, $('span.ursula-mode-bar-hint'));
		hint.textContent = localize('ursula.bar.hint', "⌘K M — switch room");
		this._register(addDisposableListener(bar, 'click', () => this.toggleSheet()));
		this.bar = bar;
		this.barLabel = label;

		// --- The slide-up sheet (the launcher). Rebuilt fresh each time it opens (cheap, 5 rows). ---
		const sheet = $('.ursula-mode-sheet');
		sheet.style.zIndex = String(SHEET_Z_INDEX);
		// Click-away inside the sheet shouldn't close it; the overlay nature + Esc handle that.
		this.sheet = sheet;

		append(root, bar);
		append(root, sheet);

		// --- Warp command bar (bottom, above the mode bar): type a command, Enter runs it in the terminal. ---
		const warpBar = $('.ursula-warp-cmdbar');
		warpBar.style.zIndex = String(BAR_Z_INDEX);
		warpBar.style.display = 'none';
		// Prompt glyph = a native codicon (chevron), never an emoji.
		append(warpBar, $('span.ursula-warp-prompt.codicon.codicon-chevron-right'));
		const winput = append(warpBar, $('input.ursula-warp-input')) as HTMLInputElement;
		winput.type = 'text';
		winput.spellcheck = false;
		winput.placeholder = localize('ursula.warp.placeholder', "Run a command — Enter to run");
		const wai = append(warpBar, $('span.ursula-warp-ai'));
		wai.textContent = localize('ursula.warp.ai', "AI");
		this._register(addDisposableListener(winput, 'keydown', (e) => {
			const ev = e as KeyboardEvent;
			if (ev.key === 'Enter') {
				ev.preventDefault();
				this.runWarpCommand(winput.value);
				winput.value = '';
			}
		}));
		append(root, warpBar);
		this.warpBar = warpBar;

		// --- Cate session-tab strip (top): one tab per live Claude session; click resumes it. ---
		const cateTabs = $('.ursula-cate-tabs');
		cateTabs.style.zIndex = String(BAR_Z_INDEX);
		cateTabs.style.display = 'none';
		append(root, cateTabs);
		this.cateTabs = cateTabs;

		this.refreshSwitcher();
		this.positionSwitcher();
	}

	/** Update the bar label + (if open) the sheet rows to the live mode, and honor the Agents gate. */
	private refreshSwitcher(): void {
		if (!this.bar || !this.sheet) {
			return;
		}
		if (this.isAgentsWindow) {
			// Hide the whole switcher in the Agents window.
			this.bar.style.display = 'none';
			this.hideSheet();
			return;
		}
		this.bar.style.display = 'flex';

		const profileName = this.userDataProfileService.currentProfile.name;
		const mode = MODE_BY_NAME[profileName];
		if (this.barLabel) {
			this.barLabel.textContent = mode !== undefined ? MODE_NAME[mode] : localize('ursula.bar.default', "Default");
		}
		if (this.sheetOpen) {
			this.renderSheetRows();
		}
		this.updateModeWidgets(profileName);
	}

	/** Position the bar above the status bar, the Warp command bar above it, the Cate tabs at the top. */
	private positionSwitcher(): void {
		if (!this.bar) {
			return;
		}
		let statusbarHeight = 0;
		try {
			if (this.layoutService.isVisible(Parts.STATUSBAR_PART, mainWindow)) {
				statusbarHeight = this.layoutService.getSize(Parts.STATUSBAR_PART).height;
			}
		} catch {
			statusbarHeight = 22; // safe default = the standard status-bar height
		}
		this.bar.style.bottom = `${statusbarHeight + BAR_GAP_ABOVE_STATUSBAR}px`;

		// Warp command bar sits just ABOVE the mode bar.
		if (this.warpBar) {
			this.warpBar.style.bottom = `${statusbarHeight + BAR_GAP_ABOVE_STATUSBAR + BAR_HEIGHT + 6}px`;
		}
		// Cate session tabs sit at the TOP, just below the title bar if one is shown.
		if (this.cateTabs) {
			let titleHeight = 0;
			try {
				if (this.layoutService.isVisible(Parts.TITLEBAR_PART, mainWindow)) {
					titleHeight = this.layoutService.getSize(Parts.TITLEBAR_PART).height;
				}
			} catch {
				titleHeight = 0;
			}
			this.cateTabs.style.top = `${titleHeight}px`;
		}
	}

	// ---------------------------------------------------------------------------------------------
	// Mode-specific widgets — Warp command bar (run commands) + Cate session-tab strip
	// ---------------------------------------------------------------------------------------------

	/** Show the right widget for the live mode (Warp bar in Warp, Cate tabs in Cate), and refresh data. */
	private updateModeWidgets(profileName: string): void {
		if (!this.warpBar || !this.cateTabs) {
			return;
		}
		if (this.isAgentsWindow) {
			this.warpBar.style.display = 'none';
			this.cateTabs.style.display = 'none';
			return;
		}
		const mode = MODE_BY_NAME[profileName];
		this.warpBar.style.display = mode === UrsulaMode.Warp ? 'flex' : 'none';
		this.cateTabs.style.display = mode === UrsulaMode.Cate ? 'flex' : 'none';
		if (mode === UrsulaMode.Cate) {
			void this.renderCateTabs();
		}
		this.positionSwitcher();
	}

	/** Warp command bar: focus a terminal then send the typed command + CR so it actually runs. */
	private runWarpCommand(text: string): void {
		const cmd = text.trim();
		if (!cmd) {
			return;
		}
		void this.commandService.executeCommand('workbench.action.terminal.focus')
			.then(() => this.commandService.executeCommand('workbench.action.terminal.sendSequence', { text: cmd + '\r' }))
			.catch(() => { /* no terminal available yet — ignore, the bar still cleared */ });
	}

	/** Cate session tabs: one tab per live Claude session (data from the RAM Guard extension). */
	private async renderCateTabs(): Promise<void> {
		if (!this.cateTabs) {
			return;
		}
		type SessionTab = { pid: number; sessionId?: string; cwd?: string; status?: string };
		let sessions: ReadonlyArray<SessionTab> = [];
		try {
			sessions = (await this.commandService.executeCommand<ReadonlyArray<SessionTab>>('ursula.ramGuard.getSessions')) ?? [];
		} catch {
			sessions = [];
		}
		const host = this.cateTabs;
		clearNode(host);
		if (sessions.length === 0) {
			const empty = append(host, $('.ursula-cate-tab.empty'));
			empty.textContent = localize('ursula.cate.noSessions', "No active sessions");
			return;
		}
		sessions.slice(0, 8).forEach((s, i) => {
			const tab = append(host, $('.ursula-cate-tab' + (i === 0 ? '.on' : '')));
			append(tab, $('span.ursula-cate-tab-fl.codicon.codicon-flame'));
			const nm = append(tab, $('span.ursula-cate-tab-nm'));
			nm.textContent = this.sessionLabel(s);
			append(tab, $('span.ursula-cate-tab-dot.' + (s.status === 'busy' ? 'run' : 'idle')));
			this._register(addDisposableListener(tab, 'click', () => {
				void this.commandService.executeCommand('ursula.sessions.resumeByPid', s.pid);
			}));
		});
	}

	/** A short, honest tab label: the session's folder name, else a short id, else the pid. */
	private sessionLabel(s: { pid: number; sessionId?: string; cwd?: string }): string {
		if (s.cwd) {
			const parts = s.cwd.replace(/\/+$/, '').split('/');
			return parts[parts.length - 1] || s.cwd;
		}
		if (s.sessionId) {
			return s.sessionId.slice(0, 8);
		}
		return `pid ${s.pid}`;
	}

	private renderSheetRows(): void {
		if (!this.sheet) {
			return;
		}
		clearNode(this.sheet);
		const title = append(this.sheet, $('.ursula-mode-sheet-title'));
		title.textContent = localize('ursula.sheet.title', "Switch room");

		this.sheet.style.setProperty('display', 'block');

		for (let i = 0; i < SHEET_ORDER.length; i++) {
			const mode = SHEET_ORDER[i];
			const row = append(this.sheet, $('.ursula-mode-row'));
			row.tabIndex = -1;
			const key = append(row, $('.ursula-mode-key'));
			key.textContent = String(i + 1);
			const name = append(row, $('.ursula-mode-name'));
			name.textContent = MODE_NAME[mode];
			const feel = append(row, $('.ursula-mode-feel'));
			feel.textContent = MODE_FEEL[mode];
			this._register(addDisposableListener(row, 'click', () => this.pickRow(i)));
		}
	}

	private toggleSheet(): void {
		if (this.isAgentsWindow) {
			return;
		}
		if (this.sheetOpen) {
			this.hideSheet();
		} else {
			this.showSheet();
		}
	}

	private showSheet(): void {
		if (!this.sheet || this.isAgentsWindow) {
			return;
		}
		this.renderSheetRows();
		this.sheet.classList.add('visible');
		this.sheetOpen = true;
		this.sheetVisibleCtx.set(true);
	}

	private hideSheet(): void {
		if (!this.sheet) {
			return;
		}
		this.sheet.classList.remove('visible');
		this.sheetOpen = false;
		this.sheetVisibleCtx.set(false);
	}

	/** Fire the SAME per-mode command the QuickPick fires, then close the sheet. */
	private pickRow(index: number): void {
		const mode = SHEET_ORDER[index];
		if (mode === undefined) {
			return;
		}
		this.hideSheet();
		// Best-effort: a missing command never throws into the keydown path.
		this.commandService.executeCommand(CMD_FOR_MODE[mode]).catch(() => { /* ignore */ });
	}
}

registerWorkbenchContribution2(UrsulaModesContribution.ID, UrsulaModesContribution, WorkbenchPhase.BlockRestore);
