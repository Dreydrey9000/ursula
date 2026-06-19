/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Ursula contributors. All rights reserved.
 *  Licensed under the MIT License.
 *
 *  Ursula RAM Guard — live RAM-pressure status bar, a Claude-session dashboard
 *  (see which session is the hog and free it in one click), and crash-recovery
 *  detection that surfaces Claude sessions which died mid-turn and offers a
 *  one-click resume. Claude Code writes every turn to ~/.claude/projects, so a
 *  killed session is recoverable — this extension makes that visible instead of
 *  surprising you with an OOM that feels like "lost chats".
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

const ALERT_COOLDOWN_MS = 60000; // don't spam the critical-pressure notice
let lastAlertAt = 0;

interface ClaudeSession {
	readonly pid: number;
	readonly rssMb: number;
	readonly age: string;
	readonly command: string;
	sessionId?: string;
	cwd?: string;
	status?: string;
}

interface RamInfo {
	readonly usedPct: number;
	readonly freeMb: number;
	readonly totalGb: number;
	readonly usedGb: number;
	readonly compressorMb: number;
}

export function activate(context: vscode.ExtensionContext): void {
	const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	status.name = 'Ursula RAM Guard';
	status.command = 'ursula.ramGuard.show';
	status.show();
	context.subscriptions.push(status);

	const tick = (): void => { void updateStatusBar(status); };
	tick();
	const pollMs = Math.max(2, vscode.workspace.getConfiguration('ursula.ramGuard').get<number>('pollSeconds', 5)) * 1000;
	const timer = setInterval(tick, pollMs);
	context.subscriptions.push({ dispose: (): void => clearInterval(timer) });

	context.subscriptions.push(
		vscode.commands.registerCommand('ursula.ramGuard.show', (): void => { void showDashboard(); }),
		vscode.commands.registerCommand('ursula.ramGuard.scanInterrupted', (): void => { void scanInterrupted(false); }),
	);

	// Surface any sessions that died mid-turn — the real "lost chat" fix.
	void scanInterrupted(true);
}

export function deactivate(): void { /* noop */ }

function thresholds(): { warn: number; crit: number } {
	const cfg = vscode.workspace.getConfiguration('ursula.ramGuard');
	return {
		warn: cfg.get<number>('warnThresholdPct', 75),
		crit: cfg.get<number>('criticalThresholdPct', 88),
	};
}

function ramInfoFallback(): RamInfo {
	const total = os.totalmem();
	const free = os.freemem();
	const used = total - free;
	return {
		usedPct: (used / total) * 100,
		freeMb: free / 1024 / 1024,
		totalGb: total / 1024 / 1024 / 1024,
		usedGb: used / 1024 / 1024 / 1024,
		compressorMb: 0,
	};
}

// On macOS, os.freemem() is optimistic — it over-counts reclaimable memory as
// "free", so the warning can fire too late (after jetsam already killed a
// session). vm_stat gives us the true picture: pages the compressor is holding
// (the strongest single OOM-pressure signal on macOS) + genuinely reclaimable
// pages. Falls back to os.freemem on non-darwin / on any error.
function getSystemRam(): Promise<RamInfo> {
	return new Promise(resolve => {
		if (process.platform !== 'darwin') { resolve(ramInfoFallback()); return; }
		const proc = spawn('vm_stat');
		proc.stdout.setEncoding('utf8');
		let out = '';
		proc.stdout.on('data', (d: string) => { out += d; });
		proc.stderr.on('data', () => { /* ignore */ });
		proc.on('error', () => resolve(ramInfoFallback()));
		proc.on('close', () => {
			try { resolve(parseVmStat(out)); } catch { resolve(ramInfoFallback()); }
		});
	});
}

function parseVmStat(out: string): RamInfo {
	const total = os.totalmem();
	const psMatch = out.match(/page size of (\d+) bytes/);
	const pageSize = psMatch ? Number(psMatch[1]) : 16384;
	const pages = (label: string): number => {
		const m = out.match(new RegExp(label + ':\\s+(\\d+)'));
		return m ? Number(m[1]) * pageSize : 0;
	};
	// Reclaimable-without-swap-in: free + speculative + inactive + purgeable.
	const freeBytes = pages('Pages free') + pages('Pages speculative') + pages('Pages inactive') + pages('Pages purgeable');
	const compressorBytes = pages('Pages occupied by compressor');
	const used = total - freeBytes;
	return {
		usedPct: (used / total) * 100,
		freeMb: freeBytes / 1024 / 1024,
		totalGb: total / 1024 / 1024 / 1024,
		usedGb: used / 1024 / 1024 / 1024,
		compressorMb: compressorBytes / 1024 / 1024,
	};
}

async function updateStatusBar(status: vscode.StatusBarItem): Promise<void> {
	const [r, sessions] = await Promise.all([getSystemRam(), listClaudeSessions()]);
	const totalMb = sessions.reduce((a, s) => a + s.rssMb, 0);
	const th = thresholds();
	const heavyCompress = r.compressorMb > r.totalGb * 1024 * 0.30; // compressor holding >30% of RAM = strong pressure
	const critical = r.usedPct >= th.crit || heavyCompress;
	const warn = r.usedPct >= th.warn;

	let icon = '$(pulse)';
	let bg: vscode.ThemeColor | undefined;
	if (critical) {
		icon = '$(warning)';
		bg = new vscode.ThemeColor('statusBarItem.errorBackground');
	} else if (warn) {
		icon = '$(alert)';
		bg = new vscode.ThemeColor('statusBarItem.warningBackground');
	}
	status.text = `${icon} ${r.usedPct.toFixed(0)}% · ${sessions.length}`;
	status.backgroundColor = bg;

	const top = sessions.slice(0, 5)
		.map(s => `- \`${shortDir(s.cwd)}\` · ${s.rssMb.toFixed(0)} MB${s.status ? ` · ${s.status}` : ''}`)
		.join('\n');
	const md = new vscode.MarkdownString(
		`**RAM:** ${r.usedGb.toFixed(1)} / ${r.totalGb.toFixed(0)} GB used (${r.usedPct.toFixed(0)}%) — ${r.freeMb.toFixed(0)} MB free\n\n` +
		`**Claude sessions:** ${sessions.length} · ${totalMb.toFixed(0)} MB total\n${top}\n\n` +
		`Chats auto-save to \`~/.claude/projects\` every turn — safe to free RAM. Click for the dashboard.`,
	);
	md.supportThemeIcons = true;
	md.isTrusted = true;
	status.tooltip = md;

	if (critical && sessions.length > 0 && Date.now() - lastAlertAt > ALERT_COOLDOWN_MS) {
		lastAlertAt = Date.now();
		const choice = await vscode.window.showWarningMessage(
			`Ursula: RAM pressure critical (${r.usedPct.toFixed(0)}% used, ${sessions.length} Claude sessions). ` +
			`Free RAM by closing an idle session — its chat is safe on disk.`,
			'Open dashboard',
		);
		if (choice === 'Open dashboard') {
			void showDashboard();
		}
	}
}

function listClaudeSessions(): Promise<ClaudeSession[]> {
	return new Promise(resolve => {
		const proc = spawn('ps', ['-eo', 'pid=,rss=,etime=,command=']);
		proc.stdout.setEncoding('utf8');
		let out = '';
		proc.stdout.on('data', (d: string) => { out += d; });
		proc.stderr.on('data', () => { /* ignore */ });
		proc.on('error', () => resolve([]));
		proc.on('close', () => {
			const sessions: ClaudeSession[] = [];
			for (const line of out.split('\n')) {
				const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
				if (!m) { continue; }
				const pidStr = m[1];
				const rssStr = m[2];
				const age = m[3];
				const cmd = m[4];
				if (!pidStr || !rssStr || !age || !cmd) { continue; }
				if (!/claude/i.test(cmd)) { continue; }
				if (/grep|ram-guard|ps -eo/i.test(cmd)) { continue; }
				const pid = Number(pidStr);
				const meta = readSessionMeta(pid);
				sessions.push({
					pid,
					rssMb: Number(rssStr) / 1024,
					age,
					command: cmd,
					sessionId: meta.sessionId,
					cwd: meta.cwd,
					status: meta.status,
				});
			}
			sessions.sort((a, b) => b.rssMb - a.rssMb);
			resolve(sessions);
		});
	});
}

function readSessionMeta(pid: number): { sessionId?: string; cwd?: string; status?: string } {
	const dir = path.join(os.homedir(), '.claude', 'sessions');
	try {
		const byPid = path.join(dir, `${pid}.json`);
		if (fs.existsSync(byPid)) {
			const j = JSON.parse(fs.readFileSync(byPid, 'utf8')) as SessionMeta;
			return {
				sessionId: j.sessionId ?? j.session_id,
				cwd: j.cwd ?? j.projectDir,
				status: j.status,
			};
		}
	} catch { /* ignore */ }
	return {};
}

interface SessionMeta {
	sessionId?: string;
	session_id?: string;
	cwd?: string;
	projectDir?: string;
	status?: string;
	pid?: number;
}

function shortDir(d?: string): string {
	if (!d) { return '(unknown dir)'; }
	return path.basename(d.replace(os.homedir(), '~')) || d;
}

function alive(pid: number): boolean {
	try { process.kill(pid, 0); return true; } catch { return false; }
}

async function scanInterrupted(silentIfNone: boolean): Promise<void> {
	const dir = path.join(os.homedir(), '.claude', 'sessions');
	let files: string[];
	try { files = fs.readdirSync(dir); } catch { return; }
	const interrupted: { sessionId?: string; cwd?: string; pid: number }[] = [];
	for (const f of files) {
		if (!f.endsWith('.json')) { continue; }
		try {
			const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as SessionMeta;
			const pid = typeof j.pid === 'number' ? j.pid : Number(f.replace(/\.json$/, ''));
			if (j.status === 'busy' && pid > 0 && !alive(pid)) {
				interrupted.push({ sessionId: j.sessionId, cwd: j.cwd ?? j.projectDir, pid });
			}
		} catch { /* skip */ }
	}
	if (interrupted.length === 0) {
		if (!silentIfNone) {
			void vscode.window.showInformationMessage('Ursula RAM Guard: no interrupted Claude sessions found.');
		}
		return;
	}
	const labels = interrupted.map(s => `${shortDir(s.cwd)} — resume`);
	const choice = await vscode.window.showWarningMessage(
		`Ursula found ${interrupted.length} Claude session(s) interrupted mid-turn. The chats are safe on disk — resume one?`,
		...labels,
	);
	if (!choice) { return; }
	const idx = labels.indexOf(choice);
	if (idx < 0) { return; }
	const s = interrupted[idx];
	resumeInTerminal(s.cwd, s.sessionId);
}

function resumeInTerminal(cwd: string | undefined, sessionId: string | undefined): void {
	const target = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
	const term = vscode.window.createTerminal({ name: 'Claude resume', cwd: target });
	term.show();
	term.sendText(sessionId ? `claude --resume ${sessionId}` : 'claude --resume', true);
}

async function showDashboard(): Promise<void> {
	const r = await getSystemRam();
	const sessions = await listClaudeSessions();
	if (sessions.length === 0) {
		void vscode.window.showInformationMessage(
			`RAM ${r.usedGb.toFixed(1)}/${r.totalGb.toFixed(0)} GB (${r.usedPct.toFixed(0)}%) — ${r.freeMb.toFixed(0)} MB free. No Claude sessions running.`,
		);
		return;
	}
	interface PickItem extends vscode.QuickPickItem { session: ClaudeSession; }
	const items: PickItem[] = sessions.map(s => ({
		label: `$(terminal) ${shortDir(s.cwd)}`,
		description: `${s.rssMb.toFixed(0)} MB · ${s.age}`,
		detail: `pid ${s.pid}${s.status ? ` · ${s.status}` : ''} · ${s.cwd || 'no cwd'}${s.sessionId ? ` · ${s.sessionId.slice(0, 8)}` : ''}`,
		session: s,
	}));
	const pick = await vscode.window.showQuickPick(items, {
		placeHolder: `RAM ${r.usedGb.toFixed(1)}/${r.totalGb.toFixed(0)} GB · ${r.usedPct.toFixed(0)}% used · ${sessions.length} sessions — pick one to manage`,
	});
	if (!pick) { return; }
	const s = pick.session;
	const action = await vscode.window.showQuickPick(
		[
			'Free RAM now — closes the session (chat is safe on disk)',
			'Copy `claude --resume` command',
			'Reveal transcript in Finder',
			'Cancel',
		],
		{ placeHolder: `${shortDir(s.cwd)} — ${s.rssMb.toFixed(0)} MB · pid ${s.pid}` },
	);
	if (!action || action === 'Cancel') { return; }
	if (action.startsWith('Kill')) {
		try { process.kill(s.pid, 'SIGTERM'); } catch { /* already gone */ }
		void vscode.window.showInformationMessage(
			`Closed Claude pid ${s.pid} (RAM freed). Chat is safe — resume with: claude --resume${s.sessionId ? ' ' + s.sessionId : ''}`,
		);
	} else if (action.startsWith('Copy')) {
		void vscode.env.clipboard.writeText(`claude --resume${s.sessionId ? ' ' + s.sessionId : ''}`);
		void vscode.window.showInformationMessage('Copied resume command to clipboard.');
	} else if (action.startsWith('Reveal')) {
		revealTranscript(s);
	}
}

function revealTranscript(s: ClaudeSession): void {
	const base = path.join(os.homedir(), '.claude', 'projects');
	if (s.sessionId) {
		const found = findTranscript(base, s.sessionId);
		if (found) { void vscode.env.openExternal(vscode.Uri.file(found)); return; }
	}
	if (s.cwd) {
		const folder = path.join(base, s.cwd.replace(/\//g, '-'));
		if (fs.existsSync(folder)) { void vscode.env.openExternal(vscode.Uri.file(folder)); return; }
	}
	void vscode.env.openExternal(vscode.Uri.file(base));
}

function findTranscript(base: string, sessionId: string): string | undefined {
	try {
		for (const dir of fs.readdirSync(base)) {
			const p = path.join(base, dir, `${sessionId}.jsonl`);
			if (fs.existsSync(p)) { return p; }
		}
	} catch { /* ignore */ }
	return undefined;
}
