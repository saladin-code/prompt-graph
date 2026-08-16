import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PromptHistoryStore } from './history.js';
import { TimelineView } from './timelineView.js';
import { DetailPanel, cleanupTempFiles, openDiff, openFileAtChange } from './detailPanel.js';
import { SessionCoordinator } from './sessionCoordinator.js';
import { WorkspaceRegistry } from './workspaceRegistry.js';

/**
 * Erstellt die Kiro-Hooks für PromptGraph im Workspace, falls sie nicht existieren.
 */
async function ensureHooksInstalled(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const hooksDir = path.join(workspaceRoot, '.kiro', 'hooks');
  
  // Pfad zum hookHandler.js (in der installierten Extension)
  const hookHandlerPath = path.join(context.extensionPath, 'out', 'hookHandler.js');

  // Hook-Definitionen
  const hooks = [
    {
      filename: 'prompt-graph-submit.json',
      content: {
        version: 'v1',
        hooks: [
          {
            name: 'PromptGraph: Capture Prompt',
            trigger: 'UserPromptSubmit',
            action: {
              type: 'command',
              command: `node "${hookHandlerPath.replace(/\\/g, '/')}" UserPromptSubmit`
            }
          }
        ]
      }
    },
    {
      filename: 'prompt-graph-stop.json',
      content: {
        version: 'v1',
        hooks: [
          {
            name: 'PromptGraph: Detect Changes',
            trigger: 'Stop',
            action: {
              type: 'command',
              command: `node "${hookHandlerPath.replace(/\\/g, '/')}" Stop`
            }
          }
        ]
      }
    }
  ];

  // Hooks-Verzeichnis erstellen falls nötig
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
    console.log('[PromptGraph] Hooks-Verzeichnis erstellt:', hooksDir);
  }

  // Jeden Hook erstellen falls er nicht existiert
  for (const hook of hooks) {
    const hookPath = path.join(hooksDir, hook.filename);
    if (!fs.existsSync(hookPath)) {
      fs.writeFileSync(hookPath, JSON.stringify(hook.content, null, 2), 'utf-8');
      console.log('[PromptGraph] Hook erstellt:', hookPath);
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  console.log('[PromptGraph] Extension aktiviert');

  // Hooks automatisch installieren
  ensureHooksInstalled(context).catch(err => {
    console.error('[PromptGraph] Fehler beim Hook-Setup:', err);
  });

  // --- Kern-Services ---
  const store = new PromptHistoryStore(context);
  const registry = new WorkspaceRegistry(context);
  const coordinator = new SessionCoordinator(store);

  // Registry aktualisieren wenn Store sich ändert
  store.onDidChange(() => registry.refresh());

  // Wenn ein Eintrag in der Timeline ausgewählt wird → Detail-Panel öffnen
  const onSelect = (entry: import('./history.js').PromptEntry) => {
    DetailPanel.show(entry, context.extensionUri);
  };

  // --- Timeline WebView in der Sidebar (ActivityBar) ---
  const timelineSidebar = new TimelineView(store, context.extensionUri, onSelect, registry);
  const sidebarRegistration = vscode.window.registerWebviewViewProvider(
    TimelineView.viewId,
    timelineSidebar,
    { webviewOptions: { retainContextWhenHidden: true } }
  );

  // --- Timeline WebView im Panel (unten, neben Terminal) ---
  const timelinePanel = new TimelineView(store, context.extensionUri, onSelect, registry);
  const panelRegistration = vscode.window.registerWebviewViewProvider(
    'promptGraph.timelinePanel',
    timelinePanel,
    { webviewOptions: { retainContextWhenHidden: true } }
  );

  // --- WebView-Messages weiterleiten (openFile / openDiff) ---
  // Die TimelineView schickt diese per postMessage — wir fangen sie
  // über einen separaten Command ab, den der WebView direkt aufruft.

  const openFileCmd = vscode.commands.registerCommand(
    'promptGraph.openFile',
    async (entryId: string, fileUri: string) => {
      const entry = store.getEntry(entryId);
      if (!entry) return;
      const file = entry.changedFiles.find(f => f.uri === fileUri);
      if (file) await openFileAtChange(entry, file);
    }
  );

  const viewDiff = vscode.commands.registerCommand(
    'promptGraph.viewDiff',
    async (entryId: string, fileUri: string) => {
      const entry = store.getEntry(entryId);
      if (!entry) return;
      const file = entry.changedFiles.find(f => f.uri === fileUri);
      if (file) await openDiff(entry, file);
    }
  );

  const clearHistory = vscode.commands.registerCommand(
    'promptGraph.clearHistory',
    async () => {
      const workspaceName = store.workspaceName;
      const answer = await vscode.window.showWarningMessage(
        `History für "${workspaceName}" löschen?`,
        { modal: true },
        'Löschen'
      );
      if (answer === 'Löschen') {
        store.clear();
      }
    }
  );

  const clearWorkspace = vscode.commands.registerCommand(
    'promptGraph.clearWorkspace',
    async (workspaceName: string) => {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      const answer = await vscode.window.showWarningMessage(
        `History für "${workspaceName}" löschen?`,
        { modal: true },
        'Löschen'
      );
      
      if (answer === 'Löschen') {
        // Prüfen ob aktueller Workspace
        const currentWorkspaceSanitized = store.workspaceName
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
        
        if (workspaceName === currentWorkspaceSanitized) {
          store.clear();
        } else {
          // Anderer Workspace - direkt in Datei löschen
          const historyPath = path.join(os.homedir(), '.prompt-graph', 'workspaces', workspaceName, 'history.json');
          if (fs.existsSync(historyPath)) {
            fs.writeFileSync(historyPath, '[]', 'utf-8');
            registry.refresh();
          }
        }
      }
    }
  );

  const deleteEntry = vscode.commands.registerCommand(
    'promptGraph.deleteEntry',
    async (entryId: string, workspaceName?: string) => {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      // Workspace-Name für aktuellen Store (sanitized)
      const currentWorkspaceSanitized = store.workspaceName
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      
      // Wenn anderer Workspace, direkt in der Datei löschen
      const isOtherWorkspace = workspaceName && workspaceName !== currentWorkspaceSanitized;
      
      if (isOtherWorkspace) {
        const historyPath = path.join(os.homedir(), '.prompt-graph', 'workspaces', workspaceName, 'history.json');
        
        if (!fs.existsSync(historyPath)) {
          console.log('[PromptGraph] History nicht gefunden:', historyPath);
          return;
        }
        
        try {
          const raw = fs.readFileSync(historyPath, 'utf-8');
          const entries = JSON.parse(raw);
          const entry = entries.find((e: any) => e.id === entryId);
          
          if (!entry) {
            console.log('[PromptGraph] Eintrag nicht gefunden:', entryId);
            return;
          }
          
          const promptShort = entry.prompt.length > 40 
            ? entry.prompt.slice(0, 37) + '...' 
            : entry.prompt;
          
          const answer = await vscode.window.showWarningMessage(
            `Eintrag löschen?\n"${promptShort}"`,
            { modal: true },
            'Löschen'
          );
          
          if (answer === 'Löschen') {
            const newEntries = entries.filter((e: any) => e.id !== entryId);
            fs.writeFileSync(historyPath, JSON.stringify(newEntries, null, 2), 'utf-8');
            registry.refresh();
          }
        } catch (err) {
          console.error('[PromptGraph] Fehler beim Löschen:', err);
        }
        return;
      }
      
      // Aktueller Workspace - über Store löschen
      const entry = store.getEntry(entryId);
      if (!entry) {
        console.log('[PromptGraph] Eintrag nicht im Store:', entryId);
        return;
      }
      
      const promptShort = entry.prompt.length > 40 
        ? entry.prompt.slice(0, 37) + '...' 
        : entry.prompt;
      
      const answer = await vscode.window.showWarningMessage(
        `Eintrag löschen?\n"${promptShort}"`,
        { modal: true },
        'Löschen'
      );
      if (answer === 'Löschen') {
        store.deleteEntry(entryId);
      }
    }
  );

  // --- Kontext kopieren (Kompakt oder Ausführlich) ---
  const copyContext = vscode.commands.registerCommand(
    'promptGraph.copyContext',
    async (entryId: string, workspaceName: string, mode: 'compact' | 'detailed') => {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      // Entry laden (aus aktuellem Store oder anderem Workspace)
      let entry: any = store.getEntry(entryId);
      
      if (!entry && workspaceName) {
        const historyPath = path.join(os.homedir(), '.prompt-graph', 'workspaces', workspaceName, 'history.json');
        if (fs.existsSync(historyPath)) {
          try {
            const raw = fs.readFileSync(historyPath, 'utf-8');
            const entries = JSON.parse(raw);
            entry = entries.find((e: any) => e.id === entryId);
          } catch { /* ignorieren */ }
        }
      }
      
      if (!entry) {
        vscode.window.showErrorMessage('Eintrag nicht gefunden');
        return;
      }
      
      let markdown = '';
      const date = new Date(entry.timestamp);
      const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      
      if (mode === 'compact') {
        // Kompakt: Tabelle + kurze Übersicht
        markdown = `## Prompt-Kontext\n`;
        markdown += `> ${entry.prompt}\n\n`;
        markdown += `### Geänderte Dateien (${entry.changedFiles.length})\n`;
        markdown += `| Datei | Status | Änderungen |\n`;
        markdown += `|-------|--------|------------|\n`;
        
        for (const f of entry.changedFiles) {
          const fileName = f.uri.split('/').pop() || f.uri;
          const status = f.status === 'A' ? 'Neu' : f.status === 'D' ? 'Gelöscht' : 'Geändert';
          markdown += `| ${fileName} | ${status} | +${f.additions} -${f.deletions} |\n`;
        }
        
        markdown += `\n*${dateStr}, ${timeStr} · +${entry.totalAdditions} -${entry.totalDeletions}*\n`;
        
      } else {
        // Ausführlich: Mit Diff-Inhalt
        markdown = `# PromptGraph Kontext\n\n`;
        markdown += `## Ursprünglicher Prompt\n`;
        markdown += `${entry.prompt}\n\n`;
        markdown += `## Zeitpunkt\n`;
        markdown += `${dateStr}, ${timeStr}\n\n`;
        markdown += `## Änderungsübersicht\n`;
        markdown += `- ${entry.changedFiles.length} Dateien geändert\n`;
        markdown += `- +${entry.totalAdditions} Zeilen hinzugefügt\n`;
        markdown += `- -${entry.totalDeletions} Zeilen entfernt\n\n`;
        markdown += `---\n\n`;
        
        for (let i = 0; i < entry.changedFiles.length; i++) {
          const f = entry.changedFiles[i];
          const status = f.status === 'A' ? 'NEU' : f.status === 'D' ? 'GELÖSCHT' : 'GEÄNDERT';
          const ext = f.uri.split('.').pop() || 'txt';
          
          markdown += `## ${i + 1}. ${f.uri} (${status})\n\n`;
          
          if (f.status === 'A') {
            markdown += `\`\`\`${ext}\n${f.afterContent}\n\`\`\`\n\n`;
          } else if (f.status === 'D') {
            markdown += `\`\`\`${ext}\n${f.beforeContent}\n\`\`\`\n\n`;
          } else {
            // Diff für geänderte Dateien
            markdown += `### Vorher\n`;
            markdown += `\`\`\`${ext}\n${f.beforeContent.slice(0, 500)}${f.beforeContent.length > 500 ? '\n// ... (gekürzt)' : ''}\n\`\`\`\n\n`;
            markdown += `### Nachher\n`;
            markdown += `\`\`\`${ext}\n${f.afterContent.slice(0, 500)}${f.afterContent.length > 500 ? '\n// ... (gekürzt)' : ''}\n\`\`\`\n\n`;
          }
          
          markdown += `---\n\n`;
        }
      }
      
      // In Zwischenablage kopieren
      await vscode.env.clipboard.writeText(markdown);
    }
  );

  // --- Datei-Watcher starten ---
  coordinator.start();

  // --- Cleanup ---
  context.subscriptions.push(
    sidebarRegistration,
    panelRegistration,
    openFileCmd,
    viewDiff,
    clearHistory,
    clearWorkspace,
    deleteEntry,
    copyContext,
    store,
    registry,
    { dispose: () => coordinator.stop() },
    { dispose: () => cleanupTempFiles() }
  );
}

export function deactivate(): void {
  cleanupTempFiles();
}
