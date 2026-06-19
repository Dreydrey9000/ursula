/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Ursula command markers — a gold left-edge bar at each command's prompt line.
// Deliberately small (Terax bar): one job, no background tints, no speculative
// states. The exit-code status itself is already shown by the VS Code
// DecorationAddon (the gutter mark), so this addon only adds the gold command
// boundary — it does not duplicate that work. Setting-guarded
// (`terminal.ursula.commandBlocks`); clipping-safe (marker-anchored, dispose on
// invalidate, clear on resize).

import type { ITerminalAddon, Terminal } from '@xterm/xterm';
import { Disposable, DisposableStore, dispose, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TerminalCapability, type ICommandDetectionCapability, type ITerminalCapabilityStore, type ITerminalCommand } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';

const BAR_COLOR = '#C2A878'; // warm gold, opaque (sits beside the prompt, no text under it)

export class BlockRendererAddon extends Disposable implements ITerminalAddon {
	private _terminal: Terminal | undefined;
	private _capability: ICommandDetectionCapability | undefined;
	private readonly _bars: Map<number, DisposableStore> = new Map(); // keyed by command marker id
	private _enabled = false;

	constructor(
		private readonly _capabilities: ITerminalCapabilityStore,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._enabled = this._configurationService.getValue<boolean>(TerminalSettingId.UrsulaCommandBlocks) ?? true;
		// Toggle just flips the flag + clears/replays; listeners stay attached and no-op when disabled.
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (!e.affectsConfiguration(TerminalSettingId.UrsulaCommandBlocks)) {
				return;
			}
			this._enabled = this._configurationService.getValue<boolean>(TerminalSettingId.UrsulaCommandBlocks) ?? true;
			if (this._enabled) {
				this._replay();
			} else {
				this._clearAll();
			}
		}));
		this._register(toDisposable(() => this._clearAll()));
	}

	activate(terminal: Terminal): void {
		this._terminal = terminal;
		const store = this._register(new DisposableStore());
		store.add(terminal.onResize(() => { this._clearAll(); this._replay(); })); // resize invalidates geometry
		store.add(this._capabilities.onDidAddCapability(c => {
			if (c.id === TerminalCapability.CommandDetection) {
				this._hookCapability(store, this._capabilities.get(TerminalCapability.CommandDetection) as ICommandDetectionCapability);
			}
		}));
		store.add(this._capabilities.onDidRemoveCapability(c => {
			if (c.id === TerminalCapability.CommandDetection) {
				this._capability = undefined;
				this._clearAll();
			}
		}));
		const existing = this._capabilities.get(TerminalCapability.CommandDetection);
		if (existing) {
			this._hookCapability(store, existing as ICommandDetectionCapability);
		}
	}

	private _hookCapability(store: DisposableStore, cap: ICommandDetectionCapability): void {
		if (this._capability === cap) {
			return;
		}
		this._capability = cap;
		store.add(cap.onCommandStarted(cmd => this._renderBar(cmd)));
		store.add(cap.onCommandFinished(cmd => this._renderBar(cmd)));
		store.add(cap.onCommandInvalidated(cmds => {
			for (const c of cmds) {
				const id = c.marker?.id;
				if (id !== undefined) {
					this._disposeBar(id);
				}
			}
		}));
		for (const cmd of cap.commands) {
			this._renderBar(cmd);
		}
	}

	private _renderBar(command: ITerminalCommand): void {
		if (!this._terminal || !this._enabled) {
			return;
		}
		const marker = command.executedMarker ?? command.marker ?? command.promptStartMarker;
		if (!marker) {
			return; // no anchor — never invent one (clipping-bug root cause)
		}
		this._disposeBar(marker.id); // re-render on the same marker id replaces cleanly
		const bar = this._terminal.registerDecoration({
			marker,
			anchor: 'left',
			width: 1,
			height: 1,
			backgroundColor: BAR_COLOR,
			layer: 'bottom',
		});
		if (!bar) {
			return;
		}
		const store = new DisposableStore();
		store.add(bar);
		store.add(bar.onDispose(() => this._disposeBar(marker.id)));
		this._bars.set(marker.id, store);
	}

	private _disposeBar(id: number): void {
		const store = this._bars.get(id);
		if (store) {
			dispose(store);
			this._bars.delete(id);
		}
	}

	private _clearAll(): void {
		for (const [, store] of this._bars) {
			dispose(store);
		}
		this._bars.clear();
	}

	private _replay(): void {
		if (!this._capability) {
			return;
		}
		for (const cmd of this._capability.commands) {
			this._renderBar(cmd);
		}
	}

	override dispose(): void {
		this._clearAll();
		super.dispose();
	}
}
