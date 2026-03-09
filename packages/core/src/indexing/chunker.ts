/**
 * Chunker — divide arquivos de código em chunks semânticos.
 *
 * Estratégia heurística (sem tree-sitter nativo):
 *  - TypeScript/JavaScript: detecta declarações de função/classe/export const/arrow functions
 *  - Python: detecta def/class
 *  - Outros: janela deslizante com sobreposição
 *
 * Cada chunk tem no máximo maxChunkLines linhas.
 * Chunks muito pequenos (<minChunkLines) são merged com o anterior ou descartados.
 */

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { ChunkType, CodeChunk } from './types'
import { detectLanguage } from './file-walker'

const DEFAULT_MAX_CHUNK_LINES = 60
const DEFAULT_MIN_CHUNK_LINES = 3

/** Regex de início de declaração por linguagem. */
const DECLARATION_PATTERNS: Record<string, RegExp> = {
  typescript:
    /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+\w/,
  javascript: /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+\w/,
  python: /^(?:async\s+)?(?:def|class)\s+\w/,
  ruby: /^(?:def|class|module)\s+\w/,
  go: /^(?:func|type|var|const)\s+\w/,
  rust: /^(?:pub\s+)?(?:fn|struct|enum|impl|trait|mod)\s+\w/,
  java: /^(?:public|private|protected|static|final|abstract|class|interface|enum)\s+/,
  csharp: /^(?:public|private|protected|static|class|interface|enum|struct|void|async)\s+/,
}

/** Detecta nome do símbolo em uma linha de declaração. */
function extractSymbolName(line: string, lang: string): string | undefined {
  if (lang === 'typescript' || lang === 'javascript') {
    const m = line.match(/(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/)
    return m?.[1]
  }
  if (lang === 'python' || lang === 'ruby' || lang === 'go' || lang === 'rust') {
    const m = line.match(/(?:def|class|func|fn|struct|enum|impl|trait|module)\s+(\w+)/)
    return m?.[1]
  }
  return undefined
}

/** Detecta tipo do chunk com base na linha de declaração. */
function detectChunkType(line: string, lang: string): ChunkType {
  const trimmed = line.trim()
  if (/\bclass\b/.test(trimmed)) return 'class'
  if (/\bdef\b|\bfunc\b|\bfn\b|\bfunction\b/.test(trimmed)) return 'function'
  if (/\bmethod\b/.test(trimmed)) return 'method'
  if (lang === 'typescript' || lang === 'javascript') {
    if (/const\s+\w+\s*=\s*(?:async\s+)?\(/.test(trimmed)) return 'function'
    if (/const\s+\w+\s*=\s*(?:async\s+)?function/.test(trimmed)) return 'function'
  }
  return 'block'
}

/** Resultado do chunker. */
export interface ChunkerResult {
  chunks: Omit<CodeChunk, 'id'>[]
}

/**
 * Divide um arquivo em chunks semânticos.
 * Retorna chunks sem o campo `id` (gerado pelo manager com hash).
 */
export async function chunkFile(
  filePath: string,
  options: {
    maxChunkLines?: number
    minChunkLines?: number
  } = {},
): Promise<ChunkerResult> {
  const maxChunkLines = options.maxChunkLines ?? DEFAULT_MAX_CHUNK_LINES
  const minChunkLines = options.minChunkLines ?? DEFAULT_MIN_CHUNK_LINES

  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch {
    return { chunks: [] }
  }

  const lines = content.split('\n')
  const language = detectLanguage(filePath)
  const pattern = DECLARATION_PATTERNS[language]

  // Arquivo pequeno → chunk único
  if (lines.length <= maxChunkLines) {
    return {
      chunks: [
        {
          filePath,
          language,
          startLine: 0,
          endLine: lines.length - 1,
          content: truncateContent(content),
          chunkType: 'file',
        },
      ],
    }
  }

  const chunks: Omit<CodeChunk, 'id'>[] = []

  if (pattern) {
    // Chunking semântico: quebra nas declarações
    chunks.push(...semanticChunk(lines, filePath, language, pattern, maxChunkLines, minChunkLines))
  } else {
    // Chunking por janela deslizante
    chunks.push(...slidingWindowChunk(lines, filePath, language, maxChunkLines))
  }

  return { chunks: chunks.length > 0 ? chunks : [fileFallbackChunk(filePath, language, lines)] }
}

/** Chunking semântico: quebra nas linhas de declaração. */
function semanticChunk(
  lines: string[],
  filePath: string,
  language: string,
  pattern: RegExp,
  maxChunkLines: number,
  minChunkLines: number,
): Omit<CodeChunk, 'id'>[] {
  const chunks: Omit<CodeChunk, 'id'>[] = []

  // Detecta linha de início de cada bloco semântico
  const boundaries: number[] = []
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]?.trim() ?? ''
    if (pattern.test(trimmed)) {
      boundaries.push(i)
    }
  }

  if (boundaries.length === 0) {
    return slidingWindowChunk(lines, filePath, language, maxChunkLines)
  }

  // Gera chunks entre boundaries
  for (let b = 0; b < boundaries.length; b++) {
    const startLine = boundaries[b] as number
    const nextBoundary = boundaries[b + 1] ?? lines.length
    let endLine = Math.min(nextBoundary - 1, startLine + maxChunkLines - 1)

    // Se o bloco é muito grande, divide em janelas
    if (endLine - startLine >= maxChunkLines) {
      endLine = startLine + maxChunkLines - 1
    }

    const chunkLines = lines.slice(startLine, endLine + 1)
    const chunkContent = chunkLines.join('\n')

    if (chunkLines.length < minChunkLines) continue

    const declarationLine = lines[startLine]?.trim() ?? ''
    const symbolName = extractSymbolName(declarationLine, language)
    const chunk: Omit<CodeChunk, 'id'> = {
      filePath,
      language,
      startLine,
      endLine,
      content: truncateContent(chunkContent),
      chunkType: detectChunkType(declarationLine, language),
      ...(symbolName !== undefined ? { symbolName } : {}),
    }
    chunks.push(chunk)
  }

  // Adiciona conteúdo antes do primeiro boundary (imports, etc.)
  const firstBoundary = boundaries[0] ?? 0
  if (firstBoundary > minChunkLines) {
    const headerLines = lines.slice(0, firstBoundary)
    chunks.unshift({
      filePath,
      language,
      startLine: 0,
      endLine: firstBoundary - 1,
      content: truncateContent(headerLines.join('\n')),
      chunkType: 'block',
    })
  }

  return chunks
}

/** Chunking por janela deslizante com sobreposição de 10 linhas. */
function slidingWindowChunk(
  lines: string[],
  filePath: string,
  language: string,
  maxChunkLines: number,
): Omit<CodeChunk, 'id'>[] {
  const overlap = Math.floor(maxChunkLines * 0.15)
  const step = maxChunkLines - overlap
  const chunks: Omit<CodeChunk, 'id'>[] = []

  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(start + maxChunkLines - 1, lines.length - 1)
    const chunkLines = lines.slice(start, end + 1)
    chunks.push({
      filePath,
      language,
      startLine: start,
      endLine: end,
      content: truncateContent(chunkLines.join('\n')),
      chunkType: 'block',
    })
    if (end === lines.length - 1) break
  }

  return chunks
}

function fileFallbackChunk(
  filePath: string,
  language: string,
  lines: string[],
): Omit<CodeChunk, 'id'> {
  return {
    filePath,
    language,
    startLine: 0,
    endLine: lines.length - 1,
    content: truncateContent(lines.join('\n')),
    chunkType: 'file',
  }
}

/** Trunca conteúdo para máximo de 2K chars (preserva início e fim). */
function truncateContent(content: string, maxChars = 2048): string {
  if (content.length <= maxChars) return content
  const half = Math.floor(maxChars / 2) - 20
  return `${content.slice(0, half)}\n...(truncated)...\n${content.slice(-half)}`
}

/** Gera ID único para um chunk (sha256 de filePath:startLine:endLine). */
export function generateChunkId(filePath: string, startLine: number, endLine: number): string {
  return createHash('sha256')
    .update(`${filePath}:${startLine}:${endLine}`)
    .digest('hex')
    .slice(0, 16)
}
