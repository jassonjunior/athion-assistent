/* eslint-disable no-console */
/**
 * Servidor WebSocket do observability-athion.
 * Serve a API de testes, faz streaming de eventos, e serve o frontend estático.
 */

import { resolve } from 'node:path'
import type { ServerWebSocket } from 'bun'
import type { WsClientMessage, WsServerMessage } from './protocol'
import { PROTOCOL_VERSION } from './protocol'
import { listTests, runTest, stopTest } from './test-runner'
import { createCodebaseIndexer } from '@athion/core'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PORT = Number(process.env.PORT) || 3457
const DIST_DIR = resolve(import.meta.dir, '../../dist')

type WsData = { id: string }

const clients = new Set<ServerWebSocket<WsData>>()

function broadcast(msg: WsServerMessage): void {
  const data = JSON.stringify(msg)
  for (const ws of clients) {
    try {
      ws.send(data)
    } catch {
      clients.delete(ws)
    }
  }
}

/** MIME types para servir estáticos */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

/** Serve arquivo estático do dist/ */
async function serveStatic(pathname: string): Promise<Response | null> {
  const filePath = resolve(DIST_DIR, pathname === '/' ? 'index.html' : pathname.slice(1))
  const file = Bun.file(filePath)
  if (await file.exists()) {
    const ext = filePath.substring(filePath.lastIndexOf('.'))
    return new Response(file, {
      headers: { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' },
    })
  }
  return null
}

/** Handler para arquivos estáticos com SPA fallback */
async function handleStatic(pathname: string): Promise<Response> {
  const response = await serveStatic(pathname)
  if (response) return response

  // SPA fallback — serve index.html
  const indexResponse = await serveStatic('/')
  if (indexResponse) return indexResponse

  return new Response('Athion Observability — run "bun run build" first', { status: 200 })
}

const server = Bun.serve<WsData>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url)

    // WebSocket upgrade — DEVE ser síncrono (Bun exige)
    // Aceita /api/ws (para proxy do Vite) e /ws (acesso direto)
    if (url.pathname === '/api/ws' || url.pathname === '/ws') {
      const upgraded = server.upgrade(req, {
        data: { id: crypto.randomUUID() },
      })
      if (upgraded) return undefined
      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    // REST API: lista testes
    if (url.pathname === '/api/tests') {
      return Response.json(listTests())
    }

    // Serve frontend estático (dist/) — retorna Promise<Response>
    return handleStatic(url.pathname)
  },

  websocket: {
    open(ws) {
      clients.add(ws)
      console.log(`[ws] Client connected (${clients.size} total)`)

      // Enviar versão do protocolo ao conectar
      ws.send(
        JSON.stringify({
          type: 'protocol:version',
          version: PROTOCOL_VERSION,
        } satisfies WsServerMessage),
      )

      // Enviar lista de testes ao conectar
      ws.send(JSON.stringify({ type: 'test:list', tests: listTests() } satisfies WsServerMessage))
    },

    message(ws, raw) {
      try {
        const msg = JSON.parse(String(raw)) as WsClientMessage

        switch (msg.type) {
          case 'test:list':
            ws.send(
              JSON.stringify({
                type: 'test:list',
                tests: listTests(),
              } satisfies WsServerMessage),
            )
            break

          case 'test:run':
            console.log(`[ws] Running test: ${msg.testName}`)
            // Executar em background — broadcast de eventos para todos os clients
            runTest(msg.testName, broadcast).catch((err) => {
              console.error('[ws] Test error:', err)
            })
            break

          case 'test:stop':
            console.log('[ws] Stopping test')
            stopTest()
            break

          case 'codebase:index': {
            const workspacePath = msg.workspacePath ?? process.cwd()
            const dbPath = join(homedir(), '.athion', 'index.db')
            const indexer = createCodebaseIndexer({ workspacePath, dbPath })
            console.log(`[ws] Indexing codebase: ${workspacePath}`)
            indexer
              .indexWorkspace((indexed, total, currentFile) => {
                ws.send(
                  JSON.stringify({
                    type: 'codebase:progress',
                    indexed,
                    total,
                    currentFile,
                    ts: Date.now(),
                  } satisfies WsServerMessage),
                )
              })
              .then((stats) => {
                indexer.close()
                ws.send(
                  JSON.stringify({
                    type: 'codebase:indexed',
                    totalFiles: stats.totalFiles,
                    totalChunks: stats.totalChunks,
                    hasVectors: stats.hasVectors,
                    ts: Date.now(),
                  } satisfies WsServerMessage),
                )
              })
              .catch((err) => {
                indexer.close()
                ws.send(
                  JSON.stringify({
                    type: 'codebase:error',
                    message: err instanceof Error ? err.message : String(err),
                    ts: Date.now(),
                  } satisfies WsServerMessage),
                )
              })
            break
          }

          case 'codebase:search': {
            const dbPath = join(homedir(), '.athion', 'index.db')
            const indexer = createCodebaseIndexer({ workspacePath: process.cwd(), dbPath })
            indexer
              .search(msg.query, msg.limit ?? 8)
              .then((results) => {
                indexer.close()
                ws.send(
                  JSON.stringify({
                    type: 'codebase:results',
                    query: msg.query,
                    results: results.map((r) => ({
                      file: r.chunk.filePath,
                      startLine: r.chunk.startLine,
                      endLine: r.chunk.endLine,
                      language: r.chunk.language,
                      symbolName: r.chunk.symbolName,
                      chunkType: r.chunk.chunkType,
                      score: r.score,
                      source: r.source,
                    })),
                    ts: Date.now(),
                  } satisfies WsServerMessage),
                )
              })
              .catch((err) => {
                indexer.close()
                ws.send(
                  JSON.stringify({
                    type: 'codebase:error',
                    message: err instanceof Error ? err.message : String(err),
                    ts: Date.now(),
                  } satisfies WsServerMessage),
                )
              })
            break
          }
        }
      } catch (err) {
        console.error('[ws] Invalid message:', err)
      }
    },

    close(ws) {
      clients.delete(ws)
      console.log(`[ws] Client disconnected (${clients.size} total)`)
    },
  },
})

console.log(`[observability-athion] Server running on http://localhost:${server.port}`)
console.log(`[observability-athion] WebSocket: ws://localhost:${server.port}/api/ws`)
