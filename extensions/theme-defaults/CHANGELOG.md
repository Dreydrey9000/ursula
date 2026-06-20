# Changelog

## [2026-06-20]

### Added
- New "Ursula Cate" dark color theme (`themes/ursula-cate-color-theme.json`) — maps the Cate ember/orange palette (near-black surfaces #1a1714/#221d18, warm text #e7ddd0, orange accent #e0683c, sage green, amber, blue) onto workbench colors, terminal ANSI palette, and syntax tokenColors; verified WCAG AA body contrast (12.45:1). Why: gives the Cate mode template (component A) a matching IDE theme to select via the "Ursula Cate" label.
- Registered "Ursula Cate" in `package.json` `contributes.themes` (uiTheme `vs-dark`). Why: required so VS Code/Ursula loads and lists the theme for selection.
