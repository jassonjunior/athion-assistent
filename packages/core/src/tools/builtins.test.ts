import { describe, expect, it, afterAll, vi } from 'vitest'

// Mock bun:sqlite and indexing to avoid native dependency
vi.mock('../indexing', () => ({
  ContextAssembler: vi.fn(),
  estimateTokens: vi.fn(() => 0),
  formatRepoMeta: vi.fn(() => ''),
  formatPatterns: vi.fn(() => ''),
  formatFileSummaries: vi.fn(() => ''),
}))

import {
  readFileTool,
  writeFileTool,
  listFilesTool,
  searchFilesTool,
  runCommandTool,
  BUILTIN_TOOLS,
} from './builtins'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const TEST_DIR = join(tmpdir(), 'athion-builtins-test-' + Date.now())

// Setup
mkdirSync(TEST_DIR, { recursive: true })
writeFileSync(join(TEST_DIR, 'test.txt'), 'line1\nline2\nline3\nline4\nline5', 'utf-8')
writeFileSync(
  join(TEST_DIR, 'search-target.ts'),
  'export function hello() { return "world" }\nexport const foo = "bar"\n',
  'utf-8',
)

describe('BUILTIN_TOOLS', () => {
  it('contém 5 tools', () => {
    expect(BUILTIN_TOOLS).toHaveLength(5)
  })

  it('todas têm level agent', () => {
    for (const tool of BUILTIN_TOOLS) {
      expect(tool.level).toBe('agent')
    }
  })

  it('todas têm name, description, parameters e execute', () => {
    for (const tool of BUILTIN_TOOLS) {
      expect(tool.name).toBeTruthy()
      expect(tool.description).toBeTruthy()
      expect(tool.parameters).toBeDefined()
      expect(typeof tool.execute).toBe('function')
    }
  })

  it('nomes não são duplicados', () => {
    const names = BUILTIN_TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('readFileTool', () => {
  it('lê conteúdo de arquivo existente', async () => {
    const result = await readFileTool.execute({ path: join(TEST_DIR, 'test.txt') })
    expect(result.success).toBe(true)
    expect(result.data.content).toContain('line1')
    expect(result.data.totalLines).toBe(5)
  })

  it('suporta offset e limit', async () => {
    const result = await readFileTool.execute({
      path: join(TEST_DIR, 'test.txt'),
      offset: 1,
      limit: 2,
    })
    expect(result.success).toBe(true)
    expect(result.data.content).toBe('line2\nline3')
    expect(result.data.fromLine).toBe(1)
    expect(result.data.toLine).toBe(3)
    expect(result.data.hasMore).toBe(true)
  })

  it('retorna erro para arquivo inexistente', async () => {
    const result = await readFileTool.execute({ path: '/tmp/nonexistent-file-xyz.txt' })
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('indica hasMore=false quando não há mais conteúdo', async () => {
    const result = await readFileTool.execute({
      path: join(TEST_DIR, 'test.txt'),
      offset: 0,
      limit: 200,
    })
    expect(result.data.hasMore).toBe(false)
  })
})

describe('writeFileTool', () => {
  it('escreve conteúdo em arquivo', async () => {
    const filePath = join(TEST_DIR, 'write-test.txt')
    const result = await writeFileTool.execute({ path: filePath, content: 'Hello World' })

    expect(result.success).toBe(true)
    expect(result.data.path).toBe(filePath)
    expect(result.data.bytesWritten).toBe(11)
  })

  it('retorna erro ao escrever em caminho inválido', async () => {
    const result = await writeFileTool.execute({
      path: '/nonexistent-dir/sub/file.txt',
      content: 'test',
    })
    expect(result.success).toBe(false)
  })
})

describe('listFilesTool', () => {
  it('lista arquivos e diretórios', async () => {
    const subDir = join(TEST_DIR, 'subdir')
    mkdirSync(subDir, { recursive: true })

    const result = await listFilesTool.execute({ path: TEST_DIR })
    expect(result.success).toBe(true)
    expect(Array.isArray(result.data)).toBe(true)

    const names = result.data.map((item: { name: string }) => item.name)
    expect(names).toContain('test.txt')
    expect(names).toContain('subdir')

    const subDirItem = result.data.find((item: { name: string }) => item.name === 'subdir')
    expect(subDirItem.isDirectory).toBe(true)
  })

  it('retorna erro para diretório inexistente', async () => {
    const result = await listFilesTool.execute({ path: '/tmp/nonexistent-dir-xyz' })
    expect(result.success).toBe(false)
  })
})

// Cleanup
afterAll(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true })
  } catch {
    // ok
  }
})

// Note: runCommandTool and searchFilesTool use Bun.spawn which may not be
// available in vitest/node. We test their structure instead.
describe('runCommandTool', () => {
  it('tem configuração correta', () => {
    expect(runCommandTool.name).toBe('run_command')
    expect(runCommandTool.level).toBe('agent')
  })
})

describe('searchFilesTool', () => {
  it('tem configuração correta', () => {
    expect(searchFilesTool.name).toBe('search_files')
    expect(searchFilesTool.level).toBe('agent')
  })
})
