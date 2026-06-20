# Terminal & Editor Modes Research — Mapping to Ursula

**Date:** 2026-06-20
**Purpose:** Synthesize research on Terax, Warp, Cursor, and Cate into a per-Ursula-mode design brief. Drey is building Ursula "modes" that each emulate one of these tools' feel and strengths — while every mode keeps FULL extension access.

---

## THE LOAD-BEARING CONSTRAINT (read this first)

**Every Ursula mode is a VS Code Profile.** All modes share ONE installed extension set via `useDefaultFlags.extensions = true`. That means switching modes NEVER removes or hides an extension. Claude Code, Kilo Code, and anything installed from Open VSX are available in every single mode — Terax, Warp, Cursor, Cate, and Lite alike. A "mode" only changes the look, the layout, the keybindings, and which AI surfaces are emphasized. It does not touch your extension inventory.

**Why this matters:** the real tools below each have a *narrow* extension story (Terax = no plugin API, Warp = MCP-only, Cursor = Open VSX + VSIX sideload, Cate = no plugin API). Ursula beats all of them on this one axis: because modes are Profiles over a shared extension host, Ursula gives you the *vibe* of each tool **plus** full, never-removed extension access. State this as a guarantee in every mode.

---

## 1. Terax (terax-ai)

**What it is:** A real, shipping open-source (Apache-2.0) "Agentic Development Environment" — terminal + code editor + AI agent side-panel + git + web preview fused into one ~7-8 MB Tauri app. By solo dev "crynta", ~7.2k stars, v0.8.1 (June 2026). NOT a from-scratch GPU terminal like Ghostty/Alacritty; its terminal core is xterm.js + WebGL (same web-stack approach as VS Code's terminal). Closest analogy: Warp (AI terminal) fused with Cursor (AI editor), but Tauri-light instead of Electron-heavy.

**How it works:** Two-process model glued by Tauri 2. The Rust backend (`src-tauri`) owns every PTY (pseudoterminal — the OS pipe that makes a program think it's talking to a real terminal) via the `portable-pty` crate and spawns shells. The React 19 + TypeScript + Vite + Tailwind v4 frontend renders the UI; output streams from Rust over a Tauri `Channel<PtyEvent>` into xterm.js, which paints to a WebGL canvas. Flow: `Shell → Rust portable-pty → Tauri IPC channel → xterm.js → WebGL canvas`. The tiny footprint comes from Tauri using the OS WebView instead of bundling Chromium, plus Rust doing the heavy lifting: ~7MB vs 400+MB Electron, ~300ms cold start, sub-ms keystroke latency.

**Signature features:**
- AI agent side-panel (agentic): plans, sub-agents, file read/write/edit/grep/glob, bash with approval gating, project memory via a `TERAX.md` file (like CLAUDE.md).
- AI Edit Diffs — every AI change reviewed inline, hunk-by-hunk, before it lands.
- Three agent personas: Coder, Architect, Code Reviewer. `/init` scans the workspace and writes a brief; `/plan` produces diffs.
- Massive BYOK provider list (OpenAI, Anthropic, Gemini, Groq, Grok, Cerebras, OpenRouter, DeepSeek, Mistral + any OpenAI-compatible endpoint) and fully local via LM Studio / MLX / Ollama.
- Multi-tab + split-pane terminals (each pane an independent PTY), WebGL-rendered xterm.js smooth at 200–50,000 lines scrollback.
- CodeMirror 6 editor with inline AI autocomplete and real Vim mode.
- Built-in git source control with a real commit graph (lane rendering), hunk-level stage/unstage, push with upstream awareness.
- Web preview pane that auto-detects local dev servers (Vite, Next, Astro).
- Voice input via Whisper, no telemetry, keys in OS keychain.

**Customization surfaces:**
- 10 bundled UI themes + in-app custom theme builder; independent editor themes.
- Background image with opacity + blur sliders.
- `TERAX.md` per-project file = project memory/config for the AI.
- Custom AI agents (your own system prompts + a chosen tool subset); global Custom Instructions.
- Snippets and "skills" = composable callable workflows.
- Vim mode + dotfile import.
- Settings → General: font family/size (8–32pt), letter spacing, scrollback buffer, WebGL renderer toggle.
- **Gap (UNVERIFIED):** no user-editable keybinding config file format or on-disk settings path was documented in sources reviewed — keybindings are documented as fixed shortcuts only.

**What makes it good:** Tiny + fast by architecture, not by trimming (Tauri OS-WebView + Rust). All-in-one (terminal + editor + agent + git graph + web preview) yet lighter than a single Electron terminal. AI is first-class AND safe — inline diff review + bash approval gating mean the agent can't silently mutate your repo. Local-first and private (BYOK or fully offline, no telemetry, keys in keychain). Provider-agnostic. Truly open (Apache-2.0), ~7.2k stars, active community.

**Extension model:** NO classic third-party plugin/extension marketplace. Extensibility is AI-and-config-shaped: (1) custom AI agents with scoped tools; (2) snippets/"skills" as callable workflows; (3) per-project `TERAX.md` memory; (4) in-app custom themes; (5) Vim dotfile import. "Extension access" in Terax means agent/workflow/theme customization, not a binary plugin API.

**Sources:** terax.app, terax.app/docs/features/terminal, github.com/crynta/terax-ai, github.com/crynta/terax-ai/blob/main/TERAX.md, betterstack.com/community/guides/ai/terax-ai, starlog.is, dibi8.com, piedpay.medium.com. UNVERIFIED: keybinding config file format + settings path (not documented); render API wording conflicted (official site/README say WebGL — treated as canonical — vs one Better Stack passage saying WebGPU).

---

## 2. Warp (warp.dev) — the AI-native terminal

**What it is:** A modern, GPU-accelerated terminal built from scratch in Rust. Big idea: stop treating the terminal as a dumb character grid — commands and their output become structured "blocks," the input line is a full IDE-style editor, and an AI agent is wired directly into the command line. macOS, Linux, Windows; free for individuals, paid team/enterprise.

**How it works:** Written entirely in Rust, renders its whole UI on the GPU via Metal (Vulkan/OpenGL/WebGPU planned for parity). The team rejected Electron and existing Rust UI frameworks and built their OWN UI framework ("building a browser") with Atom co-founder Nathan Sobo — primitive abstractions (rect, image, glyph) rendered in Metal via ~250 lines of shader code, composed up into snackbars, menus, blocks. Result: 1.9ms average redraw, 144+ FPS. The "blocks" model adds a semantic layer above the PTY: Warp uses shell hooks (`precmd`/`preexec`, native in zsh/fish, via bash-preexec for bash) plus a custom DCS (Device Control String) carrying encoded JSON metadata to know exactly where each command starts/ends — a SEPARATE grid per command+output instead of one shared grid. The input line is a true text editor backed by a SumTree (a Rope holding generic types, indexed on multiple dimensions), built as an operation-based CRDT for future real-time collaboration. Flow: `Shell hooks + DCS metadata → Warp parses into Blocks (input, output, exit code, timing) → GPU/Metal renders → AI agent reads that structured context`.

**Signature features:**
- **Blocks** — every command + output + exit code + timing is one discrete, selectable, copyable, shareable unit. The foundational feature everything builds on.
- IDE-style input editor — multiple cursors, selections, click-to-position, syntax highlighting, editor keybindings.
- Agent Mode — a full agentic coding agent inside the terminal that runs commands, reads errors, self-corrects in a loop; dedicated conversation view with model selection, voice input, image attachments.
- AI Command Suggestions — type `#`, describe in plain English, Warp generates the real command using your history, branch, exit codes, recent block I/O. Auto-suggests fixes for compiler errors and merge conflicts.
- Workflows — saved, parameterized command templates; reusable, versioned, shareable team primitives.
- Warp Drive — cloud-synced knowledge base in the terminal: saved commands, Workflows, interactive Notebooks (runbooks), shared prompts, synced env vars.
- Warpify subshells — extend the full Warp experience into SSH sessions and subshells (Docker, Python REPLs).
- MCP support — connect GitHub, DBs, Linear, Sentry, AWS, Slack, custom servers to Agent Mode.

**Customization surfaces:**
- Custom themes — YAML defining 16 ANSI colors (normal + bright) + accent/bg/fg in hex; Base16 supported.
- Keybindings/keysets — fully remappable, saved to `keybindings.yaml`; open-sourced default keysets + community presets (Vim/emacs flavors) in the `warpdotdev/keysets` repo.
- Documented settings reference; terminal and AI sides configured independently.
- Prompt customization — native Warp prompt (with "prompt chips") OR your own PS1 via `.zshrc`/`.bashrc`.
- Launch configurations — saved window/tab/pane layouts + startup commands.
- Vertical tabs + tab configs.
- Warpify subshell rules you can add.
- AI side — model choice, agent autonomy/permission level, default mode (Terminal vs Agent), all independent of appearance.
- Workflows + Warp Drive as a personal/team library.

**What makes it good:** Speed is real and measured (1.9ms redraw, 144+ FPS), not marketing. Blocks solve a decades-old pain — select/copy/re-run/share exactly one command's output without fishing through interleaved text, and that one structural decision makes navigation, sharing, and AI context all cleaner. The input editor closes the terminal/editor gap (click to move cursor, edit a long command like real text). AI is fed STRUCTURED context (blocks, branch, exit codes, history) so suggestions and the self-correcting agent are grounded in actual state — noticeably more accurate than bolting an LLM onto a normal terminal. Knowledge lives where the work happens (Warp Drive vs a wiki that rots). Sensible defaults with deep file-based config underneath. Cross-platform, free for individuals.

**Extension model:** NO traditional plugin/extension marketplace, no third-party UI-plugin API. Three pillars instead: (1) **MCP servers** = "plugins for the agent" (CLI-based servers Warp launches/manages, or URL-based servers via Streamable HTTP/SSE with custom headers + env vars) to give Agent Mode new tools/data; (2) open, file-based config (YAML themes, YAML keysets, launch configs, Warpify rules — shareable files); (3) Warp Drive Workflows/Notebooks/Prompts as shareable, versioned team primitives. Frame extensibility as "add tools to the agent (MCP) + own your config files," not "install plugins."

**Sources:** warp.dev/blog/how-warp-works, dev.to/warpdotdev/how-warp-works, starlog.is, warp.dev/warp-ai, warp.dev/ai, docs.warp.dev (agent/terminal modes, settings, all-settings, custom-themes, themes, prompt, customizing-warp), github.com/warpdotdev/keysets (+default-warp-keybindings.yaml), github.com/EmilyGraceSeville7cf/warp-keybindings, docs.warp.dev/terminal/warpify/subshells, warp.dev/blog (subshells, ps1), docs.warp.dev/agent-platform/capabilities/mcp, pulsemcp.com/clients/warp, deployhq.com/guides/warp, github.com/warpdotdev/warp/discussions/435, datacamp.com/tutorial/warp-terminal-tutorial.

---

## 3. Cursor (cursor.com) — AI-first code editor

**What it is:** A full fork of VS Code rebuilt around an AI-first workflow. Standalone desktop editor (not a plugin), so it keeps the entire VS Code experience — files, terminal, extensions, themes, keybindings, settings — while owning the whole UI and codebase index so AI is woven into every layer. As of June 2026 the line is Cursor 3.x with "Composer" as the flagship agentic model plus a proprietary Tab completion model; backends across OpenAI, Anthropic (Opus 4.8 / Claude), Google, xAI, and Cursor's own models.

**How it works:** Being a VS Code fork, it inherits Electron + the extension-host architecture and on first run imports your existing VS Code extensions, themes, keybindings, and `settings.json` directly. On top it adds: a codebase indexer that chunks the repo (syntax-aware), generates embeddings, and stores only embeddings + obfuscated path metadata in a cloud vector DB (Turbopuffer) — plaintext is uploaded temporarily to compute embeddings then discarded, never stored server-side. A Merkle tree of file hashes detects changes so it re-indexes only modified files (~every 10 min). That index powers `@Codebase` retrieval, Tab next-edit prediction, Cmd-K inline edits, and the Composer/Agent loop, all of which can call MCP servers and follow project Rules. Flow: `prompt → pull context (open files, @-symbols, index, rules) → route to chosen LLM → apply multi-file edits → review/accept`.

**Signature features:**
- Tab autocomplete — proprietary model predicting multi-line edits AND your *next* edit location.
- Cmd-K inline edit — select/place cursor, describe a change, get an in-place diff.
- Composer / Agent — multi-file agentic panel that creates files, edits across the project, runs terminal commands (background agents run async).
- @-context symbols — @file, @folder, @Codebase, @Docs, @Web, @Git.
- Codebase indexing — semantic embeddings + Merkle-tree incremental re-index.
- Rules system — `.cursor/rules/*.mdc` (and legacy `.cursorrules`), glob-scoped.
- MCP support; multi-model routing (272k-token context cited).

**Customization surfaces:** VS Code `settings.json` (imported); remappable keybindings (VS Code baseline); themes (import directly + Open VSX); extensions (Open VSX panel, VSIX drag-drop, `cursor --install-extension`); `.cursor/rules/*.mdc` + legacy `.cursorrules` + global "Rules for AI"; per-chat model selection; MCP server config; Privacy Mode toggle.

**What makes it good:** Keeps 100% of VS Code muscle memory (near-zero switching cost) — AI is additive. AI is integrated at editor level (Tab/Cmd-K/Composer share ONE codebase index + ONE context system) so suggestions are repo-aware not file-aware. Tab's next-edit prediction is a genuinely distinct UX win. Privacy-respecting indexing (embeddings + obfuscated paths only, plaintext discarded). Rules + MCP give clean file-based ways to steer AI and reach tools. Model-agnostic.

**Extension model:** Uses the Open VSX registry (not Microsoft's license-restricted VS Code Marketplace). Tradeoff: smaller catalog — "many popular VS Code extensions are available, but not all." Escape hatch: same VSIX packaging as VS Code, so anything can be sideloaded three ways — Command Palette → "Extensions: Install from VSIX...", drag-drop the `.vsix`, or `cursor --install-extension <path>`. Hard limit (NOT the install mechanism): MS-proprietary extensions (Pylance, official Remote-SSH, C# debugger) are license-locked to MS products and can't legally run regardless.

**Sources:** cursor.com/docs (extensions, kbd, rules), cursor.com/blog/secure-codebase-indexing, deployhq.com/guides/cursor, carlrannaberg.medium.com, rapidevelopers.com, medium.com/@raffazatyan, forum.cursor.com/t/install-extension-by-vsix, towardsdatascience.com (indexing), github.com/PatrickJS/awesome-cursorrules, datacamp.com/blog/cursor-vs-vs-code. UNVERIFIED: version numbers (Cursor 3.x / Composer 2.5) and model lineup (GPT-5.5, Opus 4.8, Gemini 3.1 Pro) from secondary summaries, not confirmed against cursor.com/changelog this session.

---

## 4. Cate (CATE v1.1.1) — Monaco-based, agent-native, infinite-canvas IDE

**What it is:** A desktop IDE that puts code editors, terminals, browsers, document viewers, and AI agent chats as free-floating panels on one infinite zoomable/pannable canvas (a spatial workspace, not stacked tabs). A whiteboard for your whole dev session. Built on the Monaco engine (same as VS Code) but its OWN app — NOT a VS Code fork — matching Drey's known setup. MIT, repo github.com/0-AI-UG/cate (~1.7k stars; repo at v1.3.1, Drey's installed build is v1.1.1). Bundle id `com.cate.app`, on-disk app name `cate`. Live build = warm near-black + orange `#e0683c` chrome, session-centric layout.

**How it works:** Electron 41 shell + React 18 UI + Zustand 5 state. Editors = Monaco 0.52; terminals = xterm.js 5.5 over node-pty 1.0 (real PTYs, so Claude Code CLI or the bundled Pi agent run as true shell processes); styling = Tailwind 3.4. Documents via pdf.js + mammoth; git via simple-git; file watching via chokidar. The in-app agent is Pi (`@earendil-works/pi`), a separate Node 22 daemon powering agent chat threads with per-chat model memory. Flow: `Canvas (Electron window) → panels (Monaco / xterm / browser / document / Pi chat) → each agent chat is a session that spawns/attaches its own terminal+context`; layout (panel positions, docking, zoom) auto-persists per project folder. On disk at `~/Library/Application Support/cate/`: `config.json` (settings + themes), `boot.json` (last theme + window geometry for instant cold-start), `pi-agent/auth.json` (provider creds), `TerminalLogs/`.

**Signature features:**
- Infinite zoomable/pannable canvas — panels float and dock spatially instead of as tabs (the core differentiator).
- Session-centric agent workflow: top session tabs + a left vertical session list with flame icons + status dots, so many concurrent agent runs sit side-by-side and you glance at which are live/working/idle (LIVE-observed; not in public docs).
- Rich status bar: model name, context % meter, CLAUDE.md/rules/MCP/hook counts, $ cost this-chat + today, 5h and 7d reset timers, "auto mode" indicator (LIVE-observed).
- In-app Pi agent, chat threads, per-chat model memory; connects Anthropic, OpenAI Codex, GitHub Copilot, Gemini, OpenRouter, Groq, Mistral, DeepSeek via OAuth or API key.
- Native xterm.js terminals over real node-pty — runs Claude Code or any CLI as a genuine shell.
- Monaco editors (multi-cursor, diffs, Markdown preview); document panels for PDF/DOCX/images.
- Per-project automatic layout/session restore.
- Native macOS tabs, command palette (Cmd+K), auto-layout (Cmd+Shift+L).
- ONE unified theming system recoloring app chrome + xterm terminal + Monaco editor from a single JSON object, with system light/dark auto-switch.

**Customization surfaces:** `config.json` (single settings + theme store); `customThemes` array + `activeThemeId` + `systemLightThemeId`/`systemDarkThemeId`; a theme = ONE JSON object styling chrome (surface-0..6, titlebar, canvas grid, borders, text, focus/accent, git, panel-* tints, agent-rgb/agent-light-rgb), the full 16-color xterm palette, and Monaco base + syntax tokens (validated against `theme.schema.json`); theme import via Settings → Appearance → Import…; editor/terminal settings (font size, minimap, scrollback, contrast, cursor blink, optionIsMeta, auto-suspend idle terminals); canvas settings (grid style lines/dots, snap, auto-focus, default panel size, zoom speed); workspace settings (default shell, file exclusions, session order, recent projects, browser homepage/search, link open target); every shortcut rebindable in Settings.

**What makes it good:** Spatial/canvas model genuinely fits multi-agent work — you SEE all sessions at once instead of cycling tabs. Session-as-first-class-object (each run = its own restorable session with terminal + model memory; flame/status-dot list makes "which agents are alive" a glance). Deep run visibility in the status bar (context %, $ now + today, 5h/7d resets, CLAUDE.md/rules/MCP/hook counts, auto mode) turns invisible Claude Code state into a live dashboard. One unified theme recolors the ENTIRE surface. Real node-pty = zero emulation gaps. Per-folder layout restore. Provider-agnostic agent. MIT + self-contained (builds with Bun + Node 20/22).

**Extension model:** NO third-party extension/plugin marketplace and does NOT load VS Code extensions — it uses Monaco the engine, NOT the VS Code extension host. No MCP/hook/plugin API as Cate-native install surfaces. Extensibility via two channels: (1) the bundled Pi agent (the pluggable AI layer — connect providers, per-chat model memory); (2) the terminal — because terminals are real node-pty shells, anything CLI-based (Claude Code with its CLAUDE.md/rules/MCP/hooks, npm scripts, git) runs inside a Cate terminal panel and brings its OWN ecosystem. The status bar's live CLAUDE.md/rules/MCP/hook COUNTS confirm Cate READS and surfaces the Claude Code config that lives in the project — it reflects that ecosystem rather than replacing it.

**Sources:** github.com/0-AI-UG/cate + README.md (tech stack, panels, Pi agent, providers, sessions/layout restore, keybindings, MIT, install). Local verified: /Applications/Cate.app/Contents/Info.plist (CFBundleShortVersionString 1.1.1, com.cate.app); ~/Library/Application Support/cate/config.json + boot.json; ~/.claude/skills/cate-theme/SKILL.md + theme.schema.json. STATUS BAR + SESSION UI = Drey's LIVE observation, reported as observed, not in public docs.

---

## Mapping to Ursula modes

Ursula is a Monaco/VS-Code-based agent IDE. Each "mode" emulates one tool's feel via a VS Code Profile. **All five modes share one extension set (`useDefaultFlags.extensions = true`)** — switching modes never removes Claude Code, Kilo Code, or any Open VSX extension. The table below maps each real tool's strengths to what an Ursula mode should deliver.

| Ursula mode | Emulates | Borrow the feel of… | Ursula's edge over the original |
|---|---|---|---|
| **Terax** | Terax | Light all-in-one ADE: terminal + editor + agent + git graph + web preview; diff-reviewed, approval-gated AI; project-memory file; fast/quiet | Terax has no plugin API — Ursula adds full extension access on top of the same agent-safety loop |
| **Warp** | Warp | Block-structured terminal, IDE-style input line, agent fed structured terminal state, MCP as the tool surface, reusable Workflows | Warp is terminal-only with no editor extensions — Ursula gives blocks AND the full editor + extension host |
| **Cursor** | Cursor | Editor-level AI sharing one codebase index (inline edit + next-edit Tab + composer), `.cursor/rules`-style steering, privacy-respecting indexing | Cursor is Open-VSX-limited; Ursula keeps Open VSX + VSIX sideload AND never strips extensions on mode-switch |
| **Cate** | Cate | Infinite canvas, sessions-as-objects with flame/status dots, rich agent status-bar dashboard, one-JSON unified theme | Cate can't load VS Code extensions at all — Ursula keeps the canvas/sessions feel WITH a full extension host |
| **Lite** | (minimal baseline) | Plain, fast, distraction-free editor + terminal; no heavy AI chrome | Still ships the same shared extension set — "lite" is visual, not a capability cut |

### Cross-cutting design promises (apply to every mode)
1. **Full extension access, always.** Modes are Profiles over one installed extension set. Claude Code, Kilo Code, and Open VSX extensions are present in every mode and never removed on switch.
2. **Real PTY terminals** so any CLI tool (Claude Code + its CLAUDE.md/rules/MCP/hooks) runs unchanged inside any mode.
3. **Provider-agnostic AI** (Anthropic-first, plus the BYOK/local roster) with per-chat model memory.
4. **Agent safety loop** — diff-reviewed AI edits + approval-gated bash by default (mirrors Terax; never auto-apply).
5. **File-based, ownable config** — themes, keybindings, rules, and a project-memory convention all live as editable files.
6. **Honest gaps:** add a real user-editable keybinding config file (Terax lacks one); document the MS-proprietary-extension hard limit (Cursor's real ceiling).
