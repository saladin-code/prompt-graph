# PromptGraph

**Track every AI prompt and the code changes it produced.**

PromptGraph is a VS Code / Kiro extension that automatically captures your AI prompts and connects them with the exact file changes they triggered.

![PromptGraph Visual History](https://raw.githubusercontent.com/saladin-code/prompt-graph/master/media/screenshots/promptgraph-history.png)

---

## Download & Installation

### Option 1: Download VSIX (empfohlen)

1. **[Download prompt-graph-1.0.0.vsix](https://github.com/saladin-code/prompt-graph/releases/latest/download/prompt-graph-1.0.0.vsix)**

2. In VS Code / Kiro installieren:
   - Extensions-Panel öffnen (`Ctrl+Shift+X`)
   - Klick auf `...` (oben rechts) → **Install from VSIX...**
   - Die heruntergeladene `.vsix`-Datei auswählen

### Option 2: Manuell bauen

```powershell
git clone https://github.com/saladin-code/prompt-graph.git
cd prompt-graph
npm install
npm run package:extension
```

Dann die erstellte `prompt-graph-1.0.0.vsix` installieren.

---

## Features

- **Automatic prompt tracking** — Keine manuelle Konfiguration nötig
- **Pre-change snapshots** — Erfasst den Workspace-Zustand vor Änderungen
- **Automatic diff calculation** — Berechnet exakt, was geändert wurde
- **Prompt → file mapping** — Verknüpft jeden Prompt mit den resultierenden Änderungen
- **Line statistics** — Zeigt hinzugefügte/entfernte Zeilen pro Datei
- **Visual timeline** — Durchsuche deine Prompt-History chronologisch
- **Native diff viewer** — Nutzt den eingebauten VS Code Diff

---

## Screenshots

### Prompt Details

Klicke auf einen Eintrag, um alle betroffenen Dateien mit Änderungsstatistiken zu sehen.

![PromptGraph Prompt Details](https://raw.githubusercontent.com/saladin-code/prompt-graph/master/media/screenshots/promptgraph-prompt-details.png)

### Built-in Diff Viewer

Inspiziere die exakten Änderungen für jede Datei.

![PromptGraph Diff Viewer](https://raw.githubusercontent.com/saladin-code/prompt-graph/master/media/screenshots/promptgraph-diff-viewer.png)

### Automatic Tracking

PromptGraph arbeitet im Hintergrund — keine manuellen Schritte erforderlich.

![PromptGraph Tracking](https://raw.githubusercontent.com/saladin-code/prompt-graph/master/media/screenshots/promptgraph-tracking.png)

---

## How It Works

```
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

Die Kiro-Hooks werden automatisch beim ersten Start der Extension erstellt:
- `.kiro/hooks/prompt-graph-submit.json` — Fängt Prompts ab
- `.kiro/hooks/prompt-graph-stop.json` — Erkennt Änderungen

---

## Requirements

- **Kiro IDE** (oder VS Code mit Kiro Extension)
- **Git Repository** (für zuverlässiges File-Tracking)
- VS Code / Kiro Version **1.85.0** oder höher

---

## Usage

1. **PromptGraph installieren** (siehe Download oben)
2. **Workspace öffnen** mit einem Git Repository
3. **PromptGraph finden** in der Activity Bar (Graph-Icon)
4. **Kiro nutzen** wie gewohnt
5. **History ansehen** — Prompts und Änderungen erscheinen automatisch

---

## Data Storage

Alle Daten bleiben lokal auf deinem Rechner:

```
Windows: %USERPROFILE%\.prompt-graph\workspaces\<project>\history.json
```

Kein Cloud-Sync, keine externen Services.

---

## Documentation

| Dokument | Beschreibung |
|----------|--------------|
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Entwickler-Guide: Setup, Hot Reload, Testen |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Technische Architektur, Datenfluss, Komponenten |
| [docs/EXTENSION.md](docs/EXTENSION.md) | Marketplace-Beschreibung |

---

## Quick Start (Development)

```powershell
git clone https://github.com/saladin-code/prompt-graph.git
cd prompt-graph
npm install
npm run watch
# Dann F5 in VS Code/Kiro drücken
```

Ausführliche Anleitung: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

---

## License

[MIT](LICENSE) — Created by [saladin-code](https://github.com/saladin-code)
