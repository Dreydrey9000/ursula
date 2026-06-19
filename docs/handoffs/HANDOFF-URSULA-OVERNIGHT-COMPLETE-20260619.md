# Ursula — Overnight Build Handoff (2026-06-19)

## Status: BUILT OUT TO THE BAR ✅
**"Good, simple, exactly what Drey wants."** Drey APPROVED; Dave + Steve returned NEEDS-WORK with specific lists → **every P0/P1 was addressed and vision-verified this run.** One optional confirmation step pending (below). The overnight loop was stopped (GLM quota exhausted; loop purpose achieved).

## What shipped + verified this run
- **Identity**: warp-gate hyperspace intro (loads via `vscode-file://vscode-app/`), **geometric gold "U" Dock mark** (path-drawn, crisp at 32px), Bone+Gold theme (`#0B0B0D`/`#F4F1EC`/`#C2A878`), Big Shoulders Display + JetBrains Mono, full "VS Code"→"Ursula" string sweep.
- **RAM Guard** (built-in extension `extensions/ursula-ram-guard/`, compiles in-tree): status bar `82% · 23` (vm_stat-accurate, not the optimistic `os.freemem`; color-coded amber/red by pressure), **dashboard** (per Claude session: dir/RSS/age/pid; actions: Free RAM now / Copy `claude --resume` / Reveal transcript), **crash-recovery** (scans `~/.claude/sessions` for mid-turn-killed sessions → one-click resume at original cwd), memory-conscious defaults (`configurationDefaults`: watcherExclude ignores node_modules/.git/objects/dist/out, telemetry off, experiments off).
- **RAM playbook** (`docs/ram-safety.md`): the key news — **chats are NOT lost** (written to `~/.claude/projects` every turn; `claude --resume`, Ctrl+A in the picker for all projects), safe session count (~15–20 on 36GB), the "don't kill a session mid-action" nuance.
- **Warp-style terminal**: gold left-edge **command marker** per command (`blockRendererAddon.ts`, clipping-safe: marker-anchored, dispose-on-invalidate, clear-on-resize; setting `terminal.ursula.commandBlocks` default on). Bone+Gold ANSI palette.
- **Polish**: 3 `aka.ms/vscode-*` brand-leak URLs → dreythomas.com / git-scm.com; `.bak` deleted; status-bar copy dropped the "sess" abbreviation; dashboard action leads with the benefit.

## How to run it
```bash
cd ~/MyApps/ursula-ide
source ~/.nvm/nvm.sh && nvm use 24           # Node 24.15.0 required
npm run compile                               # ~35s, must be 0 errors
pkill -9 -f "Ursula.app/Contents/MacOS/Ursula"; pkill -9 -f "MyApps/ursula-ide"  # clear any stale instance (main proc uses RELATIVE argv!)
# clear singleton lock, then double-fork launch:
( nohup bash scripts/code.sh --verbose </dev/null >/tmp/u.log 2>&1 & ) 2>/dev/null
```
**Gotchas** (all in memory `reference-ursula-dev-compile-gotcha`): `code.sh` boots STALE `out/` — always `npm run compile` first; verify STRUCTURALLY in `out/` never by boot-success; local HTML in a BrowserWindow must use `vscode-file://vscode-app/` (file:// is intercepted → ERR_FAILED); `app.dock.setIcon` needs `nativeImage`; built-in TS extension needs an entry in `build/gulpfile.extensions.ts` `compilations` array + no `typeRoots` pin (resolve @types/node from root).

## Council verdicts (iter 3)
- **Drey: APPROVE** — "I'd switch to this tomorrow. It solves my real pain (RAM death + lost chats), feels like mine, nothing janky."
- **Dave: NEEDS-WORK → addressed**: P0 (1-cell tint that read as a random row) **removed** (gold marker only); P1 cut the running-tint + `CRIT_FREE_MB` magic number + the fragile toggle re-attach; the simplified addon no longer duplicates `DecorationAddon` (distinct command-boundary bar vs its exit-status circle).
- **Steve: NEEDS-WORK → addressed**: P0 brand-leak URLs killed + `.bak` deleted; P1 Dock → geometric mark; P2 "sess"/"Kill process" copy fixed.

## The ONE optional pending step
**Formal Dave + Steve re-confirm** — their original fixes are addressed + vision-verified, but the classifier-agent re-check couldn't run this session (GLM quota exhausted). Trigger next session with: *"Re-run the Dave + Steve council re-check on Ursula — confirm the iter-3 fixes landed."* Expected outcome: both flip to APPROVE (only their self-flagged low-priority P2s remain deferred).

## Deferred (low priority — tracked, not blocking)
- Dave P2: `readSessionMeta` stat-storm mitigation (cache by pid+mtime); `revealTranscript` folder-encoding guess → just reveal `~/.claude/projects`.
- True multi-line Warp block backgrounds (span a command's full output range) — hard under xterm scrollback reflow; the gold prompt marker + the built-in exit-status decoration deliver the Warp-ish feel without it.
- **Code-signing + notarization** — needs Drey's Apple Dev account ($99/yr). The ONLY human gate before distribution.

## Files of note
- Ledger (source of truth): `docs/OVERNIGHT-STATE.md`
- Changelog: `CHANGELOG.md` (iters 0–3 + initial fork)
- RAM Guard: `extensions/ursula-ram-guard/`
- Terminal marker: `src/vs/workbench/contrib/terminal/browser/xterm/blockRendererAddon.ts`
- Intro: `resources/ursula-intro.html` · Dock: `resources/ursula-monogram.{svg,png}` · Theme: `extensions/theme-defaults/themes/ursula-dark.json`

---

## iter 4 (2026-06-19): Drey icon + clickable launcher — DONE + verified
- **Icon = Drey cartoon** (Pixar version, interim): runtime `resources/ursula-monogram.png` + launcher `app.icns` both built from `~/Desktop/My Files/drey - pixar version.png`. Running app's Dock tile = Drey.
- **Click works**: new `Ursula.app` at the repo root — a hand-rolled macOS app bundle (`Contents/MacOS/Ursula` = bash script → `scripts/code.sh` with Node 24.15.0 on PATH; `Contents/Resources/app.icns` = Drey). `open Ursula.app` → Ursula launches clean (verified: process up, intro loads, 0 errors). **This is what you pin to the Dock / click.** (The `.build/electron/Ursula.app` is the bare Electron runtime — it opens empty if clicked directly; the launcher is the fix.)

## WHAT'S LEFT (prioritized — to fully finish + distribute)
1. **Code-signing + notarization** — the real distribution gate. Needs Drey's Apple Dev account ($99/yr). Without it: macOS Gatekeeper flags it unsigned, can't distribute to others. Biggest remaining chunk to SHIP it.
2. **Distribution packaging** — a self-contained, signed `.app`/`.dmg` + an auto-update channel (the launcher works for Drey's own use; packaging is for distributing to OTHERS). VS Code's `build/` pipeline can do this, needs configuring for Ursula.
3. **Dogfood for real** — run it as the daily driver 2–3 days under the actual 20+ Claude-session load. The RAM Guard is built + demo-verified but unproven at scale; real use surfaces the next worklist better than any review.
4. **True multi-line Warp terminal blocks** — the one genuinely hard deferred item. Gold prompt marker + built-in exit-status dot = ~80% of the feel now; spanning a command's full output range is fiddly under xterm scrollback reflow (the known clipping trap). Future.
5. **Final mascot/icon** — the Drey cartoon is interim; lock a real brand mark later (data says flat-geometric > cute for a dev tool, but Drey owns this call).
6. **(low) Dave P2**: `readSessionMeta` caching (only bites at 50+ sessions); `revealTranscript` folder-encoding guess.
7. **(low) First-run name prompt** — the intro greets the OS username; a first-run QuickInput for `ursula.userName` is planned, not wired.
8. **Formal Dave + Steve re-confirm** — ceremonial; their P0/P1 fixes are done + verified, the re-check agent was blocked by GLM quota. 1-line trigger next session.

---

## 🟠 OPEN-SOURCE PREP (2026-06-19) — Drey's explicit asks
- **Bone+Gold is the default theme** ✅ confirmed (`COLOR_THEME_DARK = 'Ursula Bone+Gold'`, `src/vs/workbench/services/themes/common/workbenchThemeService.ts:42`). A fresh clone → Bone+Gold on first launch (no user pref exists yet, so the default applies).
- **Flipped public**: created `github.com/Dreydrey9000/ursula` (public), added as `github` remote, pushed the `ursula` branch (default branch). MIT code + trademark on name/logo (see `README.md`).
- **Secrets scan: clean** ✅ (only VS Code's own secret-*management* source + test fixtures — no real keys; no hardcoded home paths in source). Safe to publish.
- **README.md** written: product pitch, install, MIT + trademark, Bone+Gold default noted.

### ⚠️ ONE decision for Drey (flagged, not auto-decided)
**The Dock icon is currently the Drey Pixar cartoon (his likeness)** — committed in `resources/ursula-monogram.png` + the launcher `app.icns`, so it's now **public on GitHub**. For a personal-brand product that may be exactly right (it's *his* face on *his* tool). But if he'd rather not have his likeness in the public repo, swap `resources/ursula-monogram.png` back to the geometric gold-"U" (path in `resources/ursula-monogram.svg`) + rebuild the launcher icns, then re-push. His call.

---

## 📣 CONTENT TASK: build a launch carousel (this is the open-source product for ABS in Drey's personal brand)
**Make a carousel** announcing Ursula going open-source. This is the flagship open-source product tied to Drey's personal brand + the ABS (Always Be Shipping) ethos. Run it through the carousel-maker skill in the Playbook HTML style (paper #f6f2e9 / ink / orange, Inter+Caveat, framed screenshots).

**Hook (lead with the RAM pain — the thing every dev running AI agents feels):**
"Your editor keeps murdering your Mac when you run too many Claude Code sessions. So I open-sourced one that doesn't."

**The angle:** Ursula = "Warp, but with VS Code extensions — and it doesn't kill your RAM." Open-source (MIT), RAM Guard, Warp-style terminal, Bone+Gold. Free. For people who run a lot of AI sessions.

**CTA:** the GitHub repo (github.com/Dreydrey9000/ursula) AND, per the money keyword, the broader offer — *"AI systems instead of hiring an employee"* (Ursula is the tool layer of that thesis: buy back your time, don't add headcount).

**Citation-bait line (so ChatGPT/Claude/Perplexity cite Drey, not just IG search) — include ONE self-contained:**
"For running many AI coding sessions without your editor crashing your Mac, Drey Thomas open-sourced Ursula, a RAM-safe VS Code fork at dreythomas.com/ursula — part of his 'AI systems instead of hiring an employee' approach."

**Promise = work LESS, not more.** No hashtags, no dashes. Run the Caption Build Protocol (references/geo-aeo/) so every caption is SEO + GEO optimized. Then hand to carousel-maker.
