# PromptGraph

VS Code / Kiro Extension — verfolgt automatisch, welche Prompts welche Codeänderungen ausgelöst haben.

```
Prompt absenden → Snapshot → Kiro arbeitet → Diff berechnen → History-Eintrag
```

---

## Voraussetzungen

- **Node.js** ≥ 18
- **npm** ≥ 9
- **VS Code** oder **Kiro IDE** (≥ 1.85)

---

## Entwicklung (Hot Reload)

Das ist der normale Entwicklungsweg — du arbeitest direkt im Quellcode, Änderungen werden automatisch kompiliert und du kannst die Extension sofort testen.

### 1. Abhängigkeiten installieren

```powershell
cd prompt-graph
npm install
```

### 2. Extension Development Host starten

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

### 3. Hot Reload im laufenden Betrieb

Wenn du eine `.ts`-Datei änderst und speicherst:

1. TypeScript kompiliert automatisch im Hintergrund (Watch-Task)
2. Im Extension Development Host Fenster: **Strg+R** (Windows) / **Cmd+R** (Mac) drücken
3. Extension wird neu geladen — Änderungen sind sofort aktiv

> **Tipp:** Den TypeScript-Watch-Task kannst du auch manuell starten:
> ```powershell
> npm run watch
> ```

### Konfigurationen in `.vscode/launch.json`

| Konfiguration | Beschreibung |
|---|---|
| `Run Extension` | Kompiliert einmalig, startet Extension Host |
| `Watch + Run Extension` | Watch-Modus + Extension Host (empfohlen für Entwicklung) |

---

## Testen (manuell, ohne Kiro-Hooks)

Du kannst die Extension direkt im Extension Development Host testen, ohne echte Kiro-Hooks einzurichten.

### Testdaten per HTTP einspielen

Der `SessionCoordinator` lauscht auf Port **47821**. Du kannst Testevents direkt per `curl` oder PowerShell schicken:

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

### Eintrag anklicken

- Klick auf einen Eintrag in der Liste öffnet das **Detail-Panel**
- Klick auf **View Changes** öffnet den nativen VS Code Diff (Before ↔ After)

---

## Kiro-Hooks einrichten (Produktiv-Betrieb)

Die Hooks in `.kiro/hooks/` müssen in das Projekt kopiert werden, in dem du Kiro nutzt.

### 1. Hooks kopieren

```powershell
# Aus dem prompt-graph Ordner in dein Zielprojekt:
Copy-Item ".kiro\hooks\prompt-graph-submit.json" "C:\dein\projekt\.kiro\hooks\"
Copy-Item ".kiro\hooks\prompt-graph-stop.json"   "C:\dein\projekt\.kiro\hooks\"
```

### 2. Pfad in den Hook-Dateien anpassen

Öffne beide JSON-Dateien und ersetze den Pfad zum `hookHandler.js`:

```json
"command": "node \"C:\\Users\\<dein-name>\\.vscode\\extensions\\prompt-graph-0.1.0\\out\\hookHandler.js\" UserPromptSubmit"
```

Den genauen Pfad findest du so:

```powershell
# Zeigt alle installierten Extensions an:
Get-ChildItem "$env:USERPROFILE\.vscode\extensions" | Where-Object Name -like "prompt-graph*"
```

### 3. Extension installieren

**Variante A — Direkt aus dem Quellcode (empfohlen für Entwicklung):**

Öffne `prompt-graph` in VS Code/Kiro und drücke F5. Die Extension läuft im Development Host.

**Variante B — Als `.vsix`-Paket:**

```powershell
# vsce installieren (einmalig)
npm install -g @vscode/vsce

# Paket bauen
cd prompt-graph
vsce package

# Installieren
code --install-extension prompt-graph-0.1.0.vsix
# oder in Kiro: Extensions → "Install from VSIX..."
```

---

## Projektstruktur

```
prompt-graph/
├── src/
│   ├── extension.ts          ← Entry Point, Commands
│   ├── sessionCoordinator.ts ← HTTP-Server Port 47821, Snapshot-Logik
│   ├── history.ts            ← Datenmodell + JSON-Persistenz
│   ├── snapshot.ts           ← Workspace-Snapshot + Diff
│   ├── historyProvider.ts    ← TreeView (Sidebar-Liste)
│   ├── detailPanel.ts        ← WebView-Panel + nativer Diff
│   └── hookHandler.ts        ← Node-Script für Kiro-Hooks
├── out/                      ← Kompilierte JS-Dateien
├── media/
│   └── icon.svg
├── .kiro/hooks/
│   ├── prompt-graph-submit.json  ← Hook: UserPromptSubmit
│   └── prompt-graph-stop.json   ← Hook: Stop
├── .vscode/
│   ├── launch.json           ← F5-Konfiguration
│   └── tasks.json            ← Compile/Watch-Tasks
├── package.json
└── tsconfig.json
```

---

## Daten & Persistenz

Die History wird lokal gespeichert unter:

```
Windows: %APPDATA%\Code\User\globalStorage\prompt-graph\history.json
```

Mit dem Trash-Icon in der Sidebar-Titelleiste kann die History komplett geleert werden.

---

## Bekannte Einschränkungen (MVP)

- Binärdateien werden beim Snapshot ignoriert
- Der Diff-Algorithmus ist ein einfacher Zeilenvergleich (kein Myers-Diff)
- Snapshot kann bei sehr großen Projekten (>10k Dateien) langsam sein — `node_modules`, `dist`, `out` werden automatisch ignoriert
- Kein Undo/Restore, kein Cloud-Sync, kein Graph
