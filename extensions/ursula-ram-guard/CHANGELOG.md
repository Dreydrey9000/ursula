# Changelog — Ursula RAM Guard

## [2026-06-20]

### Added
- Bone+Gold webview dashboard (`ursula.ramGuard.openPanel`): RAM gauge (green/amber/red at 75/88), compressor-pressure bar, VRAM/GPU readout, per-session cards (Free/Resume/Reveal), interrupted-sessions strip, "Free the biggest hog", and the "Your chat is safe on disk — resume anytime" reassurance copy. Why: RAM safety is the #1 product goal and needed a real visual surface, not a QuickPick drill-down.
- Hardware-aware recommendation: detects GPU/VRAM via `system_profiler SPDisplaysDataType` (spawned once, cached) and recommends a mode by RAM tier — Apple Silicon judged by RAM (unified memory is not a weak GPU), discrete weighted by VRAM. Surfaces a "Recommended for your Mac" card + "Optimize now" button that runs `ursula.mode.lite`. Why: Ursula should tune itself to the machine.
- `ursula.optimizer.mode` setting (`recommend`/`auto`/`off`, default `recommend`) + `ursula.optimizer.setMode` command. `auto` applies Lite once on a weak machine; `recommend` shows the badge; `off` does nothing. Why: Drey wanted recommend-vs-auto to be the user's call.
- Ursula Sessions rail: movable `ursulaSessions` TreeView in its own activity-bar container, listing live + interrupted Claude sessions with inline Resume/Reveal/Free actions. Reuses the existing scan. Why: sessions become first-class, always-visible citizens in every mode.

### Changed
- Status-bar pill command repointed from `ursula.ramGuard.show` to `ursula.ramGuard.openPanel` (pill = glance, panel = deep view). `ursula.ramGuard.show` kept as an alias so nothing breaks.
- Live updates ride the ONE existing poll tick (snapshot + `postMessage` + rail refresh + auto-optimize); no second `setInterval`, no second scanner. The GPU probe runs once at activation, never on the tick.

### Fixed
- "Free RAM now" dead-branch bug: the handler tested `action.startsWith('Kill')` against a label that never started with "Kill", so freeing RAM silently did nothing. Deleted the dead QuickPick path with the webview migration. Why: RAM safety, the #1 goal, was regressed.
- Kill now re-validates the pid against the current sessions snapshot (pid AND cwd match) before `process.kill` SIGTERM, so a stale webview can never SIGTERM a recycled/unrelated pid.

### Removed
- `showDashboard()` QuickPick drill-down (replaced by the webview panel).
