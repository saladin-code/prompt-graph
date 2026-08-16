# PromptGraph

**Track every AI prompt and the code changes it produced.**

PromptGraph automatically captures your Kiro AI prompts and connects them with the exact file changes they triggered. Never lose track of what your AI assistant changed.

---

## Visual Prompt History

See all your prompts in a clean timeline. Each entry shows the prompt text, timestamp, and a summary of the changes it produced.

![PromptGraph Visual History](https://raw.githubusercontent.com/saladin-code/prompt-graph/master/media/screenshots/promptgraph-history.png)

> *Your prompt history at a glance — organized by time with change statistics.*

---

## Prompt → Code Changes

Every prompt is linked to the files it modified. See exactly which files were added, changed, or removed — with line-level statistics.

![PromptGraph Prompt Details](https://raw.githubusercontent.com/saladin-code/prompt-graph/master/media/screenshots/promptgraph-prompt-details.png)

> *Select a prompt to see all affected files with added/removed line counts.*

---

## Built-in Diff Viewer

Inspect the exact changes for each file. PromptGraph uses VS Code's native diff viewer to show you what was added and removed.

![PromptGraph Diff Viewer](https://raw.githubusercontent.com/saladin-code/prompt-graph/master/media/screenshots/promptgraph-diff-viewer.png)

> *Click any file to open a side-by-side diff view.*

---

## Automatic Tracking

PromptGraph works in the background. No manual steps required.

```text
You send a prompt
       ↓
PromptGraph takes a snapshot
       ↓
Kiro makes changes
       ↓
PromptGraph calculates the diff
       ↓
History entry created
```

![PromptGraph Tracking](https://raw.githubusercontent.com/saladin-code/prompt-graph/master/media/screenshots/promptgraph-tracking.png)

> *Automatic capture — just use Kiro as usual.*

---

## Features

- **Automatic prompt tracking** — No manual tagging or annotations
- **Pre-change snapshots** — Captures workspace state before Kiro modifies files
- **Automatic diff calculation** — Computes exactly what changed
- **Prompt → file mapping** — Links each prompt to its resulting changes
- **Line statistics** — Shows added/removed lines per file
- **Visual timeline** — Browse your prompt history chronologically
- **Native diff viewer** — Uses VS Code's built-in diff for familiar UX
- **Kiro integration** — Works seamlessly with Kiro hooks

---

## How It Works

PromptGraph hooks into Kiro's event system:

1. When you submit a prompt, PromptGraph snapshots your workspace
2. Kiro processes your request and modifies files
3. When Kiro finishes, PromptGraph compares the snapshot with the current state
4. The prompt and its changes are saved to your local history

All data stays on your machine. No cloud sync, no external services.

---

## Requirements

- **Kiro IDE** (or VS Code with Kiro extension)
- **Git repository** (for reliable file tracking)
- VS Code / Kiro version **1.85.0** or later

---

## Usage

1. **Install PromptGraph** from the extension marketplace
2. **Open a workspace** with a Git repository
3. **Find PromptGraph** in the Activity Bar (graph icon)
4. **Use Kiro** as you normally would
5. **View your history** — prompts and changes appear automatically

Click any entry to see details. Click a file to open the diff view.

---

## Tips

- Use the **trash icon** in the sidebar header to clear your history
- Large projects work best when `node_modules`, `dist`, and `out` are gitignored
- History is stored locally per VS Code installation

---

*PromptGraph — See what your AI changed.*
