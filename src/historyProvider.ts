import * as vscode from 'vscode';
import * as path from 'path';
import { PromptEntry, ChangedFile, PromptHistoryStore } from './history.js';

// ─── TreeItem: Prompt-Eintrag (kollabierbar) ───────────────────────────────

export class PromptEntryItem extends vscode.TreeItem {
  readonly kind = 'entry' as const;

  constructor(public readonly entry: PromptEntry) {
    const label = entry.prompt.length > 55
      ? entry.prompt.slice(0, 52) + '…'
      : entry.prompt;

    // Kollabierbar — Klick klappt auf und zeigt Dateien
    super(label, vscode.TreeItemCollapsibleState.Collapsed);

    const n = entry.changedFiles.length;
    const date = new Date(entry.timestamp);
    const timeStr = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

    this.description = `${n} file${n !== 1 ? 's' : ''}  +${entry.totalAdditions} -${entry.totalDeletions}   ${dateStr} ${timeStr}`;

    this.tooltip = new vscode.MarkdownString(
      `**${escapeMarkdown(entry.prompt)}**\n\n` +
      `${n} Datei(en) geändert &nbsp; \`+${entry.totalAdditions}\` \`-${entry.totalDeletions}\`\n\n` +
      `*${date.toLocaleString('de-DE')}*`
    );

    this.iconPath = new vscode.ThemeIcon('git-commit');
    this.contextValue = 'promptEntry';

    // Kein command hier — Klick klappt auf/zu (CollapsibleState)
  }
}

// ─── TreeItem: Geänderte Datei (Blatt) ────────────────────────────────────

export class ChangedFileItem extends vscode.TreeItem {
  readonly kind = 'file' as const;

  constructor(
    public readonly file: ChangedFile,
    public readonly entry: PromptEntry
  ) {
    const basename = path.basename(file.uri);
    super(basename, vscode.TreeItemCollapsibleState.None);

    this.description = `${file.uri.replace(basename, '')}  +${file.additions} -${file.deletions}`;

    this.tooltip = new vscode.MarkdownString(
      `**${file.uri}**\n\n` +
      `\`+${file.additions} -${file.deletions}\``
    );

    // Status-Icon und Farbe
    const iconMap: Record<string, string> = {
      M: 'git-commit',
      A: 'diff-added',
      D: 'diff-removed',
    };
    this.iconPath = new vscode.ThemeIcon(iconMap[file.status] ?? 'file');

    // Farbliche Markierung wie im Git-Explorer
    const colorMap: Record<string, vscode.ThemeColor> = {
      M: new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'),
      A: new vscode.ThemeColor('gitDecoration.addedResourceForeground'),
      D: new vscode.ThemeColor('gitDecoration.deletedResourceForeground'),
    };
    if (colorMap[file.status]) {
      this.iconPath = new vscode.ThemeIcon(iconMap[file.status] ?? 'file', colorMap[file.status]);
    }

    // resourceUri für Datei-Dekoration (M/A/D Badge)
    // Wir setzen eine virtuelle URI — beim echten Workspace-Pfad wäre es die richtige Datei
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    if (workspaceRoot) {
      this.resourceUri = vscode.Uri.file(`${workspaceRoot}/${file.uri}`);
    }

    this.contextValue = 'changedFile';

    // Primär-Klick: Datei direkt öffnen
    this.command = {
      command: 'promptGraph.openFile',
      title: 'Datei öffnen',
      arguments: [entry, file],
    };
  }
}

export type HistoryTreeItem = PromptEntryItem | ChangedFileItem;

// ─── TreeDataProvider ─────────────────────────────────────────────────────

export class PromptHistoryProvider
  implements vscode.TreeDataProvider<HistoryTreeItem>
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    HistoryTreeItem | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly store: PromptHistoryStore) {
    store.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  getTreeItem(element: HistoryTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: HistoryTreeItem): HistoryTreeItem[] {
    if (!element) {
      // Root: alle Prompt-Einträge
      return this.store.getEntries().map(e => new PromptEntryItem(e));
    }

    if (element.kind === 'entry') {
      // Kinder eines Prompt-Eintrags: geänderte Dateien
      return element.entry.changedFiles.map(
        f => new ChangedFileItem(f, element.entry)
      );
    }

    return [];
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}

function escapeMarkdown(str: string): string {
  return str.replace(/[*_`[\]]/g, '\\$&');
}
