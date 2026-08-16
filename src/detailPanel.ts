import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { PromptEntry, ChangedFile } from './history.js';
import { getCodiconsUri, getNonce } from './webviewUtils.js';

// Temporäre Dateien für Diff-Ansicht verwalten
const tempFiles: string[] = [];

function writeTempFile(name: string, content: string): string {
  const tmpDir = path.join(os.tmpdir(), 'prompt-graph');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  tempFiles.push(filePath);
  return filePath;
}

export function cleanupTempFiles(): void {
  for (const f of tempFiles) {
    try { fs.unlinkSync(f); } catch { /* ignorieren */ }
  }
  tempFiles.length = 0;
}

export async function openDiff(entry: PromptEntry, file: ChangedFile): Promise<void> {
  const ext = path.extname(file.uri) || '.txt';
  const baseName = path.basename(file.uri, ext);

  const beforePath = writeTempFile(`${baseName}_before${ext}`, file.beforeContent);
  const afterPath  = writeTempFile(`${baseName}_after${ext}`,  file.afterContent);

  const beforeUri = vscode.Uri.file(beforePath);
  const afterUri  = vscode.Uri.file(afterPath);

  const title = `${file.status} ${file.uri} (+${file.additions} -${file.deletions})`;
  await vscode.commands.executeCommand('vscode.diff', beforeUri, afterUri, title);
}

/**
 * Öffnet die echte Datei im Editor und springt zur ersten geänderten Zeile.
 * Ist die Datei gelöscht (status D), öffnet stattdessen den Diff.
 */
export async function openFileAtChange(
  _entry: PromptEntry,
  file: ChangedFile
): Promise<void> {
  if (file.status === 'D') {
    await openDiff(_entry, file);
    return;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) return;

  const root = workspaceFolders[0].uri.fsPath;
  const absPath = path.join(root, file.uri);

  if (!fs.existsSync(absPath)) {
    await openDiff(_entry, file);
    return;
  }

  const fileUri = vscode.Uri.file(absPath);
  const doc = await vscode.workspace.openTextDocument(fileUri);
  const jumpLine = findFirstChangedLine(file.beforeContent, file.afterContent);

  await vscode.window.showTextDocument(doc, {
    viewColumn: vscode.ViewColumn.One,
    selection: new vscode.Range(jumpLine, 0, jumpLine, 0),
    preserveFocus: false,
  });
}

function findFirstChangedLine(before: string, after: string): number {
  const beforeLines = before.split('\n');
  const afterLines  = after.split('\n');
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (beforeLines[i] !== afterLines[i]) return i;
  }
  return 0;
}

// ── Dateityp-Badge (analog zu timelineView) ────────────────────────────────
const EXT_LABEL: Record<string, string> = {
  ts: 'TS', tsx: 'TSX', js: 'JS', jsx: 'JSX',
  json: 'JSON', md: 'MD', css: 'CSS', scss: 'SCSS',
  html: 'HTML', py: 'PY', rs: 'RS', go: 'GO',
  yaml: 'YML', yml: 'YML', toml: 'TOML', sh: 'SH',
  txt: 'TXT', svg: 'SVG', png: 'IMG', jpg: 'IMG',
};
function extLabel(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LABEL[ext] ?? (ext.toUpperCase().slice(0, 4) || '—');
}

const LINE_COLOR = '#4fc1ff';

// ─── WebView Panel ──────────────────────────────────────────────────────────

export class DetailPanel {
  private static currentPanel: DetailPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;

  private constructor(
    panel: vscode.WebviewPanel,
    private entry: PromptEntry,
    extensionUri: vscode.Uri
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.panel.onDidDispose(() => {
      DetailPanel.currentPanel = undefined;
    });
    this.panel.webview.onDidReceiveMessage(async msg => {
      if (msg.command === 'openDiff') {
        const file = this.entry.changedFiles.find(f => f.uri === msg.uri);
        if (file) await openDiff(this.entry, file);
      } else if (msg.command === 'openFile') {
        const file = this.entry.changedFiles.find(f => f.uri === msg.uri);
        if (file) await openFileAtChange(this.entry, file);
      }
    });
    this.update();
  }

  static show(entry: PromptEntry, extensionUri: vscode.Uri): void {
    if (DetailPanel.currentPanel) {
      DetailPanel.currentPanel.entry = entry;
      DetailPanel.currentPanel.update();
      DetailPanel.currentPanel.panel.reveal(vscode.ViewColumn.Two);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'promptGraphDetail',
      'PromptGraph',
      { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
      { 
        enableScripts: true, 
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'node_modules')]
      }
    );

    DetailPanel.currentPanel = new DetailPanel(panel, entry, extensionUri);
  }

  private update(): void {
    this.panel.title = `PromptGraph: ${this.entry.prompt.slice(0, 32)}…`;
    this.panel.webview.html = this.buildHtml();
  }

  private buildHtml(): string {
    const e = this.entry;
    const webview = this.panel.webview;
    const codiconsUri = getCodiconsUri(webview, this.extensionUri);
    const nonce = getNonce();
    
    const date = new Date(e.timestamp);
    const dateStr = date.toLocaleDateString('de-DE', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
    const timeStr = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    // Datei-Daten als JSON für JavaScript
    const filesData = e.changedFiles.map(f => ({
      uri: f.uri,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      beforeContent: f.beforeContent,
      afterContent: f.afterContent,
    }));
    const filesJson = JSON.stringify(filesData).replace(/<\/script>/gi, '<\\/script>');

    // File-Icon basierend auf Extension
    const getFileIcon = (uri: string): string => {
      const ext = uri.split('.').pop()?.toLowerCase() ?? '';
      const iconMap: Record<string, string> = {
        ts: 'symbol-method', tsx: 'symbol-method',
        js: 'symbol-method', jsx: 'symbol-method',
        json: 'json', md: 'markdown',
        css: 'symbol-color', scss: 'symbol-color',
        html: 'code', py: 'symbol-method',
        rs: 'symbol-method', go: 'symbol-method',
        yaml: 'settings-gear', yml: 'settings-gear',
        toml: 'settings-gear', sh: 'terminal',
        txt: 'file', svg: 'file-media',
        png: 'file-media', jpg: 'file-media',
      };
      return iconMap[ext] ?? 'file';
    };

    const filesHtml = e.changedFiles.map((f, idx) => {
      const baseName = f.uri.split('/').pop() ?? f.uri;
      const dir = f.uri.includes('/') ? f.uri.slice(0, f.uri.lastIndexOf('/')).replace(/\//g, '\\') : '';
      const safeUri = escHtml(f.uri);
      const fileIcon = getFileIcon(f.uri);

      return `<div class="file-item" data-idx="${idx}" data-uri="${safeUri}">
  <div class="file-header">
    <span class="chev"><i class="codicon codicon-chevron-right"></i></span>
    <span class="icon"><i class="codicon codicon-${fileIcon}"></i></span>
    <span class="name">${escHtml(baseName)}</span>
    <span class="path">${dir ? escHtml(dir) : ''}</span>
    <span class="action" data-uri="${safeUri}"><i class="codicon codicon-go-to-file"></i></span>
  </div>
  <div class="file-diff"></div>
</div>`;
    }).join('');

    const noFiles = `<div class="no-files"><i class="codicon codicon-info"></i> Keine Dateiänderungen</div>`;

    return /* html */`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link href="${codiconsUri}" rel="stylesheet" />
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  padding: 0;
  line-height: 1.5;
  overflow-x: hidden;
}

/* ── Header-Block ── */
.header {
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--vscode-panel-border);
}
.header-title {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
}
.header-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--vscode-descriptionForeground);
  font-size: 16px;
}
.header-prompt {
  flex: 1; min-width: 0;
  font-size: 0.93em;
  font-weight: 500;
  color: var(--vscode-foreground);
  word-break: break-word;
  line-height: 1.5;
  padding: 8px 12px;
  background: var(--vscode-input-background, #3c3c3c);
  border-radius: 8px;
}
.header-meta {
  font-size: 0.78em;
  color: var(--vscode-descriptionForeground);
  margin-bottom: 10px;
  padding-left: 38px;
}
.header-meta .sep { margin: 0 5px; opacity: 0.4; }
.stats-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-left: 38px;
  font-size: 0.8em;
  color: var(--vscode-descriptionForeground);
}
.add { color: var(--vscode-gitDecoration-addedResourceForeground, #4ec9b0); }
.del { color: #c74e39; }

/* ── Files List ── */
.files-list {
  border-top: 1px solid var(--vscode-panel-border);
}

/* ── File Item ── */
.file-item {
  border-bottom: 1px solid var(--vscode-panel-border);
}

.file-header {
  display: flex;
  align-items: center;
  height: 38px;
  padding: 0 14px;
  cursor: pointer;
}
.file-header:hover {
  background: var(--vscode-list-hoverBackground);
}
.file-item.expanded .file-header {
  background: var(--vscode-list-activeSelectionBackground);
}

.chev {
  width: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--vscode-foreground);
  opacity: 0.6;
  margin-right: 6px;
  transition: transform 0.12s ease;
}
.file-item.expanded .chev {
  transform: rotate(90deg);
}
.file-header:hover .chev {
  opacity: 1;
}

.icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  margin-right: 8px;
  color: var(--vscode-descriptionForeground);
}

.name {
  font-size: 13px;
  font-weight: 500;
  color: var(--vscode-foreground);
  white-space: nowrap;
  margin-right: 8px;
}

.path {
  flex: 1;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--vscode-foreground);
  opacity: 0.4;
  margin-left: 8px;
  cursor: pointer;
  border-radius: 4px;
}
.action:hover {
  opacity: 1;
  background: var(--vscode-toolbar-hoverBackground);
}

/* ── Diff ── */
.file-diff {
  display: none;
  background: var(--vscode-editor-background);
}
.file-item.expanded .file-diff {
  display: block;
}

.diff-container {
  display: flex;
  font-family: var(--vscode-editor-font-family, Consolas, monospace);
  font-size: 12px;
  line-height: 20px;
}

.diff-side {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.diff-side.left {
  border-right: 1px solid var(--vscode-panel-border);
}

.diff-line {
  display: flex;
  min-height: 20px;
  white-space: pre;
}

.diff-line.del {
  background: var(--vscode-diffEditor-removedLineBackground, rgba(136, 23, 23, 0.4));
}
.diff-line.add {
  background: var(--vscode-diffEditor-insertedLineBackground, rgba(35, 95, 75, 0.4));
}
.diff-line.unchanged {
  background: transparent;
}
.diff-line.empty {
  background: var(--vscode-diffEditor-removedLineBackground, rgba(136, 23, 23, 0.25));
  opacity: 0.5;
}

.line-num {
  flex-shrink: 0;
  width: 36px;
  text-align: right;
  padding: 0 6px 0 4px;
  color: var(--vscode-editorLineNumber-foreground);
  user-select: none;
}

.line-content {
  flex: 1;
  padding: 0 8px;
  min-width: 0;
  color: var(--vscode-editor-foreground);
}

/* ── No files ── */
.no-files {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  font-size: 0.85em;
  color: var(--vscode-descriptionForeground);
}
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div class="header-title">
    <div class="header-icon"><i class="codicon codicon-comment"></i></div>
    <div class="header-prompt">${escHtml(e.prompt)}</div>
  </div>
  <div class="header-meta">
    ${dateStr}<span class="sep">·</span>${timeStr}
  </div>
  <div class="stats-row">
    <span>${e.changedFiles.length} Datei${e.changedFiles.length !== 1 ? 'en' : ''} geändert</span>
    <span class="add">+${e.totalAdditions}</span>
    <span class="del">-${e.totalDeletions}</span>
  </div>
</div>

<!-- Dateien -->
<div class="files-list">
  ${e.changedFiles.length > 0 ? filesHtml : noFiles}
</div>

<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const FILES = ${filesJson};

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function computeDiff(before, after) {
  const beforeLines = before.split('\\n');
  const afterLines = after.split('\\n');
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  
  const result = { left: [], right: [] };
  
  for (let i = 0; i < maxLen; i++) {
    const bLine = beforeLines[i];
    const aLine = afterLines[i];
    const bExists = i < beforeLines.length;
    const aExists = i < afterLines.length;
    const isDiff = bLine !== aLine;
    
    result.left.push({
      num: bExists ? i + 1 : '',
      content: bExists ? bLine : '',
      type: !bExists ? 'empty' : (isDiff ? 'del' : 'unchanged')
    });
    
    result.right.push({
      num: aExists ? i + 1 : '',
      content: aExists ? aLine : '',
      type: !aExists ? 'empty' : (isDiff ? 'add' : 'unchanged')
    });
  }
  
  return result;
}

function renderDiff(file) {
  const diff = computeDiff(file.beforeContent, file.afterContent);
  
  const renderSide = (lines) => lines.map(l => 
    '<div class="diff-line ' + l.type + '">' +
    '<span class="line-num">' + l.num + '</span>' +
    '<span class="line-content">' + escapeHtml(l.content) + '</span>' +
    '</div>'
  ).join('');
  
  return '<div class="diff-container">' +
    '<div class="diff-side left">' + renderSide(diff.left) + '</div>' +
    '<div class="diff-side right">' + renderSide(diff.right) + '</div>' +
    '</div>';
}

// Toggle Accordion
document.querySelectorAll('.file-item').forEach(item => {
  const header = item.querySelector('.file-header');
  const diffEl = item.querySelector('.file-diff');
  const idx = parseInt(item.dataset.idx);
  const chev = item.querySelector('.chev');
  
  header.addEventListener('click', (e) => {
    if (e.target.closest('.action')) return;
    
    const isExpanded = item.classList.contains('expanded');
    
    if (isExpanded) {
      item.classList.remove('expanded');
    } else {
      if (!diffEl.innerHTML) {
        diffEl.innerHTML = renderDiff(FILES[idx]);
      }
      item.classList.add('expanded');
    }
  });
});

// Action icon
document.querySelectorAll('.action').forEach(icon => {
  icon.addEventListener('click', (e) => {
    e.stopPropagation();
    vscode.postMessage({ command: 'openFile', uri: icon.dataset.uri });
  });
});
</script>
</body>
</html>`;
  }
}

function escHtml(str: string): string {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}
