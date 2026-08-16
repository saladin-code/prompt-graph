import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChangedFile } from './history';

// Dateimuster, die ignoriert werden sollen
const IGNORE_PATTERNS = [
  /node_modules/,
  /\.git\//,
  /out\//,
  /dist\//,
  /\.kiro\/hooks\//,
  /history\.json$/,
  /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i,
];

export interface FileSnapshot {
  /** workspace-relativer Pfad */
  relativePath: string;
  content: string;
  mtime: number;
}

export type WorkspaceSnapshot = Map<string, FileSnapshot>;

function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some(p => p.test(filePath.replace(/\\/g, '/')));
}

function collectFiles(dir: string, root: string, result: FileSnapshot[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs).replace(/\\/g, '/');

    if (shouldIgnore(rel)) continue;

    if (entry.isDirectory()) {
      collectFiles(abs, root, result);
    } else if (entry.isFile()) {
      try {
        const stat = fs.statSync(abs);
        const content = fs.readFileSync(abs, 'utf-8');
        result.push({ relativePath: rel, content, mtime: stat.mtimeMs });
      } catch {
        // Binärdateien oder gesperrte Dateien überspringen
      }
    }
  }
}

export function takeSnapshot(): WorkspaceSnapshot {
  const snapshot: WorkspaceSnapshot = new Map();
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) return snapshot;

  for (const folder of folders) {
    const root = folder.uri.fsPath;
    const files: FileSnapshot[] = [];
    collectFiles(root, root, files);
    for (const f of files) {
      snapshot.set(f.relativePath, f);
    }
  }
  return snapshot;
}

function countDiff(before: string, after: string): { additions: number; deletions: number } {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  // Einfacher Zeilenvergleich — kein echter Myers-Diff, aber ausreichend für MVP
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);

  const additions = afterLines.filter(l => !beforeSet.has(l)).length;
  const deletions = beforeLines.filter(l => !afterSet.has(l)).length;
  return { additions, deletions };
}

export function computeChanges(
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot
): ChangedFile[] {
  const changes: ChangedFile[] = [];

  // Geänderte und neue Dateien
  for (const [relPath, afterFile] of after) {
    const beforeFile = before.get(relPath);

    if (!beforeFile) {
      // Neue Datei
      const additions = afterFile.content.split('\n').length;
      changes.push({
        uri: relPath,
        status: 'A',
        additions,
        deletions: 0,
        beforeContent: '',
        afterContent: afterFile.content,
      });
    } else if (beforeFile.content !== afterFile.content) {
      // Geänderte Datei
      const { additions, deletions } = countDiff(beforeFile.content, afterFile.content);
      if (additions > 0 || deletions > 0) {
        changes.push({
          uri: relPath,
          status: 'M',
          additions,
          deletions,
          beforeContent: beforeFile.content,
          afterContent: afterFile.content,
        });
      }
    }
  }

  // Gelöschte Dateien
  for (const [relPath, beforeFile] of before) {
    if (!after.has(relPath)) {
      const deletions = beforeFile.content.split('\n').length;
      changes.push({
        uri: relPath,
        status: 'D',
        additions: 0,
        deletions,
        beforeContent: beforeFile.content,
        afterContent: '',
      });
    }
  }

  return changes;
}
