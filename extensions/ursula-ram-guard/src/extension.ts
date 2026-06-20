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

// --- RAM Guard v2 module state (single source of truth; fed by the ONE existing tick) ---

interface GpuInfo {
	readonly model: string;          // e.g. "Apple M3 Pro" | "Intel Iris Plus 640"
	readonly integrated: boolean;    // Apple Silicon GPU or "Intel/integrated" in the model line
	readonly vramMb: number | null;  // discrete VRAM in MB; null on Apple Silicon (shared/unified memory)
}

let gpuInfo: GpuInfo | undefined;          // cached once at activation; system_profiler is slow (~1-2s), never poll it
let lastSessions: ClaudeSession[] = [];    // snapshot from the last tick — used for kill re-validation + the rail
let lastRamTotalGb = 0;                     // RAM signal for the hardware recommendation
let panel: vscode.WebviewPanel | undefined; // the Bone+Gold dashboard (reveal-don't-stack)
let hasAutoOptimizedThisSession = false;    // optimizer "auto" guard — apply Lite at most once per session

// The Ursula Sessions rail fires off this emitter on every tick (no second scanner).
const sessionsTreeEmitter = new vscode.EventEmitter<void>();

function optimizerMode(): 'recommend' | 'auto' | 'off' {
	return vscode.workspace.getConfiguration('ursula.optimizer').get<'recommend' | 'auto' | 'off'>('mode', 'recommend');
}

export function activate(context: vscode.ExtensionContext): void {
	const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	status.name = 'Ursula RAM Guard';
	status.command = 'ursula.ramGuard.openPanel'; // pill = glance → opens the deep-view panel
	status.show();
	context.subscriptions.push(status);

	// One-time hardware probe — GPU doesn't change at runtime, so never put this on the tick.
	void detectGpu().then(info => { gpuInfo = info; if (panel) { pushToPanel(); } });

	const tick = (): void => { void updateStatusBar(status); };
	tick();
	const pollMs = Math.max(2, vscode.workspace.getConfiguration('ursula.ramGuard').get<number>('pollSeconds', 5)) * 1000;
	const timer = setInterval(tick, pollMs);
	context.subscriptions.push({ dispose: (): void => clearInterval(timer) });

	// The movable Ursula Sessions rail — reuses the SAME scan, no second scanner.
	const sessionsProvider = new SessionsProvider();
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('ursulaSessions', sessionsProvider),
		sessionsTreeEmitter,
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('ursula.ramGuard.openPanel', (): void => { void openDashboardPanel(context); }),
		vscode.commands.registerCommand('ursula.ramGuard.show', (): void => { void openDashboardPanel(context); }), // keep alias alive
		vscode.commands.registerCommand('ursula.ramGuard.scanInterrupted', (): void => { void scanInterrupted(false); }),
		vscode.commands.registerCommand('ursula.optimizer.setMode', async (): Promise<void> => { await pickOptimizerMode(); }),
		// Hardware bridge for the modes contribution — cross-extension calls go over the command bus, not JS imports.
		vscode.commands.registerCommand('ursula.ramGuard.getHardware', () => ({
			recommended: getRecommendedMode(),
			optimizerMode: optimizerMode(),
			gpuAccel: getDetectedGpuAccel(),
		})),
		// Focus the Sessions rail (alias to the view's auto-generated focus command) — Cate mode startup uses this.
		vscode.commands.registerCommand('ursula.sessions.focus', (): void => { void vscode.commands.executeCommand('ursulaSessions.focus'); }),
		// Row actions for the Sessions rail (clicking the item reveals; buttons invoke these).
		vscode.commands.registerCommand('ursula.sessions.resume', (item?: SessionNode): void => {
			if (item?.session) { resumeInTerminal(item.session.cwd, item.session.sessionId); }
		}),
		vscode.commands.registerCommand('ursula.sessions.reveal', (item?: SessionNode): void => {
			if (item?.session) { revealTranscript(item.session); }
		}),
		vscode.commands.registerCommand('ursula.sessions.free', (item?: SessionNode): void => {
			if (item?.session) { killSessionRevalidated(item.session.pid, item.session.cwd); }
		}),
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

// --- Hardware detection (VRAM/GPU) — mirrors the getSystemRam spawn pattern, run ONCE ---

function detectGpu(): Promise<GpuInfo> {
	return new Promise(resolve => {
		if (process.platform !== 'darwin') { resolve({ model: 'unknown', integrated: true, vramMb: null }); return; }
		const proc = spawn('system_profiler', ['SPDisplaysDataType']);
		proc.stdout.setEncoding('utf8');
		let out = '';
		proc.stdout.on('data', (d: string) => { out += d; });
		proc.stderr.on('data', () => { /* ignore */ });
		proc.on('error', () => resolve({ model: 'unknown', integrated: true, vramMb: null })); // safe-low default
		proc.on('close', () => {
			try { resolve(parseDisplays(out)); } catch { resolve({ model: 'unknown', integrated: true, vramMb: null }); }
		});
	});
}

function parseDisplays(out: string): GpuInfo {
	const modelMatch = out.match(/Chipset Model:\s*(.+)/);
	const model = modelMatch ? modelMatch[1].trim() : 'unknown';
	// VRAM line is present on machines with discrete/dedicated VRAM; absent on Apple Silicon (unified memory).
	const vramMatch = out.match(/VRAM \((?:Total|Dynamic, Max)\):\s*(\d+)\s*(MB|GB)/i);
	let vramMb: number | null = null;
	if (vramMatch) {
		const n = Number(vramMatch[1]);
		vramMb = /gb/i.test(vramMatch[2]) ? n * 1024 : n;
	}
	// Apple Silicon (unified memory) or Intel/integrated chips count as "integrated".
	const integrated = /apple|intel|integrated/i.test(model) || vramMb === null;
	return { model, integrated, vramMb };
}

// --- Hardware-aware recommendation (Apple-Silicon-aware — unified memory is NOT a weak GPU) ---

export function getDetectedGpuAccel(): 'off' | 'auto' {
	if (!gpuInfo) { return 'off'; }
	if (gpuInfo.integrated && gpuInfo.vramMb !== null) { return 'off'; }     // Intel-integrated (has a VRAM line) → off
	if (gpuInfo.vramMb !== null && gpuInfo.vramMb < 2048) { return 'off'; }  // <2GB discrete → off
	return 'auto';                                                            // Apple Silicon (vramMb null) or healthy discrete → auto
}

export function getRecommendedMode(): 'lite' | 'terax' | undefined {
	if (optimizerMode() === 'off') { return undefined; }   // optimizer off → no recommendation at all
	if (!lastRamTotalGb) { return undefined; }             // no reading yet → no badge

	// Apple Silicon: unified memory, fast integrated GPU — judge by RAM only, never by "no VRAM line".
	const appleSilicon = !!gpuInfo?.integrated && gpuInfo?.vramMb === null;
	if (appleSilicon) {
		return lastRamTotalGb <= 16 ? 'lite' : 'terax'; // ≤16GB Apple Silicon is memory-tight → Lite; 24GB+ → Terax
	}
	// Intel / discrete machines:
	const weakRam = lastRamTotalGb <= 8;
	const tightRam = lastRamTotalGb <= 16 && !!gpuInfo?.integrated; // 16GB on Intel-integrated is still tight
	const weakGpu = !!gpuInfo?.integrated || (gpuInfo?.vramMb !== null && (gpuInfo?.vramMb ?? 0) < 2048);
	return (weakRam || tightRam || weakGpu) ? 'lite' : 'terax';
}

// Kill a session ONLY if the pid is still present in this tick's snapshot AND its cwd matches —
// never blindly SIGTERM a pid posted by a (possibly stale) webview; the OS may have recycled it.
function killSessionRevalidated(pid: number, cwd?: string): void {
	const live = lastSessions.find(s => s.pid === pid && s.cwd === cwd);
	if (!live) {
		void vscode.window.showInformationMessage('That Claude session is no longer running (already freed).');
		return;
	}
	try { process.kill(live.pid, 'SIGTERM'); } catch { /* already gone */ }
	void vscode.window.showInformationMessage(
		`Closed Claude pid ${live.pid} (RAM freed). Your chat is safe on disk — resume with: claude --resume${live.sessionId ? ' ' + live.sessionId : ''}`,
	);
}

async function updateStatusBar(status: vscode.StatusBarItem): Promise<void> {
	const [r, sessions] = await Promise.all([getSystemRam(), listClaudeSessions()]);

	// --- RAM Guard v2: feed the shared state off the ONE existing timer (no second scan) ---
	lastSessions = sessions;            // snapshot for kill re-validation + the rail
	lastRamTotalGb = r.totalGb;         // feed the hardware recommendation
	sessionsTreeEmitter.fire();         // refresh the Ursula Sessions rail
	if (panel) { pushToPanel(r, sessions); }
	maybeAutoOptimize(r);               // optimizer "auto": apply Lite once on a weak machine

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
			void vscode.commands.executeCommand('ursula.ramGuard.openPanel');
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

interface InterruptedSession { sessionId?: string; cwd?: string; pid: number; }

// Enumerate sessions that died mid-turn (status "busy" but pid no longer alive).
// Reads ~/.claude/sessions/*.json — the SAME place listClaudeSessions reads metadata.
function listInterrupted(): InterruptedSession[] {
	const dir = path.join(os.homedir(), '.claude', 'sessions');
	let files: string[];
	try { files = fs.readdirSync(dir); } catch { return []; }
	const interrupted: InterruptedSession[] = [];
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
	return interrupted;
}

async function scanInterrupted(silentIfNone: boolean): Promise<void> {
	const interrupted = listInterrupted();
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

// =================================================================================
// RAM Guard v2 — Bone+Gold webview dashboard
// =================================================================================

function nonceStr(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let s = '';
	for (let i = 0; i < 32; i++) { s += chars.charAt(Math.floor(Math.random() * chars.length)); }
	return s;
}

async function openDashboardPanel(context: vscode.ExtensionContext): Promise<void> {
	if (panel) { panel.reveal(); pushToPanel(); return; }
	panel = vscode.window.createWebviewPanel(
		'ursulaRamGuard',
		'RAM Guard',
		vscode.ViewColumn.Active,
		{ enableScripts: true, retainContextWhenHidden: false }, // don't pin the DOM/JS heap — it repaints from the tick
	);
	context.subscriptions.push(panel);
	panel.onDidDispose(() => { panel = undefined; });
	panel.webview.onDidReceiveMessage((msg: { type?: string; pid?: number; cwd?: string; sessionId?: string }) => {
		switch (msg.type) {
			case 'kill':
				// RE-VALIDATE against the CURRENT snapshot (pid AND cwd) — never trust a pid from the webview.
				if (typeof msg.pid === 'number') { killSessionRevalidated(msg.pid, msg.cwd); }
				break;
			case 'killHog': {
				const hog = lastSessions[0]; // already sorted desc by RSS
				if (hog) { killSessionRevalidated(hog.pid, hog.cwd); }
				else { void vscode.window.showInformationMessage('No Claude sessions to free.'); }
				break;
			}
			case 'resume':
				resumeInTerminal(msg.cwd, msg.sessionId);
				break;
			case 'reveal': {
				// Reconstruct a minimal ClaudeSession for revealTranscript's lookup.
				const s = lastSessions.find(x => x.pid === msg.pid && x.cwd === msg.cwd);
				revealTranscript(s ?? { pid: msg.pid ?? 0, rssMb: 0, age: '', command: '', cwd: msg.cwd, sessionId: msg.sessionId });
				break;
			}
			case 'optimize':
				void vscode.commands.executeCommand('ursula.mode.lite'); // "Optimize now" → apply Lite (CONTRACT with A)
				break;
		}
	});
	panel.webview.html = renderHtml();
	pushToPanel();
}

// Push the latest snapshot to the webview. Reuses whatever the tick last computed when args are omitted.
function pushToPanel(r?: RamInfo, sessions?: ClaudeSession[]): void {
	if (!panel) { return; }
	const useSessions = sessions ?? lastSessions;
	const ram = r ?? (lastRamTotalGb
		? { usedPct: 0, freeMb: 0, totalGb: lastRamTotalGb, usedGb: 0, compressorMb: 0 }
		: undefined);
	panel.webview.postMessage({
		ram,
		sessions: useSessions,
		interrupted: listInterrupted(),
		gpu: gpuInfo,
		recommended: getRecommendedMode(),
		optimizer: optimizerMode(),
	});
}

function renderHtml(): string {
	const nonce = nonceStr();
	// All live data arrives via postMessage; the template is static shell + the render() script.
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    /* Ursula is dark — warm near-black surfaces, light ink, gold accent. */
    --bg: #141310; --panel: #1E1B15; --fg: #ECE6D9; --ink: #20201E; --gold: #C2A878;
    --green: var(--vscode-charts-green, #6CC36C); --amber: #E0A23C; --red: var(--vscode-charts-red, #E0556F);
  }
  * { box-sizing: border-box; }
  body { background: var(--bg); color: var(--fg); font-family: var(--vscode-font-family, -apple-system, sans-serif);
         margin: 0; padding: 18px 20px; font-size: 13px; }
  h1 { font-size: 16px; margin: 0 0 2px; letter-spacing: .2px; color: var(--gold); }
  .sub { opacity: .65; font-size: 12px; margin-bottom: 16px; }
  .bar-wrap { margin: 6px 0 14px; }
  .bar-label { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
  .bar { height: 18px; background: rgba(255,255,255,.08); border-radius: 9px; overflow: hidden; }
  .bar.thin { height: 10px; }
  .fill { height: 100%; width: 0; transition: width .3s ease, background .3s ease; border-radius: 9px; }
  .card { background: var(--panel); border: 1px solid var(--gold); border-radius: 10px; padding: 12px 14px; margin: 10px 0; }
  .hw-verdict { font-weight: 600; }
  .badge { display: inline-block; background: var(--gold); color: var(--ink); border-radius: 6px;
           padding: 1px 8px; font-size: 11px; font-weight: 600; margin-left: 6px; }
  button { font-family: inherit; font-size: 12px; cursor: pointer; border: none; border-radius: 7px;
           padding: 6px 12px; }
  .gold-cta { background: var(--gold); color: var(--ink); font-weight: 600; font-size: 14px;
              padding: 10px 18px; width: 100%; }
  .gold-cta:hover { filter: brightness(1.08); }
  .hog { background: var(--red); color: #fff; font-weight: 600; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 10px;
         padding: 8px 10px; border: 1px solid rgba(255,255,255,.10); border-radius: 8px; margin: 6px 0; background: var(--panel); }
  .row .meta { min-width: 0; }
  .row .dir { font-weight: 600; }
  .row .det { opacity: .6; font-size: 11px; }
  .row .acts button { margin-left: 4px; background: rgba(194,168,120,.22); color: var(--fg); }
  .row .acts .free { background: rgba(224,85,111,.20); }
  .safe { opacity: .6; font-size: 11px; font-style: italic; margin-top: 2px; }
  .section-h { font-size: 12px; text-transform: uppercase; letter-spacing: .6px; opacity: .55; margin: 18px 0 4px; }
  .empty { opacity: .5; font-size: 12px; padding: 6px 2px; }
  .interrupted { border-color: var(--amber); }
</style>
</head>
<body>
  <h1>RAM Guard</h1>
  <div class="sub">Your chat is safe on disk — resume anytime.</div>

  <div class="bar-wrap">
    <div class="bar-label"><span>Memory used</span><span id="ramTxt">—</span></div>
    <div class="bar"><div id="ramFill" class="fill"></div></div>
  </div>

  <div class="bar-wrap">
    <div class="bar-label"><span>Compressor (true pressure)</span><span id="compTxt">—</span></div>
    <div class="bar thin"><div id="compFill" class="fill"></div></div>
  </div>

  <div id="hwCard" class="card" style="display:none">
    <div id="hwLine"></div>
    <div id="hwVerdict" class="hw-verdict" style="margin-top:6px"></div>
    <div id="optimizeWrap" style="margin-top:10px; display:none">
      <button id="optimizeBtn" class="gold-cta">Optimize now</button>
      <div id="optimizeSub" class="safe"></div>
    </div>
  </div>

  <button id="hogBtn" class="hog" style="width:100%; margin:10px 0; display:none">Free the biggest hog</button>

  <div class="section-h">Claude sessions</div>
  <div id="sessions"><div class="empty">No Claude sessions running.</div></div>

  <div class="section-h">Interrupted (died mid-turn)</div>
  <div id="interrupted"><div class="empty">None — all sessions accounted for.</div></div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function colorFor(pct){ return pct >= 88 ? 'var(--red)' : pct >= 75 ? 'var(--amber)' : 'var(--green)'; }

  function render(d){
    const ram = d.ram || {};
    const pct = typeof ram.usedPct === 'number' ? ram.usedPct : 0;
    document.getElementById('ramFill').style.width = Math.min(100, pct) + '%';
    document.getElementById('ramFill').style.background = colorFor(pct);
    document.getElementById('ramTxt').textContent =
      (ram.usedGb!=null ? ram.usedGb.toFixed(1) : '?') + ' / ' + (ram.totalGb!=null ? ram.totalGb.toFixed(0) : '?') + ' GB (' + pct.toFixed(0) + '%)';

    const totalGb = ram.totalGb || 0;
    const compPct = totalGb ? (ram.compressorMb || 0) / (totalGb*1024) * 100 : 0;
    document.getElementById('compFill').style.width = Math.min(100, compPct) + '%';
    document.getElementById('compFill').style.background = compPct >= 30 ? 'var(--red)' : 'var(--gold)';
    document.getElementById('compTxt').textContent = (ram.compressorMb!=null ? ram.compressorMb.toFixed(0) : '?') + ' MB (' + compPct.toFixed(0) + '%)';

    // Hardware card + optimizer CTA
    const hw = document.getElementById('hwCard');
    const opt = d.optimizer || 'recommend';
    if (opt === 'off') {
      // informational only — show detected hardware, no verdict/CTA
      if (d.gpu) {
        hw.style.display = '';
        document.getElementById('hwLine').textContent = hwLine(d.gpu, totalGb);
        document.getElementById('hwVerdict').textContent = '';
        document.getElementById('optimizeWrap').style.display = 'none';
      } else { hw.style.display = 'none'; }
    } else {
      hw.style.display = '';
      document.getElementById('hwLine').textContent = hwLine(d.gpu, totalGb);
      const rec = d.recommended;
      const vEl = document.getElementById('hwVerdict');
      vEl.innerHTML = rec ? ('Recommended for your Mac: ' + esc(rec[0].toUpperCase()+rec.slice(1)) + '<span class="badge">Recommended</span>') : '';
      const ow = document.getElementById('optimizeWrap');
      if (rec === 'lite') {
        ow.style.display = '';
        document.getElementById('optimizeSub').textContent = opt === 'auto'
          ? 'Lite auto-applied — tuned to this Mac. Switch back anytime.'
          : 'Applies Lite mode — tuned to this Mac. One click, reversible (switch back anytime).';
      } else { ow.style.display = 'none'; }
    }

    const sessions = d.sessions || [];
    document.getElementById('hogBtn').style.display = sessions.length ? '' : 'none';

    const sEl = document.getElementById('sessions');
    if (!sessions.length) { sEl.innerHTML = '<div class="empty">No Claude sessions running.</div>'; }
    else {
      sEl.innerHTML = sessions.map(s => {
        const d2 = 'data-pid="'+s.pid+'" data-cwd="'+esc(s.cwd||'')+'" data-sid="'+esc(s.sessionId||'')+'"';
        return '<div class="row"><div class="meta">'
          + '<div class="dir">'+esc(s.dir||shortDir(s.cwd))+'</div>'
          + '<div class="det">'+ (s.rssMb!=null ? s.rssMb.toFixed(0) : '?') +' MB · '+esc(s.age||'')+(s.status?' · '+esc(s.status):'')+'</div>'
          + '<div class="safe">Your chat is safe on disk — resume anytime.</div>'
          + '</div><div class="acts">'
          + '<button class="free" data-act="kill" '+d2+'>Free</button>'
          + '<button data-act="resume" '+d2+'>Resume</button>'
          + '<button data-act="reveal" '+d2+'>Reveal</button>'
          + '</div></div>';
      }).join('');
    }

    const interrupted = d.interrupted || [];
    const iEl = document.getElementById('interrupted');
    if (!interrupted.length) { iEl.innerHTML = '<div class="empty">None — all sessions accounted for.</div>'; }
    else {
      iEl.innerHTML = interrupted.map(s => {
        const d2 = 'data-pid="'+s.pid+'" data-cwd="'+esc(s.cwd||'')+'" data-sid="'+esc(s.sessionId||'')+'"';
        return '<div class="row interrupted"><div class="meta">'
          + '<div class="dir">'+esc(shortDir(s.cwd))+'</div>'
          + '<div class="det">interrupted mid-turn · pid '+s.pid+'</div>'
          + '<div class="safe">Your chat is safe on disk — resume anytime.</div>'
          + '</div><div class="acts"><button data-act="resume" '+d2+'>Resume</button></div></div>';
      }).join('');
    }
  }

  function shortDir(c){ if(!c) return '(unknown dir)'; const p=c.split('/').filter(Boolean); return p.length?p[p.length-1]:c; }
  function hwLine(gpu, totalGb){
    const ram = totalGb ? totalGb.toFixed(0)+' GB RAM' : 'RAM ?';
    if (!gpu) return ram + ' · GPU detecting…';
    const v = gpu.vramMb == null ? 'shared memory' : (gpu.vramMb>=1024 ? (gpu.vramMb/1024).toFixed(0)+' GB VRAM' : gpu.vramMb+' MB VRAM');
    return ram + ' · ' + esc(gpu.model) + ' (' + (gpu.integrated?'integrated':'discrete') + ', ' + v + ')';
  }

  document.getElementById('optimizeBtn').addEventListener('click', () => vscode.postMessage({ type:'optimize' }));
  document.getElementById('hogBtn').addEventListener('click', () => vscode.postMessage({ type:'killHog' }));
  document.body.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    vscode.postMessage({ type: b.getAttribute('data-act'), pid: Number(b.getAttribute('data-pid')),
      cwd: b.getAttribute('data-cwd')||undefined, sessionId: b.getAttribute('data-sid')||undefined });
  });
  window.addEventListener('message', e => render(e.data));
</script>
</body>
</html>`;
}

// --- Optimizer toggle ---

async function pickOptimizerMode(): Promise<void> {
	const current = optimizerMode();
	interface OptItem extends vscode.QuickPickItem { value: 'recommend' | 'auto' | 'off'; }
	const items: OptItem[] = [
		{ value: 'recommend', label: 'Recommend', description: current === 'recommend' ? '(current)' : '', detail: 'Show a "Recommended for your Mac" badge + a one-click "Optimize now" button. You decide.' },
		{ value: 'auto', label: 'Auto', description: current === 'auto' ? '(current)' : '', detail: 'On a weak machine, apply Lite automatically once at startup. Reversible — switch back anytime.' },
		{ value: 'off', label: 'Off', description: current === 'off' ? '(current)' : '', detail: 'Never suggest or apply Lite. No badge, no auto-switch.' },
	];
	const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Ursula optimizer — how proactive should RAM Guard be?' });
	if (!pick) { return; }
	await vscode.workspace.getConfiguration('ursula.optimizer').update('mode', pick.value, vscode.ConfigurationTarget.Global);
	if (panel) { pushToPanel(); }
}

// "auto": apply Lite exactly once per session on a weak machine. Never fights the user mid-session.
function maybeAutoOptimize(_r: RamInfo): void {
	if (hasAutoOptimizedThisSession) { return; }
	if (optimizerMode() !== 'auto') { return; }
	if (getRecommendedMode() !== 'lite') { return; }
	hasAutoOptimizedThisSession = true;
	void vscode.commands.executeCommand('ursula.mode.lite').then(() => {
		void vscode.window.showInformationMessage('Lite auto-applied — tuned to this Mac. Switch modes anytime.');
	}, () => { /* command may not be registered yet (Agents window / load order) — ignore */ });
}

// =================================================================================
// Ursula Sessions rail — movable TreeView reusing the SAME scan (no second scanner)
// =================================================================================

class SessionNode extends vscode.TreeItem {
	constructor(
		public readonly session?: ClaudeSession,
		public readonly interrupted?: InterruptedSession,
	) {
		const cwd = session?.cwd ?? interrupted?.cwd;
		super(shortDir(cwd), vscode.TreeItemCollapsibleState.None);
		if (session) {
			this.description = `${session.rssMb.toFixed(0)} MB · ${session.age}${session.status ? ' · ' + session.status : ''}`;
			this.contextValue = 'ursulaSession';
			this.iconPath = new vscode.ThemeIcon('flame');
			this.tooltip = `${cwd || 'unknown dir'} · pid ${session.pid}\nYour chat is safe on disk — resume anytime.`;
			// Clicking the row reveals its transcript.
			this.command = { command: 'ursula.sessions.reveal', title: 'Reveal', arguments: [this] };
		} else if (interrupted) {
			this.description = 'interrupted — resume';
			this.contextValue = 'ursulaInterruptedSession';
			this.iconPath = new vscode.ThemeIcon('debug-restart');
			this.tooltip = `${cwd || 'unknown dir'} · died mid-turn · pid ${interrupted.pid}\nYour chat is safe on disk — resume anytime.`;
			this.command = { command: 'ursula.sessions.resume', title: 'Resume', arguments: [this] };
		}
	}
}

class SessionsProvider implements vscode.TreeDataProvider<SessionNode> {
	readonly onDidChangeTreeData = sessionsTreeEmitter.event;
	getTreeItem(el: SessionNode): vscode.TreeItem { return el; }
	getChildren(): SessionNode[] {
		const live = lastSessions.map(s => new SessionNode(s));
		const dead = listInterrupted().map(s => new SessionNode(undefined, s));
		return [...live, ...dead];
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
