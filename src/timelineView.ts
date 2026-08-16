/**
 * TimelineView — SVG-basierte Graph-Timeline mit Workspace-Navigation
 *
 * Zwei Modi:
 * 1. Workspace-Liste: Zeigt alle Workspaces mit Prompt-Historie
 * 2. Timeline: Zeigt Prompts eines ausgewählten Workspace
 *
 * Navigation:
 * - Back-Button wechselt zur Workspace-Liste
 * - Workspace-Klick wechselt zur Timeline
 * - Neuer Prompt wechselt automatisch zum aktuellen Workspace
 */

import * as vscode from 'vscode';
import { PromptHistoryStore, PromptEntry } from './history.js';
import { WorkspaceRegistry, WorkspaceInfo } from './workspaceRegistry.js';

const C   = '#4fc1ff';   // Hauptfarbe
const ROW_H     = 22;    // Höhe einer Prompt-Zeile (px)
const FILE_H    = 20;    // Höhe einer Datei-Zeile (px)
const GRAPH_W   = 22;    // Breite der SVG-Spalte

const EXT_LABEL: Record<string, string> = {
  ts:'TS',tsx:'TSX',js:'JS',jsx:'JSX',json:'JSON',md:'MD',
  css:'CSS',scss:'SCSS',html:'HTML',py:'PY',rs:'RS',go:'GO',
  yaml:'YML',yml:'YML',toml:'TOML',sh:'SH',svg:'SVG',
  png:'IMG',jpg:'IMG',jpeg:'IMG',
};
function extLabel(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LABEL[ext] ?? (ext.toUpperCase().slice(0,4) || '—');
}

type ViewMode = 'workspaces' | 'timeline';

export class TimelineView implements vscode.WebviewViewProvider {
  public static readonly viewId = 'promptGraph.timeline';
  private view?: vscode.WebviewView;
  private mode: ViewMode = 'timeline';
  private selectedWorkspaceHash: string = '';

  constructor(
    private readonly store: PromptHistoryStore,
    private readonly extensionUri: vscode.Uri,
    private readonly onSelectEntry: (entry: PromptEntry) => void,
    private readonly registry?: WorkspaceRegistry
  ) {
    store.onDidChange(() => {
      // Bei neuem Prompt: automatisch zum aktuellen Workspace wechseln
      if (this.registry) {
        this.selectedWorkspaceHash = this.registry.getCurrentHash();
        this.mode = 'timeline';
      }
      this.refresh();
    });
    
    if (registry) {
      this.selectedWorkspaceHash = registry.getCurrentHash();
      registry.onDidChange(() => this.refresh());
    }
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage(msg => {
      switch (msg.command) {
        case 'selectEntry': {
          const entries = this.getEntriesForCurrentView();
          const entry = entries.find(e => e.id === msg.id);
          if (entry) this.onSelectEntry(entry);
          break;
        }
        case 'openDiff':
          vscode.commands.executeCommand('promptGraph.viewDiff', msg.entryId, msg.uri);
          break;
        case 'clearHistory':
          vscode.commands.executeCommand('promptGraph.clearHistory');
          break;
        case 'deleteEntry':
          vscode.commands.executeCommand('promptGraph.deleteEntry', msg.id, msg.workspace);
          break;
        case 'copyContext':
          vscode.commands.executeCommand('promptGraph.copyContext', msg.id, msg.workspace, msg.mode);
          break;
        case 'clearWorkspace':
          vscode.commands.executeCommand('promptGraph.clearWorkspace', msg.workspace);
          break;
        case 'showWorkspaces':
          this.mode = 'workspaces';
          this.refresh();
          break;
        case 'selectWorkspace':
          this.selectedWorkspaceHash = msg.hash;
          this.mode = 'timeline';
          this.refresh();
          break;
      }
    });
    this.refresh();
  }

  private getEntriesForCurrentView(): PromptEntry[] {
    if (!this.registry || this.selectedWorkspaceHash === this.registry.getCurrentHash()) {
      return this.store.getEntries();
    }
    return this.registry.getEntries(this.selectedWorkspaceHash);
  }

  refresh(): void {
    if (!this.view) return;
    
    if (this.mode === 'workspaces' && this.registry) {
      this.view.title = 'Workspaces';
      this.view.webview.html = this.buildWorkspacesHtml();
    } else {
      const wsName = this.getCurrentWorkspaceName();
      this.view.title = wsName;
      this.view.webview.html = this.buildTimelineHtml(this.getEntriesForCurrentView());
    }
  }

  private getCurrentWorkspaceName(): string {
    if (!this.registry) return this.store.workspaceName;
    const ws = this.registry.get(this.selectedWorkspaceHash);
    return ws?.name ?? this.store.workspaceName;
  }

  // ─── Workspace-Liste HTML ─────────────────────────────────────────────────

  private buildWorkspacesHtml(): string {
    const workspaces = this.registry?.getAll() ?? [];
    
    // Sammle alle Einträge für globale Suche
    const allEntries: { entry: PromptEntry; workspace: string; hash: string }[] = [];
    for (const ws of workspaces) {
      const entries = this.registry?.getEntries(ws.name) ?? [];
      for (const entry of entries) {
        allEntries.push({ entry, workspace: ws.name, hash: ws.name });
      }
    }
    
    const rows = workspaces.map(ws => {
      const date = new Date(ws.lastActivity);
      const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
      const currentBadge = ws.isCurrent ? '<span class="current-badge">●</span>' : '';
      
      return `<div class="ws-row${ws.isCurrent ? ' current' : ''}" data-hash="${ws.name}">
  <div class="ws-icon">📁</div>
  <div class="ws-info">
    <div class="ws-name">${currentBadge}${escHtml(ws.name)}</div>
    <div class="ws-meta">${ws.promptCount} Prompts · ${dateStr}</div>
  </div>
  <div class="ws-arrow">›</div>
</div>`;
    }).join('');

    const empty = workspaces.length === 0 ? `
      <div class="empty">
        <div style="font-size:1.6em;opacity:.2">📁</div>
        <div>Keine Workspaces</div>
        <small>Öffne ein Projekt und sende Prompts.</small>
      </div>` : '';

    const allEntriesJson = JSON.stringify(allEntries.map(e => ({
      id: e.entry.id,
      prompt: e.entry.prompt,
      timestamp: e.entry.timestamp,
      workspace: e.workspace,
      hash: e.hash
    }))).replace(/<\/script>/gi,'<\\/script>');

    return /* html */`<!DOCTYPE html>
<html lang="de"><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:var(--vscode-font-family);
  font-size:var(--vscode-font-size);
  color:var(--vscode-foreground);
  background:var(--vscode-sideBar-background);
  overflow-x:hidden; overflow-y:auto; user-select:none;
}

/* ── Suchleiste ── */
.search-bar{
  display:flex;
  align-items:center;
  gap:8px;
  padding:8px 12px;
  border-bottom:1px solid var(--vscode-panel-border);
  background:var(--vscode-sideBar-background);
  position:sticky;
  top:0;
  z-index:10;
}

.search-input{
  flex:1;
  background:var(--vscode-input-background);
  border:1px solid var(--vscode-input-border, transparent);
  color:var(--vscode-input-foreground);
  padding:5px 8px 5px 28px;
  border-radius:4px;
  font-size:.85em;
  outline:none;
}
.search-input:focus{
  border-color:${C};
}
.search-input::placeholder{
  color:var(--vscode-input-placeholderForeground);
}

.search-icon{
  position:absolute;
  left:20px;
  opacity:.5;
  pointer-events:none;
}

.ws-row{
  display:flex; align-items:center;
  padding:10px 12px;
  cursor:pointer;
  border-bottom:1px solid var(--vscode-panel-border);
}
.ws-row:hover{ background:var(--vscode-list-hoverBackground); }
.ws-row.current{ background:var(--vscode-list-activeSelectionBackground,rgba(79,193,255,.08)); }
.ws-row.hidden{ display:none; }

.ws-icon{
  font-size:1.4em;
  margin-right:10px;
  opacity:.7;
}

.ws-info{ flex:1; min-width:0; }

.ws-name{
  font-size:.95em;
  font-weight:500;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  display:flex;
  align-items:center;
  gap:6px;
}

.current-badge{
  color:${C};
  font-size:.7em;
}

.ws-meta{
  font-size:.75em;
  color:var(--vscode-descriptionForeground);
  margin-top:2px;
}

.ws-arrow{
  font-size:1.2em;
  opacity:.4;
  margin-left:8px;
}
.ws-row:hover .ws-arrow{ opacity:.8; }

/* ── Suchergebnisse ── */
.search-results{
  display:none;
}
.search-results.show{
  display:block;
}

.search-result{
  display:flex;
  align-items:center;
  padding:8px 12px;
  cursor:pointer;
  border-bottom:1px solid var(--vscode-panel-border);
}
.search-result:hover{
  background:var(--vscode-list-hoverBackground);
}

.search-result-icon{
  width:20px;
  color:${C};
  opacity:.7;
  margin-right:8px;
}

.search-result-content{
  flex:1;
  min-width:0;
}

.search-result-prompt{
  font-size:.9em;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

.search-result-meta{
  font-size:.72em;
  color:var(--vscode-descriptionForeground);
  margin-top:2px;
  display:flex;
  gap:8px;
}

.search-result-ws{
  color:${C};
}

.empty{
  display:flex; flex-direction:column; align-items:center;
  gap:8px; padding:48px 16px; text-align:center;
  color:var(--vscode-descriptionForeground);
}
.empty small{ font-size:.8em; opacity:.55; line-height:1.6; }

.no-results{
  display:none;
  padding:24px 16px;
  text-align:center;
  color:var(--vscode-descriptionForeground);
  font-size:.9em;
}
.no-results.show{ display:block; }
</style>
</head><body>

<div class="search-bar">
  <svg class="search-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
  </svg>
  <input type="text" class="search-input" id="searchInput" placeholder="Alle Workspaces durchsuchen...">
</div>

<div id="workspaces">${rows}</div>
<div id="searchResults" class="search-results"></div>
<div id="noResults" class="no-results">Keine Treffer</div>
${empty}

<script>
const vscode = acquireVsCodeApi();
const ALL_ENTRIES = ${allEntriesJson};

const searchInput = document.getElementById('searchInput');
const workspacesDiv = document.getElementById('workspaces');
const searchResultsDiv = document.getElementById('searchResults');
const noResultsDiv = document.getElementById('noResults');

searchInput.addEventListener('input', () => {
  const query = searchInput.value.toLowerCase().trim();
  
  if (!query) {
    // Zeige Workspaces, verstecke Suchergebnisse
    workspacesDiv.style.display = 'block';
    searchResultsDiv.classList.remove('show');
    noResultsDiv.classList.remove('show');
    document.querySelectorAll('.ws-row').forEach(row => row.classList.remove('hidden'));
    return;
  }
  
  // Verstecke Workspaces, zeige Suchergebnisse
  workspacesDiv.style.display = 'none';
  
  const results = ALL_ENTRIES.filter(e => 
    e.prompt.toLowerCase().includes(query) || 
    e.workspace.toLowerCase().includes(query)
  );
  
  if (results.length === 0) {
    searchResultsDiv.classList.remove('show');
    noResultsDiv.classList.add('show');
    return;
  }
  
  noResultsDiv.classList.remove('show');
  searchResultsDiv.classList.add('show');
  
  searchResultsDiv.innerHTML = results.slice(0, 50).map(r => {
    const date = new Date(r.timestamp);
    const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + 
                    date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const promptShort = r.prompt.length > 60 ? r.prompt.slice(0, 57) + '...' : r.prompt;
    
    return '<div class="search-result" data-hash="' + r.hash + '" data-id="' + r.id + '">' +
      '<div class="search-result-icon">○</div>' +
      '<div class="search-result-content">' +
        '<div class="search-result-prompt">' + escapeHtml(promptShort) + '</div>' +
        '<div class="search-result-meta">' +
          '<span class="search-result-ws">' + escapeHtml(r.workspace) + '</span>' +
          '<span>' + dateStr + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
  
  // Event Listener für Suchergebnisse
  document.querySelectorAll('.search-result').forEach(result => {
    result.addEventListener('click', () => {
      vscode.postMessage({ command: 'selectWorkspace', hash: result.dataset.hash });
    });
  });
});

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.querySelectorAll('.ws-row').forEach(row => {
  row.addEventListener('click', () => {
    vscode.postMessage({ command: 'selectWorkspace', hash: row.dataset.hash });
  });
});
</script>
</body></html>`;
  }

  // ─── Timeline HTML ────────────────────────────────────────────────────────

  private buildTimelineHtml(entries: PromptEntry[]): string {
    const rows = entries.map((e, i) => this.buildGroup(e, i, entries.length)).join('');
    const hasMultipleWorkspaces = (this.registry?.getAll().length ?? 0) >= 1;
    const isCurrentWorkspace = !this.registry || this.selectedWorkspaceHash === this.registry.getCurrentHash();

    // Navigation mit Suchfeld
    const navHeader = hasMultipleWorkspaces ? `
      <div class="nav-header">
        <button class="back-btn" id="backBtn" title="Zurück zu Workspaces">←</button>
        <div class="search-wrapper">
          <svg class="search-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
          </svg>
          <input type="text" class="search-input" id="searchInput" placeholder="Suchen...">
        </div>
        ${!isCurrentWorkspace ? '<span class="readonly-badge">Nur Lesen</span>' : ''}
        <button class="trash-btn" id="trashBtn" title="History löschen">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5zM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.5.5 0 0 0 0 1h.478l.667 10.001A1.5 1.5 0 0 0 5.15 15h5.7a1.5 1.5 0 0 0 1.498-1.499L13.016 3.5h.478a.5.5 0 0 0 0-1H11zM4.495 3.5h7.01l-.656 9.837a.5.5 0 0 1-.5.163H5.65a.5.5 0 0 1-.499-.163L4.495 3.5z"/>
          </svg>
        </button>
      </div>` : '';

    const empty = entries.length === 0 ? `
      <div class="empty">
        <div style="font-size:1.6em;opacity:.2">◎</div>
        <div>Noch keine Einträge</div>
        <small>Sende einen Prompt –<br>Änderungen werden getrackt.</small>
      </div>` : '';

    const dataJson = JSON.stringify(
      entries.map(e => ({
        id: e.id, prompt: e.prompt, timestamp: e.timestamp,
        totalAdditions: e.totalAdditions, totalDeletions: e.totalDeletions,
        files: e.changedFiles.map(f => ({ uri: f.uri, status: f.status, add: f.additions, del: f.deletions })),
      }))
    ).replace(/<\/script>/gi,'<\\/script>');

    return /* html */`<!DOCTYPE html>
<html lang="de"><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{border-radius:0!important}
body{
  font-family:var(--vscode-font-family);
  font-size:var(--vscode-font-size);
  color:var(--vscode-foreground);
  background:var(--vscode-sideBar-background);
  overflow-x:hidden; overflow-y:auto; user-select:none;
}

/* ── Navigation ── */
.nav-header{
  display:flex;
  align-items:center;
  gap:6px;
  padding:6px 8px;
  border-bottom:1px solid var(--vscode-panel-border);
  background:var(--vscode-sideBar-background);
  position:sticky;
  top:0;
  z-index:10;
}

.back-btn{
  background:none;
  border:none;
  color:${C};
  font-size:1em;
  cursor:pointer;
  padding:4px 6px;
  border-radius:4px;
  font-weight:bold;
  flex-shrink:0;
}
.back-btn:hover{
  background:var(--vscode-list-hoverBackground);
}

.search-wrapper{
  flex:1;
  position:relative;
  display:flex;
  align-items:center;
  min-width:0;
}

.search-input{
  width:100%;
  background:var(--vscode-input-background);
  border:1px solid var(--vscode-input-border, transparent);
  color:var(--vscode-input-foreground);
  padding:5px 8px 5px 28px;
  border-radius:4px;
  font-size:.85em;
  outline:none;
}
.search-input:focus{
  border-color:${C};
}
.search-input::placeholder{
  color:var(--vscode-input-placeholderForeground);
}

.search-icon{
  position:absolute;
  left:8px;
  opacity:.5;
  pointer-events:none;
}

.trash-btn{
  background:none;
  border:none;
  cursor:pointer;
  padding:4px 6px;
  border-radius:4px;
  color:var(--vscode-foreground);
  opacity:0.7;
  display:flex;
  align-items:center;
  flex-shrink:0;
}
.trash-btn:hover{
  background:var(--vscode-list-hoverBackground);
  opacity:1;
}
.trash-btn svg{
  width:16px;
  height:16px;
}

.readonly-badge{
  font-size:.65em;
  padding:2px 5px;
  background:var(--vscode-badge-background);
  color:var(--vscode-badge-foreground);
  border-radius:3px;
  flex-shrink:0;
  white-space:nowrap;
}

/* ── Gruppe ── */
.group{ position:relative; }

/* ── Zeilen ── */
.prompt-row{
  display:flex; align-items:center;
  min-height:${ROW_H}px;
  padding-left:${GRAPH_W + 4}px; padding-right:8px;
  cursor:pointer; position:relative; z-index:1;
}
.prompt-row:hover{ background:var(--vscode-list-hoverBackground); }
.group.sel .prompt-row{ background:var(--vscode-list-activeSelectionBackground,rgba(79,193,255,.1)); }

.file-row{
  display:flex; align-items:center;
  min-height:${FILE_H}px;
  padding-left:${GRAPH_W + 12}px; padding-right:8px;
  cursor:pointer; position:relative; z-index:1;
}
.file-row:hover{ background:var(--vscode-list-hoverBackground); }

/* ── SVG Graph-Spalte ── */
.graph-svg{
  position:absolute; left:0; top:0;
  pointer-events:none; overflow:visible;
  z-index: 2;
}

/* ── Texte ── */
.pt{ flex:1; min-width:0; font-size:.92em; font-weight:500;
     white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.group.sel .pt{ font-weight:600; }
.pm{ flex-shrink:0; font-size:.7em; color:var(--vscode-descriptionForeground);
     white-space:nowrap; margin-left:6px; }
.add{ color:#4ec9b0; } .del{ color:#f44747; }
.sep{ font-size:1.1em; opacity:.55; }

.fs{ flex-shrink:0; font-size:.72em; font-weight:700; width:13px;
     text-align:center; margin-right:4px; }
.fs.M{ color:#dcdcaa; } .fs.A{ color:#4ec9b0; }
.fs.D{ color:#f44747; } .fs.R{ color:#569cd6; }
.fb{
  flex-shrink:0; font-size:.6em; font-weight:700; font-family:monospace;
  padding:0 3px; border-radius:2px; min-width:20px; text-align:center;
  background:color-mix(in srgb,${C} 15%,transparent);
  color:${C}; margin-right:5px; opacity:.8;
}
.fn{ flex:1; min-width:0; font-size:.87em;
     white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:.85; }
.fd{
  font-size:.72em; color:var(--vscode-descriptionForeground);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  max-width:0; opacity:0; margin-left:0;
  transition:max-width .15s,opacity .15s,margin-left .15s;
}
.file-row:hover .fd{ max-width:130px; opacity:.5; margin-left:6px; }

/* ── Empty ── */
.empty{
  display:flex; flex-direction:column; align-items:center;
  gap:8px; padding:48px 16px; text-align:center;
  color:var(--vscode-descriptionForeground);
}
.empty small{ font-size:.8em; opacity:.55; line-height:1.6; }

/* ── Kontextmenü ── */
.context-menu{
  display:none;
  position:fixed;
  background:var(--vscode-menu-background);
  border:1px solid var(--vscode-menu-border);
  border-radius:4px;
  padding:4px 0;
  min-width:120px;
  box-shadow:0 2px 8px rgba(0,0,0,.3);
  z-index:100;
}
.context-menu.show{ display:block; }
.context-menu-item{
  display:flex;
  align-items:center;
  gap:8px;
  padding:6px 12px;
  font-size:.85em;
  color:var(--vscode-menu-foreground);
  cursor:pointer;
}
.context-menu-item:hover{
  background:var(--vscode-menu-selectionBackground);
  color:var(--vscode-menu-selectionForeground);
}
.context-menu-item.danger{ color:#f44747; }
.context-menu-item.danger:hover{ background:rgba(244,71,71,.15); }
.context-menu-separator{
  height:1px;
  background:var(--vscode-menu-separatorBackground, var(--vscode-panel-border));
  margin:4px 8px;
}
</style>
</head><body>

${navHeader}
<div id="tl">${rows}</div>
${empty}

<!-- Kontextmenü -->
<div id="contextMenu" class="context-menu">
  <div class="context-menu-item" id="copyCompact">📋 Kontext: Kompakt</div>
  <div class="context-menu-item" id="copyDetailed">📄 Kontext: Ausführlich</div>
  <div class="context-menu-separator"></div>
  <div class="context-menu-item danger" id="deleteEntry">🗑 Löschen</div>
</div>

<script>
const vscode = acquireVsCodeApi();
const DATA = ${dataJson};
const CURRENT_WORKSPACE = '${this.selectedWorkspaceHash}';
let sel = null;
const expanded = new Set();
let contextMenuTarget = null;

// Kontextmenü
const contextMenu = document.getElementById('contextMenu');

function showContextMenu(e, id) {
  e.preventDefault();
  contextMenuTarget = id;
  contextMenu.style.left = e.pageX + 'px';
  contextMenu.style.top = e.pageY + 'px';
  contextMenu.classList.add('show');
}

function hideContextMenu() {
  contextMenu.classList.remove('show');
  contextMenuTarget = null;
}

document.addEventListener('click', hideContextMenu);
document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('.prompt-row')) hideContextMenu();
});

document.getElementById('deleteEntry')?.addEventListener('click', () => {
  if (contextMenuTarget) {
    vscode.postMessage({ command: 'deleteEntry', id: contextMenuTarget, workspace: CURRENT_WORKSPACE });
  }
  hideContextMenu();
});

document.getElementById('copyCompact')?.addEventListener('click', () => {
  if (contextMenuTarget) {
    vscode.postMessage({ command: 'copyContext', id: contextMenuTarget, workspace: CURRENT_WORKSPACE, mode: 'compact' });
  }
  hideContextMenu();
});

document.getElementById('copyDetailed')?.addEventListener('click', () => {
  if (contextMenuTarget) {
    vscode.postMessage({ command: 'copyContext', id: contextMenuTarget, workspace: CURRENT_WORKSPACE, mode: 'detailed' });
  }
  hideContextMenu();
});

// Back-Button Handler
document.getElementById('backBtn')?.addEventListener('click', () => {
  vscode.postMessage({ command: 'showWorkspaces' });
});

// Trash-Button Handler
document.getElementById('trashBtn')?.addEventListener('click', () => {
  vscode.postMessage({ command: 'clearWorkspace', workspace: CURRENT_WORKSPACE });
});

// Search Handler
const searchInput = document.getElementById('searchInput');
searchInput?.addEventListener('input', () => {
  const query = searchInput.value.toLowerCase().trim();
  
  document.querySelectorAll('.group').forEach(group => {
    const id = group.dataset.id;
    const entry = DATA.find(e => e.id === id);
    if (!entry) return;
    
    if (!query || entry.prompt.toLowerCase().includes(query)) {
      group.style.display = 'block';
    } else {
      group.style.display = 'none';
    }
  });
  
  // SVGs neu berechnen für sichtbare Gruppen
  const visibleGroups = [...document.querySelectorAll('.group')].filter(g => g.style.display !== 'none');
  visibleGroups.forEach((g, i) => {
    const isLast = i === visibleGroups.length - 1;
    const isFirst = i === 0;
    g.dataset.isFirst = isFirst;
    g.dataset.isLast = isLast;
    
    const id = g.dataset.id;
    const entry = DATA.find(e => e.id === id);
    if (!entry) return;
    
    const svg = g.querySelector('.graph-svg');
    if (!svg) return;
    
    const isExpanded = expanded.has(id);
    const fileH = isExpanded ? entry.files.length * 20 : 0;
    const h = 22 + fileH + (isLast ? 14 : 0);
    svg.setAttribute('height', h);
    svg.innerHTML = buildSvgContentFiltered(g, entry, isExpanded, isFirst, isLast);
  });
});

function buildSvgContentFiltered(groupEl, entry, isExpanded, isFirst, isLast) {
  const fileCount = isExpanded ? entry.files.length : 0;
  const ny  = 11;
  const cx  = 10;
  const nr  =  4;
  const nir =  2;
  const lc  = '${C}';

  // Einheitliche Linie von oben nach unten
  const lineTop = isFirst ? '' :
    '<line x1="'+cx+'" y1="0" x2="'+cx+'" y2="'+(ny-nr)+'"'
    + ' stroke="'+lc+'" stroke-width="1.5" opacity=".6"/>';

  const groupH = 22 + fileCount * 20;
  const lineBottom = isLast ? '' :
    '<line x1="'+cx+'" y1="'+(ny+nr)+'" x2="'+cx+'" y2="'+groupH+'"'
    + ' stroke="'+lc+'" stroke-width="1.5" opacity=".6"/>';

  const endDot = isLast
    ? '<circle cx="'+cx+'" cy="'+(groupH + 6)+'" r="3" fill="'+lc+'" stroke="none" opacity=".8"/>'
    : '';
  
  const lineToEnd = isLast
    ? '<line x1="'+cx+'" y1="'+(ny+nr)+'" x2="'+cx+'" y2="'+(groupH + 3)+'"'
    + ' stroke="'+lc+'" stroke-width="1.5" opacity=".6"/>'
    : '';

  let fileGuide = '';
  if (fileCount > 0 && isExpanded) {
    const gx  = cx + 18;
    const gt  = ny + nr + 10;
    const gb  = 22 + fileCount * 20 - 2;
    fileGuide =
      '<line x1="'+gx+'" y1="'+gt+'" x2="'+gx+'" y2="'+gb+'"'
      + ' stroke="'+lc+'" stroke-width="1.5" opacity=".5"/>';
  }

  const nodeFill = isExpanded
    ? 'var(--vscode-list-activeSelectionBackground, rgba(79,193,255,.15))'
    : 'var(--vscode-sideBar-background)';
  const nodeRing =
    '<circle cx="'+cx+'" cy="'+ny+'" r="'+nr+'"'
    + ' fill="'+nodeFill+'" stroke="'+lc+'" stroke-width="1.5"/>';
  const nodeDot = isExpanded
    ? '<circle cx="'+cx+'" cy="'+ny+'" r="'+nir+'" fill="'+lc+'"/>'
    : '';

  return lineTop + lineBottom + lineToEnd + fileGuide + nodeRing + nodeDot + endDot;
}

function pick(id) {
  const wasExpanded = expanded.has(id);
  if (wasExpanded) {
    expanded.delete(id);
  } else {
    expanded.add(id);
  }
  
  if (sel && sel !== id) {
    const old = document.querySelector('.group[data-id="'+sel+'"]');
    if (old) { old.classList.remove('sel'); }
  }
  sel = id;
  
  const g = document.querySelector('.group[data-id="'+id+'"]');
  if (g) {
    g.classList.toggle('sel', !wasExpanded);
    g.classList.toggle('expanded', !wasExpanded);
    updateGroupDisplay(g, !wasExpanded);
  }
  
  if (!wasExpanded) {
    vscode.postMessage({ command:'selectEntry', id });
  }
}

function updateGroupDisplay(groupEl, isExpanded) {
  const id = groupEl.dataset.id;
  const entry = DATA.find(e => e.id === id);
  if (!entry) return;
  
  const fileRows = groupEl.querySelectorAll('.file-row');
  fileRows.forEach(fr => {
    fr.style.display = isExpanded ? 'flex' : 'none';
  });
  
  const pm = groupEl.querySelector('.pm');
  if (pm) {
    const date = new Date(entry.timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeStr = date.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
    const timeLabel = isToday
      ? timeStr
      : date.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }) + ' ' + timeStr;
    
    if (isExpanded && (entry.totalAdditions > 0 || entry.totalDeletions > 0)) {
      pm.innerHTML = '<span class="add">+'+entry.totalAdditions+'</span>&nbsp;<span class="del">-'+entry.totalDeletions+'</span><span class="sep">&nbsp;•&nbsp;</span><span>'+timeLabel+'</span>';
    } else {
      pm.innerHTML = '<span>'+timeLabel+'</span>';
    }
  }
  
  redrawSvg(groupEl, isExpanded);
}

function openDiff(entryId, uri, ev) {
  ev.stopPropagation();
  vscode.postMessage({ command:'openDiff', entryId, uri });
}

function redrawSvg(groupEl, isExpanded) {
  const svg = groupEl.querySelector('.graph-svg');
  if (!svg) return;
  const id = groupEl.dataset.id;
  const g = DATA.find(e => e.id === id);
  if (!g) return;
  const isLastGroup = !groupEl.nextElementSibling;
  const fileH = isExpanded ? g.files.length * 20 : 0;
  const h = 22 + fileH + (isLastGroup ? 14 : 0);
  svg.setAttribute('height', h);
  svg.innerHTML = buildSvgContent(groupEl, g, isExpanded);
}

function buildSvgContent(groupEl, entry, isExpanded) {
  const isFirst  = !groupEl.previousElementSibling;
  const isLast   = !groupEl.nextElementSibling;
  const fileCount = isExpanded ? entry.files.length : 0;
  const ny  = 11;
  const cx  = 10;
  const nr  =  4;
  const nir =  2;
  const lc  = '${C}';

  // Einheitliche Linie von oben nach unten
  const lineTop = isFirst ? '' :
    '<line x1="'+cx+'" y1="0" x2="'+cx+'" y2="'+(ny-nr)+'"'
    + ' stroke="'+lc+'" stroke-width="1.5" opacity=".6"/>';

  const groupH = 22 + fileCount * 20;
  const lineBottom = isLast ? '' :
    '<line x1="'+cx+'" y1="'+(ny+nr)+'" x2="'+cx+'" y2="'+groupH+'"'
    + ' stroke="'+lc+'" stroke-width="1.5" opacity=".6"/>';

  const endDot = isLast
    ? '<circle cx="'+cx+'" cy="'+(groupH + 6)+'" r="3" fill="'+lc+'" stroke="none" opacity=".8"/>'
    : '';
  
  const lineToEnd = isLast
    ? '<line x1="'+cx+'" y1="'+(ny+nr)+'" x2="'+cx+'" y2="'+(groupH + 3)+'"'
    + ' stroke="'+lc+'" stroke-width="1.5" opacity=".6"/>'
    : '';

  let fileGuide = '';
  if (fileCount > 0 && isExpanded) {
    const gx  = cx + 18;
    const gt  = ny + nr + 10;
    const gb  = 22 + fileCount * 20 - 2;
    fileGuide =
      '<line x1="'+gx+'" y1="'+gt+'" x2="'+gx+'" y2="'+gb+'"'
      + ' stroke="'+lc+'" stroke-width="1.5" opacity=".5"/>';
  }

  const nodeFill = isExpanded
    ? 'var(--vscode-list-activeSelectionBackground, rgba(79,193,255,.15))'
    : 'var(--vscode-sideBar-background)';
  const nodeRing =
    '<circle cx="'+cx+'" cy="'+ny+'" r="'+nr+'"'
    + ' fill="'+nodeFill+'" stroke="'+lc+'" stroke-width="1.5"/>';
  const nodeDot = isExpanded
    ? '<circle cx="'+cx+'" cy="'+ny+'" r="'+nir+'" fill="'+lc+'"/>'
    : '';

  return lineTop + lineBottom + lineToEnd + fileGuide + nodeRing + nodeDot + endDot;
}

// Initial SVGs rendern
document.querySelectorAll('.group').forEach(g => {
  const id = g.dataset.id;
  const entry = DATA.find(e => e.id === id);
  if (!entry) return;
  const svg = g.querySelector('.graph-svg');
  if (!svg) return;
  
  const isLastGroup = !g.nextElementSibling;
  const h = ${ROW_H} + (isLastGroup ? 14 : 0);
  svg.setAttribute('height', h);
  svg.setAttribute('width', '${GRAPH_W}');
  svg.innerHTML = buildSvgContent(g, entry, false);
  
  g.querySelectorAll('.file-row').forEach(fr => {
    fr.style.display = 'none';
  });
  
  const pm = g.querySelector('.pm');
  if (pm) {
    const date = new Date(entry.timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeStr = date.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
    const timeLabel = isToday
      ? timeStr
      : date.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }) + ' ' + timeStr;
    pm.innerHTML = '<span>'+timeLabel+'</span>';
  }

  g.querySelector('.prompt-row')?.addEventListener('click', () => pick(id));
  g.querySelector('.prompt-row')?.addEventListener('contextmenu', (e) => showContextMenu(e, id));
  
  const promptRow = g.querySelector('.prompt-row');
  promptRow?.addEventListener('mouseenter', () => {
    if (expanded.has(id)) return;
    const pm = g.querySelector('.pm');
    if (!pm) return;
    const date = new Date(entry.timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeStr = date.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
    const timeLabel = isToday
      ? timeStr
      : date.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }) + ' ' + timeStr;
    if (entry.totalAdditions > 0 || entry.totalDeletions > 0) {
      pm.innerHTML = '<span class="add">+'+entry.totalAdditions+'</span>&nbsp;<span class="del">-'+entry.totalDeletions+'</span><span class="sep">&nbsp;•&nbsp;</span><span>'+timeLabel+'</span>';
    }
  });
  promptRow?.addEventListener('mouseleave', () => {
    if (expanded.has(id)) return;
    const pm = g.querySelector('.pm');
    if (!pm) return;
    const date = new Date(entry.timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeStr = date.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
    const timeLabel = isToday
      ? timeStr
      : date.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }) + ' ' + timeStr;
    pm.innerHTML = '<span>'+timeLabel+'</span>';
  });
  
  g.querySelectorAll('.file-row').forEach(fr => {
    fr.addEventListener('click', ev => openDiff(id, fr.dataset.uri, ev));
  });
});
</script>
</body></html>`;
  }

  // ─── HTML-Gruppen ─────────────────────────────────────────────────────────

  private buildGroup(entry: PromptEntry, index: number, total: number): string {
    const date   = new Date(entry.timestamp);
    const now    = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeStr = date.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
    const timeLabel = isToday
      ? timeStr
      : date.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }) + ' ' + timeStr;

    const promptShort = entry.prompt.length > 50
      ? escHtml(entry.prompt.slice(0, 47)) + '…'
      : escHtml(entry.prompt);

    const meta = `<span>${timeLabel}</span>`;

    const fileRows = entry.changedFiles.map(f => {
      const base = f.uri.split('/').pop() ?? f.uri;
      const dir  = f.uri.includes('/') ? f.uri.slice(0, f.uri.lastIndexOf('/')) : '';
      return `<div class="file-row" data-uri="${escHtml(f.uri)}">
  <span class="fs ${f.status}">${f.status}</span>
  <span class="fb">${extLabel(f.uri)}</span>
  <span class="fn" title="${escHtml(f.uri)}">${escHtml(base)}</span>
  ${dir ? `<span class="fd">${escHtml(dir)}</span>` : ''}
</div>`;
    }).join('');

    const isLastEntry = index === total - 1;
    const svgH = ROW_H + (isLastEntry ? 14 : 0);
    const svg = `<svg class="graph-svg" width="${GRAPH_W}" height="${svgH}" xmlns="http://www.w3.org/2000/svg"></svg>`;

    return `<div class="group" data-id="${entry.id}" data-idx="${index}" data-total="${total}">
  ${svg}
  <div class="prompt-row" data-id="${entry.id}" title="${escHtml(entry.prompt)}">
    <span class="pt">${promptShort}</span>
    <span class="pm">${meta}</span>
  </div>
  ${fileRows}
</div>`;
  }
}

function escHtml(str: string): string {
  return str
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
