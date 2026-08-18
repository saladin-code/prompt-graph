<p align="center">
  <img src="media/icon.png" alt="PromptGraph Logo" width="180">
</p>

<p align="center">
  <a href="https://github.com/saladin-code/prompt-graph/releases"><img src="https://img.shields.io/github/v/release/saladin-code/prompt-graph?label=download&color=blue" alt="Download"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
</p>

<br>

# PromptGraph

> Track every AI prompt and the code changes it produced.

- 🔄 **Automatic Tracking** — No manual configuration needed
- 📸 **Snapshots** — Captures workspace state before changes
- 🔗 **Prompt → Code Mapping** — Links prompts to resulting changes
- 📊 **Line Statistics** — Shows added/removed lines per file
- 📅 **Visual Timeline** — Browse prompt history chronologically
- 🔍 **Native Diff Viewer** — Uses VS Code's built-in diff

PromptGraph automatically captures your Kiro AI prompts and connects them with the exact file changes they triggered. Never lose track of what your AI assistant changed.

<br>

## Installation

### Download VSIX

1. **[⬇️ Download prompt-graph-1.0.0.vsix](https://github.com/saladin-code/prompt-graph/releases/latest/download/prompt-graph-1.0.0.vsix)**

2. In VS Code / Kiro:
   - Extensions (`Ctrl+Shift+X`) → `...` → **Install from VSIX...**

### Build from source

```bash
git clone https://github.com/saladin-code/prompt-graph.git
cd prompt-graph
npm install
npm run package:extension
```

<br>

## Screenshots

### Visual Timeline

![PromptGraph Visual History](https://raw.githubusercontent.com/saladin-code/prompt-graph/master/media/screenshots/promptgraph-history.png)

### Prompt Details

![PromptGraph Prompt Details](https://raw.githubusercontent.com/saladin-code/prompt-graph/master/media/screenshots/promptgraph-prompt-details.png)

### Diff Viewer

![PromptGraph Diff Viewer](https://raw.githubusercontent.com/saladin-code/prompt-graph/master/media/screenshots/promptgraph-diff-viewer.png)

<br>

## How it works

```
Prompt → Snapshot → Kiro works → Diff → History
```

The Kiro hooks are created automatically on first start. No configuration needed.

<br>

## Requirements

- **Kiro IDE** (or VS Code with Kiro)
- **Git repository**
- VS Code / Kiro **≥ 1.85.0**

<br>

## Documentation

- [Development Guide](docs/DEVELOPMENT.md) — Setup, Hot Reload, Testing
- [Architecture](docs/ARCHITECTURE.md) — Technical details, data flow

<br>

## License

[MIT](LICENSE) — Created by [saladin-code](https://github.com/saladin-code)
