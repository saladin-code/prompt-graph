/**
 * WorkspaceRegistry
 * 
 * Scannt ~/.prompt-graph/workspaces/ und liest die history.json
 * aus jedem Workspace. Ermöglicht Zugriff auf alle Workspaces mit Prompt-Historie.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { PromptEntry } from './history.js';

// Basis-Verzeichnis für alle PromptGraph-Daten
const PROMPT_GRAPH_HOME = path.join(os.homedir(), '.prompt-graph');
const WORKSPACES_DIR = path.join(PROMPT_GRAPH_HOME, 'workspaces');

export interface WorkspaceInfo {
  name: string;           // Workspace-Name (Ordnername)
  historyPath: string;    // Pfad zur history.json
  promptCount: number;    // Anzahl der Prompts
  lastActivity: number;   // Timestamp des letzten Prompts
  isCurrent: boolean;     // Ist dies der aktuelle Workspace?
}

export class WorkspaceRegistry {
  private workspaces: Map<string, WorkspaceInfo> = new Map();
  private currentWorkspaceName: string = '';
  
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    // Aktuellen Workspace-Namen ermitteln
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    this.currentWorkspaceName = this.sanitizeName(workspaceFolder?.name ?? 'default');
    
    this.scan();
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

  /**
   * Scannt ~/.prompt-graph/workspaces/ nach Workspace-Ordnern mit history.json
   */
  scan(): void {
    this.workspaces.clear();
    
    // Verzeichnis erstellen falls nicht vorhanden
    if (!fs.existsSync(WORKSPACES_DIR)) {
      fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
      return;
    }

    try {
      const dirs = fs.readdirSync(WORKSPACES_DIR, { withFileTypes: true });
      
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        
        const name = dir.name;
        const historyPath = path.join(WORKSPACES_DIR, name, 'history.json');
        
        if (!fs.existsSync(historyPath)) continue;
        
        try {
          const raw = fs.readFileSync(historyPath, 'utf-8');
          const entries: PromptEntry[] = JSON.parse(raw);
          
          if (entries.length === 0) continue;
          
          // Letzten Timestamp ermitteln
          const lastActivity = entries.reduce((max, e) => Math.max(max, e.timestamp), 0);
          
          const info: WorkspaceInfo = {
            name,
            historyPath,
            promptCount: entries.length,
            lastActivity,
            isCurrent: name === this.currentWorkspaceName,
          };
          
          this.workspaces.set(name, info);
        } catch (err) {
          console.error(`[PromptGraph] Fehler beim Lesen von ${historyPath}:`, err);
        }
      }
      
      console.log(`[PromptGraph] ${this.workspaces.size} Workspaces in ~/.prompt-graph/workspaces/ gefunden`);
    } catch (err) {
      console.error('[PromptGraph] Fehler beim Scannen:', err);
    }
  }

  /**
   * Alle Workspaces mit Prompt-Historie (sortiert nach letzter Aktivität)
   */
  getAll(): WorkspaceInfo[] {
    return Array.from(this.workspaces.values())
      .sort((a, b) => {
        // Aktueller Workspace immer zuerst
        if (a.isCurrent) return -1;
        if (b.isCurrent) return 1;
        // Dann nach letzter Aktivität
        return b.lastActivity - a.lastActivity;
      });
  }

  /**
   * Workspace-Info für einen bestimmten Namen
   */
  get(name: string): WorkspaceInfo | undefined {
    return this.workspaces.get(name);
  }

  /**
   * Aktueller Workspace
   */
  getCurrent(): WorkspaceInfo | undefined {
    return this.workspaces.get(this.currentWorkspaceName);
  }

  /**
   * Name des aktuellen Workspace (sanitized)
   */
  getCurrentHash(): string {
    return this.currentWorkspaceName;
  }

  /**
   * Liest die Prompt-Historie eines Workspace
   */
  getEntries(name: string): PromptEntry[] {
    const info = this.workspaces.get(name);
    if (!info) return [];
    
    try {
      const raw = fs.readFileSync(info.historyPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  /**
   * Registry neu laden (z.B. nach neuem Prompt)
   */
  refresh(): void {
    this.scan();
    this._onDidChange.fire();
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
