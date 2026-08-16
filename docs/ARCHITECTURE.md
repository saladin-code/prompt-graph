# PromptGraph - Architektur & Dokumentation

## Übersicht

**PromptGraph** ist eine VS Code Extension, die AI-Prompts (speziell von Kiro) und deren resultierende Code-Änderungen in einer visuellen Timeline trackt. Die Extension ermöglicht es, nachzuvollziehen welche Änderungen durch welchen Prompt entstanden sind.

```
┌─────────────────────────────────────────────────────────────────┐
│                         PromptGraph                             │
├─────────────────────────────────────────────────────────────────┤
│  Kiro Hook → Event-Datei → SessionCoordinator → History Store   │
│                                    ↓                            │
│                            TimelineView (UI)                    │
│                                    ↓                            │
│                            DetailPanel (Diff)                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Datenfluss

### 1. Prompt erfassen

```
Kiro AI Session
      │
      ▼
┌─────────────────┐     UserPromptSubmit
│   Kiro Hook     │ ──────────────────────►  hookHandler.ts
│ (.kiro/hooks/)  │                               │
└─────────────────┘                               ▼
                                         ┌───────────────────┐
                                         │ %TEMP%/prompt-    │
                                         │ graph-events/     │
                                         │ event-xxx.json    │
                                         └───────────────────┘
```

### 2. Änderungen tracken

```
┌───────────────────┐          fs.watch           ┌─────────────────┐
│  Event-Verzeichnis │ ◄─────────────────────────  │ SessionCoordinator│
│  (event-*.json)    │                             │                   │
└───────────────────┘                              └─────────────────┘
         │                                                  │
         │  UserPromptSubmit                               │
         ▼                                                  ▼
   ┌─────────────┐                                 ┌─────────────────┐
   │  Snapshot   │  ◄──────────────────────────────│  takeSnapshot() │
   │  (Vorher)   │                                 │  (alle Dateien) │
   └─────────────┘                                 └─────────────────┘
         │
         │  Stop Event (Kiro fertig)
         ▼
   ┌─────────────┐      computeChanges()          ┌─────────────────┐
   │  Snapshot   │  ──────────────────────────────►│  PromptEntry    │
   │  (Nachher)  │                                 │  (Diff + Meta)  │
   └─────────────┘                                 └─────────────────┘
```

### 3. Speicherung

```
~/.prompt-graph/
└── workspaces/
    ├── project-a/
    │   └── history.json      ◄── PromptHistoryStore
    ├── project-b/
    │   └── history.json
    └── runwatch/
        └── history.json
```

---

## Modul-Architektur

```
src/
├── extension.ts          # Entry Point, Command-Registrierung
├── hookHandler.ts        # Kiro Hook → Event-Datei schreiben
├── sessionCoordinator.ts # Event-Verarbeitung, Snapshot-Diff
├── snapshot.ts           # Workspace-Dateien lesen/vergleichen
├── history.ts            # PromptEntry Store (JSON-Persistenz)
├── workspaceRegistry.ts  # Alle Workspaces scannen
├── timelineView.ts       # WebView UI (Timeline + Suche)
├── detailPanel.ts        # WebView UI (Diff-Ansicht)
└── webviewUtils.ts       # Shared WebView Utilities
```

---

## Komponenten im Detail

### 1. `hookHandler.ts` - Hook-Brücke

**Aufgabe:** Empfängt Kiro-Hook-Events und schreibt sie als JSON-Dateien.

**Warum Event-Dateien statt HTTP?**
Kiro blockiert Ports, daher wird ein File-basierter IPC verwendet.

```typescript
// Hook schreibt Event in Temp-Verzeichnis
const filepath = path.join(EVENT_DIR, `event-${Date.now()}-${event}.json`);
fs.writeFileSync(filepath, JSON.stringify({ event, prompt, ts, workspacePath }));
```

**Event-Format:**
```json
{
  "event": "UserPromptSubmit",
  "prompt": "Erstelle eine React-Komponente...",
  "ts": 1786839925663,
  "workspacePath": "C:\\Users\\...\\project"
}
```

---

### 2. `sessionCoordinator.ts` - Event-Orchestrierung

**Aufgabe:** Überwacht Event-Verzeichnis, koordiniert Snapshot-Diff.

```typescript
export class SessionCoordinator {
  private watcher: fs.FSWatcher;     // Überwacht EVENT_DIR
  private pending: PendingSession;    // Aktive Session (Prompt + Snapshot)
  
  // Event-Flow:
  // 1. UserPromptSubmit → Snapshot nehmen, Prompt merken
  // 2. Stop → Zweiten Snapshot, Diff berechnen, Entry speichern
}
```

**Wichtige Methoden:**

| Methode | Beschreibung |
|---------|--------------|
| `start()` | Startet fs.watch auf EVENT_DIR |
| `onPromptSubmit(prompt)` | Nimmt Workspace-Snapshot auf |
| `onAgentStop()` | Berechnet Diff, speichert Entry |
| `cleanOldEvents()` | Löscht Events älter als 1 Stunde |

---

### 3. `snapshot.ts` - Dateisystem-Snapshot

**Aufgabe:** Erstellt vollständigen Workspace-Snapshot für Diff-Berechnung.

```typescript
export interface FileSnapshot {
  relativePath: string;   // z.B. "src/App.tsx"
  content: string;        // Vollständiger Dateiinhalt
  mtime: number;          // Änderungszeitpunkt
}

export type WorkspaceSnapshot = Map<string, FileSnapshot>;
```

**Ignorierte Patterns:**
```typescript
const IGNORE_PATTERNS = [
  /node_modules/,
  /\.git\//,
  /out\//, /dist\//,
  /\.kiro\/hooks\//,
  /history\.json$/,
  /\.(png|jpg|jpeg|gif|svg|ico|woff|...)$/i,
];
```

**Diff-Algorithmus:**
```typescript
export function computeChanges(before, after): ChangedFile[] {
  // Für jede Datei in "after":
  //   - Neu (nicht in before) → status: 'A'
  //   - Geändert (content unterschiedlich) → status: 'M'
  // Für jede Datei in "before" nicht in "after":
  //   - Gelöscht → status: 'D'
}
```

---

### 4. `history.ts` - Persistenz-Layer

**Aufgabe:** Speichert und lädt Prompt-Einträge aus JSON.

```typescript
export interface PromptEntry {
  id: string;              // UUID
  prompt: string;          // Original-Prompt-Text
  timestamp: number;       // Unix-Timestamp
  changedFiles: ChangedFile[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface ChangedFile {
  uri: string;             // Workspace-relativer Pfad
  status: 'M' | 'A' | 'D'; // Modified, Added, Deleted
  additions: number;
  deletions: number;
  beforeContent: string;   // Inhalt vor Änderung
  afterContent: string;    // Inhalt nach Änderung
}
```

**Speicherpfad:**
```
~/.prompt-graph/workspaces/<workspace-name>/history.json
```

**Migration:**
Alte Einträge aus `%APPDATA%/Kiro/User/workspaceStorage/*/` werden beim Start migriert.

---

### 5. `workspaceRegistry.ts` - Workspace-Scanner

**Aufgabe:** Scannt alle Workspaces für Cross-Workspace-Navigation.

```typescript
export interface WorkspaceInfo {
  name: string;           // Ordnername (sanitized)
  historyPath: string;    // Pfad zur history.json
  promptCount: number;    // Anzahl Einträge
  lastActivity: number;   // Letzter Timestamp
  isCurrent: boolean;     // Aktueller Workspace?
}
```

**Methoden:**

| Methode | Beschreibung |
|---------|--------------|
| `scan()` | Scannt `~/.prompt-graph/workspaces/` |
| `getAll()` | Alle Workspaces, sortiert nach Aktivität |
| `getEntries(name)` | Liest history.json eines Workspace |
| `refresh()` | Neu scannen + Event feuern |

---

### 6. `timelineView.ts` - Haupt-UI

**Aufgabe:** WebView mit zwei Modi: Workspace-Liste und Timeline.

#### View-Modi:

```
┌─────────────────────────────┐
│  MODE: 'workspaces'         │
├─────────────────────────────┤
│ 🔍 [Alle durchsuchen...]    │
│─────────────────────────────│
│ 📁 project-a                │
│    14 Prompts · 15.08.26    │
│ 📁 project-b                │
│    3 Prompts · 14.08.26     │
└─────────────────────────────┘

        │ Klick auf Workspace
        ▼

┌─────────────────────────────┐
│  MODE: 'timeline'           │
├─────────────────────────────┤
│ ← 🔍 [Suchen...]        🗑  │
│─────────────────────────────│
│ ○─ Erstelle React-Komp...   │
│ │  └─ M App.tsx (+15 -3)    │
│ ○─ Füge Tests hinzu...      │
│ │                           │
│ ●  (Ende)                   │
└─────────────────────────────┘
```

#### UI-Elemente:

| Element | Beschreibung |
|---------|--------------|
| `←` (Back-Button) | Zurück zur Workspace-Liste |
| Suchfeld | Filtert Prompts (lokal oder global) |
| 🗑 (Trash) | Löscht alle Einträge des Workspace |
| Prompt-Zeile | Klick → expandiert Dateien |
| Datei-Zeile | Klick → öffnet Diff |

#### Kontextmenü (Rechtsklick):

```
┌──────────────────────┐
│ 📋 Kontext: Kompakt  │
│ 📄 Kontext: Ausführl.│
│ ──────────────────── │
│ 🗑 Löschen          │
└──────────────────────┘
```

#### SVG-Graph:

```typescript
// Dynamisches SVG für vertikale Linie mit Nodes
const svg = `
  <circle cx="10" cy="11" r="4"/>     // Node
  <line x1="10" y1="0" x2="10" y2="11"/>  // Linie nach oben
  <line x1="10" y1="11" x2="10" y2="22"/> // Linie nach unten
`;
```

---

### 7. `detailPanel.ts` - Diff-Ansicht

**Aufgabe:** Zeigt detaillierte Diff-Ansicht eines Eintrags.

```
┌─────────────────────────────────────────────┐
│ 💬 "Erstelle eine React-Komponente für..."  │
│    15. Aug 2024 · 14:32                      │
│    3 Dateien geändert  +45 -12              │
├─────────────────────────────────────────────┤
│ ▶ src/App.tsx                               │
│ ▶ src/components/Button.tsx                 │
│ ▼ src/styles/main.css                       │
│   ┌──────────────┬──────────────┐           │
│   │ Vorher       │ Nachher      │           │
│   │ .btn {       │ .btn {       │           │
│   │-  color: red │+  color: blue│           │
│   │ }            │ }            │           │
│   └──────────────┴──────────────┘           │
└─────────────────────────────────────────────┘
```

**Features:**
- Accordion-Ansicht für Dateien
- Side-by-Side Diff (Before/After)
- Klick auf Datei → öffnet im Editor
- Temporäre Dateien für vscode.diff

---

### 8. `extension.ts` - Entry Point

**Aufgabe:** Registriert alle Komponenten und Commands.

```typescript
export function activate(context: vscode.ExtensionContext) {
  // Services initialisieren
  const store = new PromptHistoryStore(context);
  const registry = new WorkspaceRegistry(context);
  const coordinator = new SessionCoordinator(store);
  
  // WebViews registrieren
  registerWebviewViewProvider('promptGraph.timeline', timelineSidebar);
  registerWebviewViewProvider('promptGraph.timelinePanel', timelinePanel);
  
  // Commands registrieren
  registerCommand('promptGraph.deleteEntry', ...);
  registerCommand('promptGraph.clearWorkspace', ...);
  registerCommand('promptGraph.copyContext', ...);
  registerCommand('promptGraph.viewDiff', ...);
  
  // Coordinator starten
  coordinator.start();
}
```

---

## Kiro Hook-Konfiguration

Die Extension benötigt Kiro-Hooks um Events zu empfangen:

```json
// .kiro/hooks/prompt-graph.json
{
  "version": "v1",
  "hooks": [
    {
      "name": "PromptGraph: UserPromptSubmit",
      "trigger": "UserPromptSubmit",
      "action": {
        "type": "command",
        "command": "node \"<path>/out/hookHandler.js\" UserPromptSubmit"
      }
    },
    {
      "name": "PromptGraph: Stop",
      "trigger": "Stop",
      "action": {
        "type": "command",
        "command": "node \"<path>/out/hookHandler.js\" Stop"
      }
    }
  ]
}
```

---

## Dateistruktur

```
~/.prompt-graph/
├── workspaces/
│   ├── project-a/
│   │   └── history.json
│   ├── project-b/
│   │   └── history.json
│   └── my-app/
│       └── history.json

%TEMP%/prompt-graph-events/
├── event-1786839925663-UserPromptSubmit.json
└── event-1786839930000-Stop.json
```

### history.json Struktur:

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "prompt": "Erstelle eine Button-Komponente",
    "timestamp": 1786839925663,
    "changedFiles": [
      {
        "uri": "src/Button.tsx",
        "status": "A",
        "additions": 25,
        "deletions": 0,
        "beforeContent": "",
        "afterContent": "import React from 'react';\n..."
      }
    ],
    "totalAdditions": 25,
    "totalDeletions": 0
  }
]
```

---

## UI-Fluss

```
┌──────────────────┐
│  Extension Start │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│  Activity Bar    │     │  Panel (unten)   │
│  (Sidebar)       │     │  (neben Terminal)│
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         └──────────┬─────────────┘
                    ▼
         ┌──────────────────┐
         │   TimelineView   │
         │   (WebView)      │
         └────────┬─────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
    ▼             ▼             ▼
┌────────┐  ┌──────────┐  ┌──────────┐
│Workspace│  │ Timeline │  │  Search  │
│ Liste   │  │  Ansicht │  │ Results  │
└────────┘  └────┬─────┘  └──────────┘
                 │
                 ▼
         ┌──────────────────┐
         │   DetailPanel    │
         │   (Diff-View)    │
         └──────────────────┘
```

---

## Technologie-Stack

| Komponente | Technologie |
|------------|-------------|
| Runtime | VS Code Extension API |
| Language | TypeScript |
| Build | tsc |
| UI | WebView (HTML/CSS/JS) |
| Icons | @vscode/codicons |
| IPC | File-basiert (fs.watch) |
| Persistenz | JSON-Dateien |

---

## Commands

| Command | Beschreibung |
|---------|--------------|
| `promptGraph.viewDiff` | Öffnet Diff für eine Datei |
| `promptGraph.clearHistory` | Löscht History (aktueller WS) |
| `promptGraph.clearWorkspace` | Löscht History (beliebiger WS) |
| `promptGraph.deleteEntry` | Löscht einzelnen Eintrag |
| `promptGraph.copyContext` | Kopiert Kontext als Markdown |
| `promptGraph.openFile` | Öffnet Datei im Editor |

---

## Erweiterungsmöglichkeiten

1. **Git-Integration**: Automatisch Commits für jeden Prompt
2. **Export**: Timeline als Markdown/HTML exportieren
3. **Tagging**: Prompts mit Labels versehen
4. **Branching**: Visuelle Darstellung von Prompt-Verzweigungen
5. **Suche**: Volltextsuche über alle Workspaces
6. **Statistiken**: Analyse der Prompt-Nutzung

---

## Entwicklung

```bash
# Dependencies installieren
npm install

# Kompilieren
npm run compile

# Watch-Mode
npm run watch

# Extension testen
# F5 in VS Code → Extension Development Host
```

---

*Dokumentation generiert am 15.08.2026*
