import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod/v4'
import { defineTool } from './registry'

/**
 * Tool para ler o conteúdo de um arquivo.
 * O LLM usa esta tool para inspecionar código antes de sugerir mudanças.
 */
export const readFileTool = defineTool({
  name: 'read_file',
  level: 'agent',
  description:
    'Lê o conteúdo de um arquivo pelo caminho informado. Use offset/limit para ler em partes (linhas).',
  parameters: z.object({
    path: z.string().describe('Caminho do arquivo a ser lido'),
    offset: z.number().optional().describe('Linha inicial (0-based, default: 0)'),
    limit: z.number().optional().describe('Número máximo de linhas a retornar (default: 200)'),
  }),
  execute: async ({ path, offset, limit }) => {
    try {
      const content = await readFile(resolve(path), 'utf-8')
      const lines = content.split('\n')
      const startLine = offset ?? 0
      const maxLines = limit ?? 200
      const slice = lines.slice(startLine, startLine + maxLines)
      const hasMore = startLine + maxLines < lines.length
      return {
        success: true,
        data: {
          content: slice.join('\n'),
          totalLines: lines.length,
          fromLine: startLine,
          toLine: Math.min(startLine + maxLines, lines.length),
          hasMore,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
})

/**
 * Tool para escrever conteúdo em um arquivo.
 * Cria o arquivo se não existir, sobrescreve se existir.
 */
export const writeFileTool = defineTool({
  name: 'write_file',
  level: 'agent',
  description: 'Escreve conteúdo em um arquivo (cria ou sobrescreve)',
  parameters: z.object({
    path: z.string().describe('Caminho do arquivo a ser escrito'),
    content: z.string().describe('Conteúdo a ser escrito no arquivo'),
  }),
  execute: async ({ path, content }) => {
    try {
      await writeFile(resolve(path), content, 'utf-8')
      return { success: true, data: { path, bytesWritten: content.length } }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
})

/**
 * Tool para listar arquivos e diretórios.
 * Útil para o LLM entender a estrutura do projeto.
 */
export const listFilesTool = defineTool({
  name: 'list_files',
  level: 'agent',
  description: 'Lista arquivos e diretórios em um caminho',
  parameters: z.object({
    path: z.string().describe('Caminho do diretório a ser listado'),
  }),
  execute: async ({ path }) => {
    try {
      const entries = await readdir(resolve(path), { withFileTypes: true })
      const items = entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
      }))
      return { success: true, data: items }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
})

/**
 * Tool para executar comandos no shell.
 * Usada para rodar testes, build, git, etc.
 * Usa Bun.spawn para execução segura com timeout.
 */
export const runCommandTool = defineTool({
  name: 'run_command',
  level: 'agent',
  description: 'Executa um comando no shell e retorna stdout/stderr',
  parameters: z.object({
    command: z.string().describe('Comando a ser executado'),
    cwd: z.string().optional().describe('Diretório de trabalho (opcional)'),
  }),
  execute: async ({ command, cwd }) => {
    try {
      const proc = Bun.spawn(['sh', '-c', command], {
        ...(cwd ? { cwd: resolve(cwd) } : {}),
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])
      const exitCode = await proc.exited
      const result: { stdout: string; stderr: string; exitCode: number } = {
        stdout,
        stderr,
        exitCode,
      }
      if (exitCode !== 0) {
        return { success: false, error: `Command exited with code ${exitCode}` }
      }
      return { success: true, data: result }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
})

/**
 * Tool para buscar texto em arquivos recursivamente.
 * Usa grep nativo para performance.
 */
export const searchFilesTool = defineTool({
  name: 'search_files',
  level: 'agent',
  description:
    'Busca texto em arquivos recursivamente usando grep. Use offset/limit para paginar resultados.',
  parameters: z.object({
    pattern: z.string().describe('Texto ou regex a buscar'),
    path: z.string().describe('Diretório raiz da busca'),
    filePattern: z.string().optional().describe('Filtro de arquivos (ex: "*.ts")'),
    offset: z.number().optional().describe('Pular N primeiros resultados (default: 0)'),
    limit: z.number().optional().describe('Máximo de resultados por chamada (default: 50)'),
  }),
  execute: async ({ pattern, path: searchPath, filePattern, offset, limit }) => {
    try {
      const args = [
        'grep',
        '-rn',
        '--exclude-dir=node_modules',
        '--exclude-dir=.git',
        '--exclude-dir=dist',
        '--exclude-dir=.turbo',
        '--include',
        filePattern ?? '*',
        pattern,
        resolve(searchPath),
      ]
      const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' })
      const stdout = await new Response(proc.stdout).text()
      await proc.exited
      const startAt = offset ?? 0
      const maxResults = Math.min(limit ?? 50, 100)
      const lines = stdout.trim().split('\n').filter(Boolean)
      const slice = lines.slice(startAt, startAt + maxResults)
      const matches = slice.map((line) => {
        const [file, lineNum, ...rest] = line.split(':')
        return { file, line: Number(lineNum), content: rest.join(':').trim() }
      })
      return {
        success: true,
        data: {
          matches,
          total: lines.length,
          offset: startAt,
          limit: maxResults,
          hasMore: startAt + maxResults < lines.length,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
})

/**
 * Todas as tools built-in do Athion.
 * Registre todas de uma vez no ToolRegistry com registerBuiltins().
 */
export const BUILTIN_TOOLS = [
  readFileTool,
  writeFileTool,
  listFilesTool,
  runCommandTool,
  searchFilesTool,
]
