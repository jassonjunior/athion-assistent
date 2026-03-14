/** TreeSitterChunker
 * Descrição: Divide arquivos de código em chunks semânticos usando AST real
 * via web-tree-sitter (WASM, compatível com Bun). Grammars instalados via npm.
 * Fallback automático para regex-chunker se WASM não disponível.
 * Linguagens suportadas: typescript, javascript, python, rust, go, java, ruby, c, cpp, php.
 */

import { readFile } from 'node:fs/promises'
import type { Parser as ParserType, Language, Node as SyntaxNode } from 'web-tree-sitter'
import type { ChunkType, CodeChunk } from './types'
import { detectLanguage } from './file-walker'

/** WebTreeSitterModule
 * Descrição: Módulo web-tree-sitter com todas as exportações necessárias (lazy-loaded)
 */
interface WebTreeSitterModule {
  /** Parser
   * Descrição: Construtor do parser tree-sitter
   */
  Parser: {
    new (): ParserType
    init(moduleOptions?: Record<string, unknown>): Promise<void>
  }
  /** Language
   * Descrição: Loader de gramáticas de linguagem
   */
  Language: {
    load(input: string | Uint8Array): Promise<Language>
  }
}

/** tsModule
 * Descrição: Referência ao módulo web-tree-sitter carregado (null se não inicializado)
 */
let tsModule: WebTreeSitterModule | null = null

/** moduleInitialized
 * Descrição: Flag indicando se a inicialização do módulo já foi tentada
 */
let moduleInitialized = false

/** languageCache
 * Descrição: Cache de gramáticas WASM carregadas, indexado por nome da linguagem
 */
const languageCache = new Map<string, Language>()

/** GRAMMAR_PACKAGES
 * Descrição: Mapeamento de linguagem para pacote npm e arquivo WASM da gramática
 */
const GRAMMAR_PACKAGES: Record<string, { pkg: string; wasm: string }> = {
  typescript: { pkg: 'tree-sitter-typescript', wasm: 'tree-sitter-typescript.wasm' },
  javascript: { pkg: 'tree-sitter-javascript', wasm: 'tree-sitter-javascript.wasm' },
  python: { pkg: 'tree-sitter-python', wasm: 'tree-sitter-python.wasm' },
  rust: { pkg: 'tree-sitter-rust', wasm: 'tree-sitter-rust.wasm' },
  go: { pkg: 'tree-sitter-go', wasm: 'tree-sitter-go.wasm' },
  java: { pkg: 'tree-sitter-java', wasm: 'tree-sitter-java.wasm' },
  ruby: { pkg: 'tree-sitter-ruby', wasm: 'tree-sitter-ruby.wasm' },
  c: { pkg: 'tree-sitter-c', wasm: 'tree-sitter-c.wasm' },
  cpp: { pkg: 'tree-sitter-cpp', wasm: 'tree-sitter-cpp.wasm' },
  php: { pkg: 'tree-sitter-php', wasm: 'tree-sitter-php.wasm' },
}

/** DECLARATION_TYPES
 * Descrição: Tipos de nó AST que representam declarações top-level usadas
 * como fronteiras de chunk, organizados por linguagem
 */
const DECLARATION_TYPES: Record<string, Set<string>> = {
  typescript: new Set([
    'function_declaration',
    'generator_function_declaration',
    'class_declaration',
    'abstract_class_declaration',
    'export_statement',
    'lexical_declaration',
    'variable_declaration',
    'interface_declaration',
    'type_alias_declaration',
    'enum_declaration',
    'namespace_declaration',
    'module',
    'ambient_declaration',
  ]),
  javascript: new Set([
    'function_declaration',
    'generator_function_declaration',
    'class_declaration',
    'export_statement',
    'lexical_declaration',
    'variable_declaration',
  ]),
  python: new Set([
    'function_definition',
    'decorated_definition',
    'class_definition',
    'async_function_definition',
  ]),
  rust: new Set([
    'function_item',
    'struct_item',
    'enum_item',
    'impl_item',
    'trait_item',
    'mod_item',
    'static_item',
    'const_item',
    'type_item',
  ]),
  go: new Set([
    'function_declaration',
    'method_declaration',
    'type_declaration',
    'var_declaration',
    'const_declaration',
  ]),
  java: new Set([
    'class_declaration',
    'interface_declaration',
    'enum_declaration',
    'method_declaration',
    'constructor_declaration',
    'annotation_type_declaration',
    'record_declaration',
  ]),
  ruby: new Set(['method', 'singleton_method', 'class', 'module']),
  c: new Set([
    'function_definition',
    'struct_specifier',
    'enum_specifier',
    'type_definition',
    'declaration',
  ]),
  cpp: new Set([
    'function_definition',
    'class_specifier',
    'struct_specifier',
    'enum_specifier',
    'namespace_definition',
    'template_declaration',
    'type_definition',
  ]),
  php: new Set([
    'function_definition',
    'class_declaration',
    'interface_declaration',
    'trait_declaration',
    'enum_declaration',
    'method_declaration',
  ]),
}

/** ensureModuleInit
 * Descrição: Inicializa o módulo web-tree-sitter de forma lazy (uma única vez).
 * Resolve o WASM do pacote npm e configura o Parser.
 * @returns Módulo inicializado ou null se não disponível
 */
async function ensureModuleInit(): Promise<WebTreeSitterModule | null> {
  if (moduleInitialized) return tsModule

  try {
    const mod = await import('web-tree-sitter')
    const { Parser, Language } = mod as unknown as WebTreeSitterModule

    const { createRequire } = await import('node:module')
    const req = createRequire(import.meta.url)
    const wasmPath = req.resolve('web-tree-sitter/web-tree-sitter.wasm')
    await Parser.init({ locateFile: () => wasmPath })

    tsModule = { Parser, Language }
    moduleInitialized = true
    return tsModule
  } catch {
    moduleInitialized = true // não tenta novamente
    return null
  }
}

/** loadLanguage
 * Descrição: Carrega uma gramática WASM para a linguagem dada, com cache por linguagem
 * @param lang - Nome da linguagem (ex: 'typescript', 'python')
 * @param mod - Módulo web-tree-sitter inicializado
 * @returns Gramática da linguagem ou null se não suportada
 */
async function loadLanguage(lang: string, mod: WebTreeSitterModule): Promise<Language | null> {
  const cached = languageCache.get(lang)
  if (cached) return cached

  const grammarInfo = GRAMMAR_PACKAGES[lang]
  if (!grammarInfo) return null

  try {
    const { createRequire } = await import('node:module')
    const req = createRequire(import.meta.url)
    const wasmPath = req.resolve(`${grammarInfo.pkg}/${grammarInfo.wasm}`)
    const language = await mod.Language.load(wasmPath)
    languageCache.set(lang, language)
    return language
  } catch {
    return null
  }
}

/** IMPORT_TYPES
 * Descrição: Tipos de nó AST que representam declarações de import por linguagem
 */
const IMPORT_TYPES: Record<string, string[]> = {
  typescript: ['import_statement'],
  javascript: ['import_statement'],
  python: ['import_statement', 'import_from_statement'],
  rust: ['use_declaration'],
  go: ['import_declaration'],
  java: ['import_declaration'],
  ruby: ['call'],
  c: ['preproc_include'],
  cpp: ['preproc_include'],
  php: ['namespace_use_declaration'],
}

/** TreeSitterChunkerResult
 * Descrição: Resultado do chunker tree-sitter com flag indicando uso de AST real
 */
export interface TreeSitterChunkerResult {
  /** chunks
   * Descrição: Array de chunks extraídos da AST (sem o campo id)
   */
  chunks: Omit<CodeChunk, 'id'>[]
  /** usedTreeSitter
   * Descrição: Se o tree-sitter foi efetivamente utilizado (sempre true neste resultado)
   */
  usedTreeSitter: boolean
  /** imports
   * Descrição: Array de paths importados extraídos da AST
   */
  imports: string[]
}

/** chunkFileWithTreeSitter
 * Descrição: Divide um arquivo em chunks semânticos usando AST tree-sitter.
 * Retorna null se tree-sitter não disponível ou linguagem não suportada.
 * @param filePath - Caminho absoluto do arquivo a chunkar
 * @param maxChunkLines - Máximo de linhas por chunk (default: 60)
 * @param minChunkLines - Mínimo de linhas por chunk (default: 3)
 * @returns Resultado com chunks ou null se fallback necessário
 */
export async function chunkFileWithTreeSitter(
  filePath: string,
  maxChunkLines = 60,
  minChunkLines = 3,
): Promise<TreeSitterChunkerResult | null> {
  const lang = detectLanguage(filePath)
  if (!GRAMMAR_PACKAGES[lang]) return null

  const mod = await ensureModuleInit()
  if (!mod) return null

  const language = await loadLanguage(lang, mod)
  if (!language) return null

  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch {
    return null
  }

  try {
    const parser = new mod.Parser()
    parser.setLanguage(language)
    const tree = parser.parse(content)
    if (!tree) return null
    const lines = content.split('\n')

    const chunks = extractChunks(tree.rootNode, lines, filePath, lang, maxChunkLines, minChunkLines)
    const imports = extractImports(tree.rootNode, content, lang)
    parser.delete()
    tree.delete()

    if (chunks.length === 0) return null
    return { chunks, usedTreeSitter: true, imports }
  } catch {
    return null
  }
}

/** extractChunks
 * Descrição: Extrai chunks a partir do nó raiz da AST. Identifica declarações
 * top-level e cria chunks para cada uma, incluindo um header chunk para imports.
 * @param root - Nó raiz da árvore AST
 * @param lines - Linhas do arquivo fonte
 * @param filePath - Caminho absoluto do arquivo
 * @param lang - Linguagem detectada
 * @param maxChunkLines - Máximo de linhas por chunk
 * @param minChunkLines - Mínimo de linhas por chunk
 * @returns Array de chunks extraídos da AST
 */
function extractChunks(
  root: SyntaxNode,
  lines: string[],
  filePath: string,
  lang: string,
  maxChunkLines: number,
  minChunkLines: number,
): Omit<CodeChunk, 'id'>[] {
  const declTypes = DECLARATION_TYPES[lang]
  if (!declTypes) return []

  // Arquivo pequeno → chunk único
  if (lines.length <= maxChunkLines) {
    return [
      {
        filePath,
        language: lang,
        startLine: 0,
        endLine: lines.length - 1,
        content: truncateContent(lines.join('\n')),
        chunkType: 'file',
      },
    ]
  }

  const topLevelNodes = collectDeclarations(root, declTypes, lang)
  if (topLevelNodes.length === 0) return []

  const chunks: Omit<CodeChunk, 'id'>[] = []

  // Header (imports) antes da primeira declaração
  const firstStart = topLevelNodes[0]?.startLine ?? 0
  if (firstStart > minChunkLines) {
    chunks.push({
      filePath,
      language: lang,
      startLine: 0,
      endLine: firstStart - 1,
      content: truncateContent(lines.slice(0, firstStart).join('\n')),
      chunkType: 'block',
    })
  }

  for (const node of topLevelNodes) {
    const startLine = node.startLine
    const endLine = Math.min(node.endLine, startLine + maxChunkLines - 1)
    const chunkLines = lines.slice(startLine, endLine + 1)
    if (chunkLines.length < minChunkLines) continue

    const chunk: Omit<CodeChunk, 'id'> = {
      filePath,
      language: lang,
      startLine,
      endLine,
      content: truncateContent(chunkLines.join('\n')),
      chunkType: node.chunkType,
      ...(node.symbolName !== undefined ? { symbolName: node.symbolName } : {}),
    }
    chunks.push(chunk)
  }

  return chunks
}

/** NodeInfo
 * Descrição: Informações extraídas de um nó da AST para criação de chunk
 */
interface NodeInfo {
  /** startLine
   * Descrição: Linha de início do nó na AST
   */
  startLine: number
  /** endLine
   * Descrição: Linha de fim do nó na AST
   */
  endLine: number
  /** chunkType
   * Descrição: Tipo do chunk derivado do tipo de nó AST
   */
  chunkType: ChunkType
  /** symbolName
   * Descrição: Nome do símbolo (função, classe, etc.) extraído do nó
   */
  symbolName?: string
}

/** collectDeclarations
 * Descrição: Coleta os nós de declaração top-level da AST que servem como fronteiras de chunk
 * @param root - Nó raiz da AST
 * @param declTypes - Set de tipos de nó considerados declarações
 * @param lang - Linguagem para extração de informações
 * @returns Array de NodeInfo com informações de cada declaração
 */
function collectDeclarations(root: SyntaxNode, declTypes: Set<string>, lang: string): NodeInfo[] {
  return root.children
    .filter((c: SyntaxNode) => declTypes.has(c.type))
    .map((c: SyntaxNode) => extractNodeInfo(c, lang))
}

/** extractNodeInfo
 * Descrição: Extrai informações de posição, tipo e símbolo de um nó da AST
 * @param node - Nó da AST a analisar
 * @param lang - Linguagem para extração de símbolo
 * @returns NodeInfo com posição, tipo e nome do símbolo
 */
function extractNodeInfo(node: SyntaxNode, lang: string): NodeInfo {
  const symbolName = extractSymbolFromNode(node, lang)
  const info: NodeInfo = {
    startLine: node.startPosition.row,
    endLine: node.endPosition.row,
    chunkType: mapNodeTypeToChunkType(node.type),
  }
  if (symbolName !== undefined) info.symbolName = symbolName
  return info
}

/** mapNodeTypeToChunkType
 * Descrição: Mapeia o tipo de nó da AST para o tipo de chunk correspondente
 * @param nodeType - Tipo do nó na AST (ex: 'function_declaration', 'class_declaration')
 * @returns Tipo de chunk correspondente
 */
function mapNodeTypeToChunkType(nodeType: string): ChunkType {
  if (
    nodeType.includes('function') ||
    nodeType.includes('method') ||
    nodeType === 'lexical_declaration' ||
    nodeType === 'variable_declaration'
  )
    return 'function'
  if (
    nodeType.includes('class') ||
    nodeType.includes('struct') ||
    nodeType.includes('enum') ||
    nodeType.includes('trait') ||
    nodeType.includes('interface') ||
    nodeType.includes('module') ||
    nodeType.includes('namespace') ||
    nodeType === 'impl_item'
  )
    return 'class'
  return 'block'
}

/** extractSymbolFromNode
 * Descrição: Extrai o nome do símbolo de um nó da AST, tratando export statements,
 * declarações de variáveis, decorators e construções específicas de Rust.
 * @param node - Nó da AST
 * @param lang - Linguagem para lógica específica
 * @returns Nome do símbolo ou undefined se não encontrado
 */
function extractSymbolFromNode(node: SyntaxNode, lang: string): string | undefined {
  if (node.type === 'export_statement') {
    const decl =
      node.childForFieldName('declaration') ??
      node.children.find(
        (c: SyntaxNode) =>
          c.type.includes('function') ||
          c.type.includes('class') ||
          c.type === 'lexical_declaration' ||
          c.type === 'variable_declaration',
      )
    if (decl) return extractSymbolFromNode(decl, lang)
    return undefined
  }

  const nameNode = node.childForFieldName('name')
  if (nameNode) return nameNode.text

  if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
    const declarator = node.children.find(
      (c: SyntaxNode) => c.type === 'variable_declarator' || c.type === 'lexical_binding',
    )
    if (declarator) {
      const nameField = declarator.childForFieldName('name')
      if (nameField) return nameField.text
    }
  }

  if (node.type === 'decorated_definition') {
    const inner = node.children.find(
      (c: SyntaxNode) => c.type === 'function_definition' || c.type === 'class_definition',
    )
    if (inner) return extractSymbolFromNode(inner, lang)
  }

  if (lang === 'rust') {
    const typeNode = node.childForFieldName('type') ?? node.childForFieldName('name')
    if (typeNode) return typeNode.text
  }

  if (lang === 'c' || lang === 'cpp') {
    let cur = node.childForFieldName('declarator')
    while (cur && cur.type !== 'identifier') {
      cur = cur.childForFieldName('name') ?? cur.childForFieldName('declarator') ?? null
    }
    if (cur) return cur.text
    const typeId = node.children.findLast((c: SyntaxNode) => c.type === 'type_identifier')
    if (typeId) return typeId.text
  }

  return undefined
}

/** extractImports
 * Descrição: Extrai paths de import do nó raiz da AST para construção do DependencyGraph.
 * @param root - Nó raiz da árvore AST
 * @param code - Código fonte completo do arquivo
 * @param lang - Linguagem detectada
 * @returns Array de strings com os paths/módulos importados
 */
function extractImports(root: SyntaxNode, code: string, lang: string): string[] {
  const importTypes = IMPORT_TYPES[lang]
  if (!importTypes) return []

  const imports: string[] = []
  const lines = code.split('\n')

  for (const child of root.children) {
    if (!importTypes.includes(child.type)) continue

    // Ruby: filtra apenas calls de require/require_relative
    if (lang === 'ruby' && child.type === 'call') {
      const method = child.childForFieldName('method')
      if (!method || (method.text !== 'require' && method.text !== 'require_relative')) continue
    }

    // PHP: percorre children (pode ter program > namespace_use_declaration dentro)
    if (lang === 'php' && child.type === 'program') {
      for (const inner of child.children) {
        if (importTypes.includes(inner.type)) {
          const text = lines.slice(inner.startPosition.row, inner.endPosition.row + 1).join('\n')
          const path = extractImportPath(text, lang)
          if (path) imports.push(path)
        }
      }
      continue
    }

    const importText = lines.slice(child.startPosition.row, child.endPosition.row + 1).join('\n')

    const path = extractImportPath(importText, lang)
    if (path) imports.push(path)
  }

  return imports
}

/** extractImportPath
 * Descrição: Extrai o path/módulo de uma string de import por linguagem
 * @param importText - Texto completo da declaração de import
 * @param lang - Linguagem para lógica de extração
 * @returns Path/módulo importado ou null se não detectado
 */
function extractImportPath(importText: string, lang: string): string | null {
  if (lang === 'typescript' || lang === 'javascript') {
    // import { X } from './path' ou import X from 'module'
    const match = importText.match(/from\s+['"]([^'"]+)['"]/)
    if (match) return match[1] ?? null
    // import './style.css'
    const directMatch = importText.match(/import\s+['"]([^'"]+)['"]/)
    if (directMatch) return directMatch[1] ?? null
    return null
  }

  if (lang === 'python') {
    // from module import X ou import module
    const fromMatch = importText.match(/from\s+(\S+)\s+import/)
    if (fromMatch) return fromMatch[1] ?? null
    const importMatch = importText.match(/import\s+(\S+)/)
    if (importMatch) return importMatch[1] ?? null
    return null
  }

  if (lang === 'rust') {
    // use crate::module ou use std::path
    const match = importText.match(/use\s+(\S+?)(?:::|\s*;)/)
    if (match) return match[1] ?? null
    return null
  }

  if (lang === 'go') {
    // import "module" ou import ( "module" )
    const match = importText.match(/["']([^"']+)["']/)
    if (match) return match[1] ?? null
    return null
  }

  if (lang === 'java') {
    // import com.example.MyClass;
    const match = importText.match(/import\s+(?:static\s+)?(\S+?)\s*;/)
    if (match) return match[1] ?? null
    return null
  }

  if (lang === 'ruby') {
    // require 'module' ou require_relative './path'
    const match = importText.match(/require(?:_relative)?\s+['"]([^'"]+)['"]/)
    if (match) return match[1] ?? null
    return null
  }

  if (lang === 'c' || lang === 'cpp') {
    // #include <header.h> ou #include "path.h"
    const match = importText.match(/#include\s+[<"]([^>"]+)[>"]/)
    if (match) return match[1] ?? null
    return null
  }

  if (lang === 'php') {
    // use App\Models\User; ou use App\Models\User as U;
    const match = importText.match(/use\s+(\S+?)(?:\s+as\s+\S+)?\s*;/)
    if (match) return match[1] ?? null
    return null
  }

  return null
}

/** truncateContent
 * Descrição: Trunca conteúdo para máximo de chars, preservando início e fim
 * @param content - Conteúdo a truncar
 * @param maxChars - Máximo de caracteres (default: 2048)
 * @returns Conteúdo truncado ou original se menor que maxChars
 */
function truncateContent(content: string, maxChars = 2048): string {
  if (content.length <= maxChars) return content
  const half = Math.floor(maxChars / 2) - 20
  return `${content.slice(0, half)}\n...(truncated)...\n${content.slice(-half)}`
}

/** isTreeSitterAvailable
 * Descrição: Verifica se o tree-sitter está disponível para uma linguagem específica
 * @param lang - Nome da linguagem a verificar
 * @returns true se tree-sitter está disponível e a gramática carregou com sucesso
 */
export async function isTreeSitterAvailable(lang: string): Promise<boolean> {
  if (!GRAMMAR_PACKAGES[lang]) return false
  const mod = await ensureModuleInit()
  if (!mod) return false
  const language = await loadLanguage(lang, mod)
  return language !== null
}
