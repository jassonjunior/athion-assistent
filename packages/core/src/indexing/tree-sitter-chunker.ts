/** TreeSitterChunker
 * Descrição: Divide arquivos de código em chunks semânticos usando AST real
 * via web-tree-sitter (WASM, compatível com Bun). Grammars instalados via npm.
 * Fallback automático para regex-chunker se WASM não disponível.
 * Linguagens suportadas: typescript, javascript, python, rust, go.
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
    parser.delete()
    tree.delete()

    if (chunks.length === 0) return null
    return { chunks, usedTreeSitter: true }
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

  return undefined
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
