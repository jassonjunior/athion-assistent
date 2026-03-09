/**
 * FileWalker — percorre recursivamente um diretório respeitando .gitignore.
 *
 * Implementação própria de gitignore parsing sem dependências externas.
 * Suporta padrões glob básicos: *, **, ?, prefixo !, comentários #.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

/** Extensões de código suportadas para indexação. */
export const CODE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'c',
  'cpp',
  'h',
  'hpp',
  'cs',
  'php',
  'swift',
  'scala',
  'clj',
  'sh',
  'bash',
  'zsh',
  'json',
  'yaml',
  'yml',
  'toml',
  'md',
  'mdx',
  'sql',
])

/** Diretórios sempre ignorados. */
const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.turbo',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  'vendor',
  '.cargo',
  'target',
  '.gradle',
  '.venv',
  'venv',
  'env',
  'e2e-reports',
  '.wdio-vscode-service',
])

/** Padrão compilado de .gitignore. */
interface GitignorePattern {
  pattern: string
  negate: boolean
  isDir: boolean
}

/** Parseia um arquivo .gitignore em padrões. */
function parseGitignore(content: string): GitignorePattern[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const negate = line.startsWith('!')
      const raw = negate ? line.slice(1) : line
      const isDir = raw.endsWith('/')
      const pattern = isDir ? raw.slice(0, -1) : raw
      return { pattern, negate, isDir }
    })
}

/** Testa se um caminho relativo (com / como separador) é ignorado. */
function matchesGitignorePattern(relativePath: string, pattern: string): boolean {
  // Normaliza separadores
  const path = relativePath.split(sep).join('/')

  // Padrão com / no meio → match relativo à raiz
  if (pattern.includes('/') && !pattern.startsWith('**/')) {
    return globMatch(path, pattern)
  }

  // Sem / → match em qualquer segmento do path
  const parts = path.split('/')
  const base = parts[parts.length - 1] ?? ''
  if (globMatch(base, pattern)) return true
  // Tenta match em subpaths
  return globMatch(path, `**/${pattern}`)
}

/** Glob matching simples: *, **, ?. */
function globMatch(str: string, pattern: string): boolean {
  // Converte glob para regex
  let regexStr = '^'
  let i = 0
  while (i < pattern.length) {
    const c = pattern[i]
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        regexStr += '.*'
        i += 2
        if (pattern[i] === '/') i++ // consome o / após **
      } else {
        regexStr += '[^/]*'
        i++
      }
    } else if (c === '?') {
      regexStr += '[^/]'
      i++
    } else if ('.+^${}()|[]\\'.includes(c ?? '')) {
      regexStr += `\\${c}`
      i++
    } else {
      regexStr += c
      i++
    }
  }
  regexStr += '$'
  try {
    return new RegExp(regexStr).test(str)
  } catch {
    return false
  }
}

/** Checa se um caminho relativo deve ser ignorado com base nos padrões. */
function isIgnoredByPatterns(relativePath: string, patterns: GitignorePattern[]): boolean {
  let ignored = false
  for (const { pattern, negate } of patterns) {
    if (matchesGitignorePattern(relativePath, pattern)) {
      ignored = !negate
    }
  }
  return ignored
}

export interface WalkerOptions {
  /** Extensões adicionais a incluir */
  extraExtensions?: string[]
  /** Diretórios adicionais a ignorar */
  ignoredDirs?: string[]
  /** Tamanho máximo de arquivo em bytes (default: 500KB) */
  maxFileSizeBytes?: number
}

/**
 * Percorre recursivamente um diretório e retorna os caminhos de arquivos de código.
 * Respeita .gitignore (procura na raiz do workspace).
 */
export async function walkDirectory(
  rootPath: string,
  options: WalkerOptions = {},
): Promise<string[]> {
  const { extraExtensions = [], ignoredDirs = [], maxFileSizeBytes = 500 * 1024 } = options

  const allowedExtensions = new Set([...CODE_EXTENSIONS, ...extraExtensions])
  const ignoredDirSet = new Set([...DEFAULT_IGNORED_DIRS, ...ignoredDirs])

  // Carrega .gitignore da raiz
  let gitignorePatterns: GitignorePattern[] = []
  try {
    const gitignoreContent = await readFile(join(rootPath, '.gitignore'), 'utf-8')
    gitignorePatterns = parseGitignore(gitignoreContent)
  } catch {
    // sem .gitignore
  }

  const results: string[] = []

  async function recurse(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      const relPath = relative(rootPath, fullPath)

      // Ignora diretórios padrão
      if (entry.isDirectory()) {
        if (ignoredDirSet.has(entry.name)) continue
        if (isIgnoredByPatterns(relPath, gitignorePatterns)) continue
        await recurse(fullPath)
        continue
      }

      if (!entry.isFile()) continue

      // Verifica extensão
      const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
      if (!allowedExtensions.has(ext)) continue

      // Verifica gitignore
      if (isIgnoredByPatterns(relPath, gitignorePatterns)) continue

      // Verifica tamanho do arquivo
      try {
        const info = await stat(fullPath)
        if (info.size > maxFileSizeBytes) continue
      } catch {
        continue
      }

      results.push(fullPath)
    }
  }

  await recurse(rootPath)
  return results
}

/** Detecta linguagem a partir da extensão do arquivo. */
export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    cs: 'csharp',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    php: 'php',
    swift: 'swift',
    scala: 'scala',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    sql: 'sql',
    md: 'markdown',
    mdx: 'markdown',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
  }
  return langMap[ext] ?? ext
}
