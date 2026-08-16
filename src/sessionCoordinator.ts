/**
 * SessionCoordinator
 *
 * Überwacht ein temp-Verzeichnis auf neue Event-Dateien,
 * die von hookHandler.js geschrieben werden.
 *
 * Kein HTTP-Server → kein Port-Konflikt mit Kiro.
 *
 *   UserPromptSubmit → Prompt + Workspace-Snapshot merken
 *   Stop             → Diff berechnen → History-Eintrag speichern
 *
 * Verarbeitet nur Events für den aktuellen Workspace.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { PromptHistoryStore, PromptEntry } from './history.js';
import { takeSnapshot, computeChanges, WorkspaceSnapshot } from './snapshot.js';

const EVENT_DIR = path.join(os.tmpdir(), 'prompt-graph-events');

interface EventPayload {
  event: string;
  prompt: string;
  ts: number;
  workspacePath?: string;
}

interface PendingSession {
  prompt: string;
  snapshot: WorkspaceSnapshot;
  startedAt: number;
}

export class SessionCoordinator {
  private watcher: fs.FSWatcher | undefined;
  private pending: PendingSession | undefined;
  // Bereits verarbeitete Dateien (verhindert Doppelverarbeitung)
  private processed = new Set<string>();
  // Aktueller Workspace-Pfad
  private currentWorkspacePath: string;

  constructor(private readonly store: PromptHistoryStore) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    this.currentWorkspacePath = workspaceFolder?.uri.fsPath ?? '';
  }

  start(): void {
    // Verzeichnis anlegen falls nicht vorhanden
    if (!fs.existsSync(EVENT_DIR)) {
      fs.mkdirSync(EVENT_DIR, { recursive: true });
    }

    // Alte Event-Dateien beim Start aufräumen
    this.cleanOldEvents();

    // Verzeichnis überwachen
    this.watcher = fs.watch(EVENT_DIR, (_eventType, filename) => {
      if (!filename || !filename.endsWith('.json')) return;
      if (this.processed.has(filename)) return;

      const filepath = path.join(EVENT_DIR, filename);

      // Kurz warten bis die Datei vollständig geschrieben ist
      setTimeout(() => {
        this.processEventFile(filepath, filename);
      }, 100);
    });

    console.log(`[PromptGraph] Überwache Event-Verzeichnis: ${EVENT_DIR}`);
    console.log(`[PromptGraph] Aktueller Workspace: ${this.currentWorkspacePath}`);
  }

  stop(): void {
    this.watcher?.close();
    this.cleanOldEvents();
  }

  private processEventFile(filepath: string, filename: string): void {
    if (this.processed.has(filename)) return;
    this.processed.add(filename);

    try {
      if (!fs.existsSync(filepath)) return;
      const raw = fs.readFileSync(filepath, 'utf-8');
      const payload = JSON.parse(raw) as EventPayload;

      // Datei sofort löschen (sauber halten)
      try { fs.unlinkSync(filepath); } catch { /* ignorieren */ }

      // Nur Events für diesen Workspace verarbeiten
      if (payload.workspacePath && this.currentWorkspacePath) {
        const normalizedEvent = path.normalize(payload.workspacePath).toLowerCase();
        const normalizedCurrent = path.normalize(this.currentWorkspacePath).toLowerCase();
        if (normalizedEvent !== normalizedCurrent) {
          console.log(`[PromptGraph] Event für anderen Workspace ignoriert: ${payload.workspacePath}`);
          return;
        }
      }

      this.handleEvent(payload);
    } catch (err) {
      console.error('[PromptGraph] Fehler beim Lesen der Event-Datei:', err);
    }
  }

  private handleEvent(payload: EventPayload): void {
    console.log(`[PromptGraph] Event: ${payload.event}, Prompt: "${payload.prompt.slice(0, 50)}"`);

    if (payload.event === 'UserPromptSubmit') {
      this.onPromptSubmit(payload.prompt);
    } else if (payload.event === 'Stop') {
      this.onAgentStop();
    }
  }

  private onPromptSubmit(prompt: string): void {
    this.pending = {
      prompt: prompt.trim() || '(kein Prompt-Text)',
      snapshot: takeSnapshot(),
      startedAt: Date.now(),
    };
    console.log(`[PromptGraph] Snapshot aufgenommen für: "${this.pending.prompt.slice(0, 50)}"`);
  }

  private onAgentStop(): void {
    if (!this.pending) {
      console.log('[PromptGraph] Stop ohne aktive Session – ignoriert.');
      return;
    }

    const { prompt, snapshot: before } = this.pending;
    this.pending = undefined;

    const after = takeSnapshot();
    const changes = computeChanges(before, after);

    if (changes.length === 0) {
      console.log('[PromptGraph] Keine Dateiänderungen – kein Eintrag.');
      return;
    }

    const totalAdditions = changes.reduce((s, f) => s + f.additions, 0);
    const totalDeletions = changes.reduce((s, f) => s + f.deletions, 0);

    const entry: PromptEntry = {
      id: crypto.randomUUID(),
      prompt,
      timestamp: Date.now(),
      changedFiles: changes,
      totalAdditions,
      totalDeletions,
    };

    this.store.addEntry(entry);
    console.log(`[PromptGraph] Eintrag gespeichert: ${changes.length} Datei(en)`);

    vscode.window.showInformationMessage(
      `PromptGraph: ${changes.length} Datei(en) geändert  +${totalAdditions} -${totalDeletions}`
    );
  }

  private cleanOldEvents(): void {
    try {
      const files = fs.readdirSync(EVENT_DIR);
      const cutoff = Date.now() - 60 * 60 * 1000; // älter als 1 Stunde
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const fp = path.join(EVENT_DIR, f);
        try {
          const stat = fs.statSync(fp);
          if (stat.mtimeMs < cutoff) fs.unlinkSync(fp);
        } catch { /* ignorieren */ }
      }
    } catch { /* Verzeichnis existiert noch nicht */ }
  }
}
