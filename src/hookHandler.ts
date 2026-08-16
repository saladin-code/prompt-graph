#!/usr/bin/env node
/**
 * hookHandler.ts
 *
 * Wird von Kiro-Hooks als Node-Script aufgerufen.
 * Kommuniziert NICHT über HTTP (Port-Konflikte mit Kiro),
 * sondern schreibt ein Event als JSON-Datei in ein temp-Verzeichnis.
 * Der SessionCoordinator überwacht dieses Verzeichnis via fs.watch.
 *
 * Event-Datei: %TEMP%/prompt-graph-events/event-<timestamp>.json
 * Enthält auch den Workspace-Pfad für workspace-spezifische Speicherung.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const EVENT_DIR = path.join(os.tmpdir(), 'prompt-graph-events');

interface HookPayload {
  sessionId?: string;
  userMessage?: string;
  prompt?: string;
  content?: string;
  workspaceFolder?: string;
  workspaceFolders?: Array<{ uri: string; name: string }>;
  [key: string]: unknown;
}

async function main(): Promise<void> {
  const raw = await readStdin();
  const event = process.argv[2] ?? 'unknown';

  let hookPayload: HookPayload = {};
  try {
    hookPayload = JSON.parse(raw) as HookPayload;
  } catch {
    // kein gültiges JSON — trotzdem Event schreiben
  }

  const prompt =
    typeof hookPayload.userMessage === 'string' ? hookPayload.userMessage :
    typeof hookPayload.prompt === 'string' ? hookPayload.prompt :
    typeof hookPayload.content === 'string' ? hookPayload.content :
    '';

  // Workspace-Pfad extrahieren (verschiedene mögliche Quellen)
  let workspacePath = '';
  if (typeof hookPayload.workspaceFolder === 'string') {
    workspacePath = hookPayload.workspaceFolder;
  } else if (Array.isArray(hookPayload.workspaceFolders) && hookPayload.workspaceFolders.length > 0) {
    // URI kann file:///path/to/folder sein
    const uri = hookPayload.workspaceFolders[0].uri;
    workspacePath = uri.startsWith('file://') ? uri.replace(/^file:\/\/\/?/, '') : uri;
  }
  
  // Windows-Pfade normalisieren
  workspacePath = workspacePath.replace(/\//g, path.sep);

  // Zielverzeichnis anlegen
  if (!fs.existsSync(EVENT_DIR)) {
    fs.mkdirSync(EVENT_DIR, { recursive: true });
  }

  // Event-Datei mit Timestamp schreiben (eindeutiger Name)
  const filename = `event-${Date.now()}-${event}.json`;
  const filepath = path.join(EVENT_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify({ 
    event, 
    prompt, 
    ts: Date.now(),
    workspacePath 
  }), 'utf-8');
  console.log(`[PromptGraph Hook] Event geschrieben: ${filename}`);
}

function readStdin(): Promise<string> {
  return new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    setTimeout(() => resolve(data), 1000);
  });
}

main().catch(err => {
  console.error('[PromptGraph Hook] Fehler:', err);
  process.exit(0); // Kiro nicht blockieren
});
