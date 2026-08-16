import * as vscode from 'vscode';

/**
 * Gibt die URI für Codicons CSS zurück.
 */
export function getCodiconsUri(webview: vscode.Webview, extensionUri: vscode.Uri): vscode.Uri {
  return webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
  );
}

/**
 * Nonce für Content Security Policy
 */
export function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
