import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface ChangedFile {
  uri: string;        // workspace-relativer Pfad
  status: 'M' | 'A' | 'D';
  additions: number;
  deletions: number;
  beforeContent: string;
  afterContent: string;
}

export interface PromptEntry {
  id: string;
  prompt: string;
  timestamp: number;
  changedFiles: ChangedFile[];
  totalAdditions: number;
  totalDeletions: number;
}

// Basis-Verzeichnis für alle PromptGraph-Daten
const PROMPT_GRAPH_HOME = path.join(os.homedir(), '.prompt-graph');
const WORKSPACES_DIR = path.join(PROMPT_GRAPH_HOME, 'workspaces');

export class PromptHistoryStore {
  private entries: PromptEntry[] = [];
  private storePath: string;
  private _workspaceName: string;
  private _workspacePath: string;

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(context: vscode.ExtensionContext) {
    // Workspace-Info ermitteln
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    this._workspaceName = workspaceFolder?.name ?? 'default';
    this._workspacePath = workspaceFolder?.uri.fsPath ?? '';
    
    // Neuer Speicherpfad: ~/.prompt-graph/workspaces/<workspace-name>/history.json
    const workspaceDir = path.join(WORKSPACES_DIR, this.sanitizeName(this._workspaceName));
    this.storePath = path.join(workspaceDir, 'history.json');
    
    // Verzeichnis erstellen falls nicht vorhanden
    if (!fs.existsSync(workspaceDir)) {
      fs.mkdirSync(workspaceDir, { recursive: true });
    }
    
    this.load();
    this.migrateFromAppData(context);
  }

  get workspaceName(): string {
    return this._workspaceName;
  }

  /**
   * Sanitize workspace name für Dateisystem (keine Sonderzeichen)
   */
  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private load(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf-8');
        this.entries = JSON.parse(raw);
      }
    } catch {
      this.entries = [];
    }
  }

  /**
   * Migriert alte Einträge aus AppData (VS Code/Kiro workspaceStorage) 
   * in das neue ~/.prompt-graph/ Verzeichnis
   */
  private migrateFromAppData(context: vscode.ExtensionContext): void {
    // Alte Pfade prüfen
    const oldPaths = [
      // Workspace-spezifischer Pfad
      context.storageUri ? path.join(context.storageUri.fsPath, 'history.json') : null,
      // Globaler Pfad
      path.join(context.globalStorageUri.fsPath, 'history.json'),
    ].filter(Boolean) as string[];

    const existingIds = new Set(this.entries.map(e => e.id));
    let migrated = 0;

    for (const oldPath of oldPaths) {
      if (!fs.existsSync(oldPath)) continue;

      try {
        const raw = fs.readFileSync(oldPath, 'utf-8');
        const oldEntries: PromptEntry[] = JSON.parse(raw);
        
        for (const entry of oldEntries) {
          if (existingIds.has(entry.id)) continue;
          
          // Prüfen ob Eintrag zu diesem Workspace gehört
          const workspaceNameLower = this._workspaceName.toLowerCase();
          const belongsHere = entry.changedFiles.some(f => 
            f.uri.toLowerCase().includes(workspaceNameLower)
          ) || entry.changedFiles.length === 0;
          
          if (belongsHere) {
            this.entries.push(entry);
            existingIds.add(entry.id);
            migrated++;
          }
        }
      } catch {
        // Ignorieren
      }
    }

    if (migrated > 0) {
      this.entries.sort((a, b) => b.timestamp - a.timestamp);
      this.save();
      console.log(`[PromptGraph] ${migrated} Einträge migriert nach ~/.prompt-graph/workspaces/${this._workspaceName}/`);
      this._onDidChange.fire();
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storePath, JSON.stringify(this.entries, null, 2), 'utf-8');
    } catch (err) {
      console.error('[PromptGraph] Fehler beim Speichern:', err);
    }
  }

  addEntry(entry: PromptEntry): void {
    this.entries.unshift(entry);     // neueste zuerst
    this.save();
    this._onDidChange.fire();
  }

  getEntries(): PromptEntry[] {
    return this.entries;
  }

  getEntry(id: string): PromptEntry | undefined {
    return this.entries.find(e => e.id === id);
  }

  clear(): void {
    this.entries = [];
    this.save();
    this._onDidChange.fire();
  }

  deleteEntry(id: string): boolean {
    const index = this.entries.findIndex(e => e.id === id);
    if (index === -1) return false;
    
    this.entries.splice(index, 1);
    this.save();
    this._onDidChange.fire();
    return true;
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
