/**
 * Tipos de mensagens entre Extension (Node.js) e Webview (React).
 *
 * Comunicação via vscode.Webview.postMessage / acquireVsCodeApi().postMessage.
 * Discriminated unions pelo campo `type` para type safety.
 */

import type { ChatEventNotification, SessionInfo } from './protocol.js'

// ─── Webview → Extension ──────────────────────────────────────────

export type WebviewToExtension =
  | { type: 'chat:send'; content: string }
  | { type: 'chat:abort' }
  | { type: 'session:create'; title?: string | undefined }
  | { type: 'session:list' }
  | { type: 'session:select'; id: string }
  | { type: 'session:delete'; id: string }
  | { type: 'config:list' }
  | { type: 'codebase:index' }
  | { type: 'codebase:search'; query: string; limit?: number }
  | { type: 'ready' }

// ─── Extension → Webview ──────────────────────────────────────────

export type ExtensionToWebview =
  | { type: 'chat:event'; event: ChatEventNotification }
  | { type: 'chat:complete' }
  | { type: 'session:created'; session: SessionInfo }
  | { type: 'session:list:result'; sessions: SessionInfo[] }
  | { type: 'session:active'; session: SessionInfo }
  | { type: 'status:update'; status: CoreStatus }
  | { type: 'context:selection'; text: string; language: string; filePath: string }
  | { type: 'config:result'; config: Record<string, unknown> }
  | { type: 'codebase:result'; results: CodebaseSearchResult[]; query: string }
  | { type: 'codebase:indexed'; totalFiles: number; totalChunks: number }
  | { type: 'codebase:error'; message: string }

export interface CodebaseSearchResult {
  file: string
  startLine: number
  endLine: number
  language: string
  symbolName?: string
  chunkType: string
  score: number
  source: string
  content: string
}

export type CoreStatus = 'starting' | 'ready' | 'error' | 'stopped'
