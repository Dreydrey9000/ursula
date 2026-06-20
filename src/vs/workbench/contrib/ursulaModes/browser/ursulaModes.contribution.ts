/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { AGENTS_WINDOW_PROFILE_ID, IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { MODE_NAME, MODE_TEMPLATE, UrsulaMode, withGpuAcceleration } from './templates.js';

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

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IUserDataProfileImportExportService private readonly userDataProfileImportExportService: IUserDataProfileImportExportService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@ICommandService private readonly commandService: ICommandService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();

		this.registerCommands();
		this.refreshStatusbar();

		// Pill always shows truth — refresh on profile change (which also covers entering/leaving Agents window).
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => this.refreshStatusbar()));
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

		// Chord: Cmd+K M → open the switcher.
		this._register(KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: CMD_SWITCH,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.notEquals('currentProfile', AGENTS_WINDOW_PROFILE_ID),
			primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyM),
			handler: (accessor: ServicesAccessor) => accessor.get(ICommandService).executeCommand(CMD_SWITCH),
		}));
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

		if (existing) {
			if (this.userDataProfileService.currentProfile.id === existing.id) {
				// Already in this mode — reaffirm with the toast, but do NOT re-run the toggle-based
				// startup commands (toggle* would flip the panel/side bar back OFF on a repeat pick).
				this.toastForMode(mode);
				return;
			}
			await this.userDataProfileManagementService.switchProfile(existing);
			await this.runStartupCommands(mode);
			this.toastForMode(mode);
			return;
		}

		// First create per mode. Inject Lite's hardware-tuned GPU value BEFORE create.
		let template = MODE_TEMPLATE[mode];
		if (mode === UrsulaMode.Lite) {
			const hardware = await this.getHardware();
			const gpu = hardware?.gpuAccel ?? 'off'; // safe low-VRAM default
			template = withGpuAcceleration(template, gpu);
		}

		// createProfileFromTemplate pops its own sticky cancellable progress notification on first
		// create — do NOT also fire our own toast here.
		await this.userDataProfileImportExportService.createProfileFromTemplate(
			template,
			{ name: modeName, useDefaultFlags: { extensions: true } }, // keystone: share the default extension set
			CancellationToken.None,
		);
		await this.runStartupCommands(mode);
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

	/**
	 * Per-mode runtime layout transitions that a settings.json can't express. Run AFTER switching.
	 *   Warp  → ensure panel visible, then maximize it.
	 *   Cursor → ensure aux (right) bar visible, then open chat to side.
	 *   Cate  → focus the Sessions rail, ensure the primary side bar visible.
	 *   Terax / Lite → none.
	 * Each command is best-effort (try/catch) so a missing command never breaks a switch.
	 */
	private async runStartupCommands(mode: UrsulaMode): Promise<void> {
		const run = async (commandId: string) => {
			try {
				await this.commandService.executeCommand(commandId);
			} catch {
				// command not available in this window/state — ignore, the switch already happened
			}
		};

		switch (mode) {
			case UrsulaMode.Warp:
				// focusPanel SHOWS + focuses the panel idempotently (a blind togglePanel would HIDE it
				// when already open). Then maximize it — the load-bearing Warp step.
				await run('workbench.action.focusPanel');
				await run('workbench.action.toggleMaximizedPanel');
				break;
			case UrsulaMode.Cursor:
				// focusAuxiliaryBar SHOWS + focuses the right bar idempotently (toggle would hide it if open).
				await run('workbench.action.focusAuxiliaryBar');
				await run('workbench.action.openChatToSide');
				break;
			case UrsulaMode.Cate:
				// Show the side bar FIRST (idempotent), THEN reveal the Sessions rail inside it. The old
				// order ran a blind toggleSidebarVisibility that HID the bar it had just opened — which made
				// Cate's hero feature (sessions front-and-center) vanish on entry. focusSideBar never hides.
				await run('workbench.action.focusSideBar');
				await run('ursula.sessions.focus');
				break;
			case UrsulaMode.Terax:
			case UrsulaMode.Lite:
				break;
		}
	}
}

registerWorkbenchContribution2(UrsulaModesContribution.ID, UrsulaModesContribution, WorkbenchPhase.BlockRestore);
