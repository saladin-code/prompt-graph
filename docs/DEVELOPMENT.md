# PromptGraph - Entwickler-Guide

Dieses Dokument erklärt, wie du PromptGraph lokal entwickelst und testest.

---

## Voraussetzungen

- **Node.js** ≥ 18
- **npm** ≥ 9
- **VS Code** oder **Kiro IDE** (≥ 1.85)

---

## Setup

### 1. Repository klonen

```powershell
git clone https://github.com/saladin-code/prompt-graph.git
cd prompt-graph
```

### 2. Abhängigkeiten installieren

```powershell
npm install
```

### 3. Kompilieren

```powershell
npm run compile
```

---

## Entwicklung (Hot Reload)

### Extension Development Host starten

Öffne den `prompt-graph`-Ordner in VS Code / Kiro:

```powershell
code .
# oder
kiro .
```

Dann **F5** drücken (oder Run → Start Debugging).

Das startet automatisch:
- den TypeScript-Compiler im Watch-Modus
- ein neues **Extension Development Host**-Fenster mit der geladenen Extension

### Hot Reload im laufenden Betrieb

Wenn du eine `.ts`-Datei änderst und speicherst:

1. TypeScript kompiliert automatisch im Hintergrund (Watch-Task)
2. Im Extension Development Host Fenster: **Strg+R** (Windows) / **Cmd+R** (Mac) drücken
3. Extension wird neu geladen — Änderungen sind sofort aktiv

> **Tipp:** Den TypeScript-Watch-Task kannst du auch manuell starten:
> ```powershell
> npm run watch
> ```

### Launch-Konfigurationen

| Konfiguration | Beschreibung |
|---|---|
| `Run Extension` | Kompiliert einmalig, startet Extension Host |
| `Watch + Run Extension` | Watch-Modus + Extension Host (empfohlen) |

---

## Testen (ohne Kiro-Hooks)

Du kannst die Extension direkt im Extension Development Host testen, ohne echte Kiro-Hooks.

### Testdaten per HTTP einspielen

Der `SessionCoordinator` lauscht auf Port **47821**. Du kannst Testevents direkt per PowerShell schicken:

**Schritt 1 — Prompt simulieren:**

```powershell
$body = '{"event":"UserPromptSubmit","prompt":"Erstelle einen UserService"}'
Invoke-WebRequest -Uri http://127.0.0.1:47821 -Method POST `
  -ContentType "application/json" -Body $body
```

**Schritt 2 — Eine Datei im Workspace ändern** (damit die Extension einen Diff erkennt).

**Schritt 3 — Stop-Event simulieren:**

```powershell
$body = '{"event":"Stop"}'
Invoke-WebRequest -Uri http://127.0.0.1:47821 -Method POST `
  -ContentType "application/json" -Body $body
```

→ In der Sidebar (Graph-Icon in der Activity Bar) erscheint jetzt der neue Eintrag.

### Eintrag testen

- Klick auf einen Eintrag in der Liste öffnet das **Detail-Panel**
- Klick auf **View Changes** öffnet den nativen VS Code Diff (Before ↔ After)

---

## Extension paketieren

```powershell
# VSIX erstellen (für Marketplace/Installation)
npm run package:extension
```

Das erstellt `prompt-graph-1.0.0.vsix` im Projektordner.

### Lokal installieren

```powershell
code --install-extension prompt-graph-1.0.0.vsix
# oder in Kiro: Extensions → "Install from VSIX..."
```

---

## Projektstruktur

```
prompt-graph/
├── src/
│   ├── extension.ts          ← Entry Point, Commands, Hook-Setup
│   ├── sessionCoordinator.ts ← HTTP-Server Port 47821, Snapshot-Logik
│   ├── history.ts            ← Datenmodell + JSON-Persistenz
│   ├── snapshot.ts           ← Workspace-Snapshot + Diff
│   ├── historyProvider.ts    ← TreeView (Sidebar-Liste)
│   ├── detailPanel.ts        ← WebView-Panel + nativer Diff
│   ├── workspaceRegistry.ts  ← Cross-Workspace-Navigation
│   ├── timelineView.ts       ← WebView UI (Timeline + Suche)
│   ├── webviewUtils.ts       ← Shared WebView Utilities
│   └── hookHandler.ts        ← Node-Script für Kiro-Hooks
├── out/                      ← Kompilierte JS-Dateien
├── docs/
│   ├── EXTENSION.md          ← Marketplace-Seite
│   └── DEVELOPMENT.md        ← Dieses Dokument
├── media/
│   ├── icon.svg
│   ├── icon.png
│   └── screenshots/          ← Screenshots für Docs
├── scripts/
│   └── add-border.js         ← Screenshot-Rahmen hinzufügen
├── .vscode/
│   ├── launch.json           ← F5-Konfiguration
│   └── tasks.json            ← Compile/Watch-Tasks
├── package.json
├── tsconfig.json
├── LICENSE
├── README.md                 ← GitHub-Startseite
└── ARCHITECTURE.md           ← Technische Architektur
```

---

## Kiro-Hooks

Die Extension erstellt beim ersten Start automatisch die benötigten Hooks:

- `.kiro/hooks/prompt-graph-submit.json` — Fängt Prompts ab
- `.kiro/hooks/prompt-graph-stop.json` — Erkennt Änderungen nach Kiro-Run

**Keine manuelle Konfiguration nötig.** Die Hook-Dateien werden automatisch mit dem korrekten Pfad zur installierten Extension generiert.

---

## Daten & Persistenz

Die History wird lokal gespeichert unter:

```
Windows: %USERPROFILE%\.prompt-graph\workspaces\<project>\history.json
```

Mit dem Trash-Icon in der Sidebar-Titelleiste kann die History geleert werden.

---

## npm Scripts

| Script | Beschreibung |
|--------|--------------|
| `npm run compile` | TypeScript kompilieren |
| `npm run watch` | Watch-Modus (automatische Kompilierung) |
| `npm run lint` | ESLint ausführen |
| `npm run package:extension` | VSIX erstellen |

---

## Bekannte Einschränkungen

- Binärdateien werden beim Snapshot ignoriert
- Der Diff-Algorithmus ist ein einfacher Zeilenvergleich (kein Myers-Diff)
- Snapshot kann bei sehr großen Projekten (>10k Dateien) langsam sein
- `node_modules`, `dist`, `out` werden automatisch ignoriert

---

## Weitere Dokumentation

- **[README.md](../README.md)** — Benutzer-Dokumentation, Installation
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Technische Architektur, Datenfluss, Komponenten
