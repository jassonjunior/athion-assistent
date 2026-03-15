import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { walkDirectory, detectLanguage, CODE_EXTENSIONS } from './file-walker'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('detectLanguage', () => {
  it('detecta TypeScript para .ts', () => {
    expect(detectLanguage('/src/app.ts')).toBe('typescript')
  })

  it('detecta TypeScript para .tsx', () => {
    expect(detectLanguage('/src/App.tsx')).toBe('typescript')
  })

  it('detecta JavaScript para .js', () => {
    expect(detectLanguage('/src/app.js')).toBe('javascript')
  })

  it('detecta JavaScript para .mjs', () => {
    expect(detectLanguage('/src/app.mjs')).toBe('javascript')
  })

  it('detecta Python para .py', () => {
    expect(detectLanguage('/src/app.py')).toBe('python')
  })

  it('detecta Go para .go', () => {
    expect(detectLanguage('/src/main.go')).toBe('go')
  })

  it('detecta Rust para .rs', () => {
    expect(detectLanguage('/src/main.rs')).toBe('rust')
  })

  it('detecta Java para .java', () => {
    expect(detectLanguage('/src/App.java')).toBe('java')
  })

  it('detecta C# para .cs', () => {
    expect(detectLanguage('/src/App.cs')).toBe('csharp')
  })

  it('detecta shell para .sh', () => {
    expect(detectLanguage('/scripts/build.sh')).toBe('shell')
  })

  it('detecta markdown para .md', () => {
    expect(detectLanguage('/docs/README.md')).toBe('markdown')
  })

  it('retorna extensão para linguagem desconhecida', () => {
    expect(detectLanguage('/src/file.xyz')).toBe('xyz')
  })

  it('trata extensão case-insensitive via lowercase', () => {
    // detectLanguage faz .pop()?.toLowerCase()
    expect(detectLanguage('/src/app.TS')).toBe('typescript')
  })
})

describe('CODE_EXTENSIONS', () => {
  it('contém extensões de linguagens comuns', () => {
    expect(CODE_EXTENSIONS.has('ts')).toBe(true)
    expect(CODE_EXTENSIONS.has('tsx')).toBe(true)
    expect(CODE_EXTENSIONS.has('js')).toBe(true)
    expect(CODE_EXTENSIONS.has('py')).toBe(true)
    expect(CODE_EXTENSIONS.has('go')).toBe(true)
    expect(CODE_EXTENSIONS.has('rs')).toBe(true)
    expect(CODE_EXTENSIONS.has('java')).toBe(true)
  })

  it('não contém extensões de binários', () => {
    expect(CODE_EXTENSIONS.has('exe')).toBe(false)
    expect(CODE_EXTENSIONS.has('png')).toBe(false)
    expect(CODE_EXTENSIONS.has('jpg')).toBe(false)
  })
})

describe('walkDirectory', () => {
  let rootDir: string

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'walker-test-'))
  })

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  it('encontra arquivos de código em diretório simples', async () => {
    writeFileSync(join(rootDir, 'index.ts'), 'const x = 1')
    writeFileSync(join(rootDir, 'app.js'), 'const y = 2')

    const files = await walkDirectory(rootDir)
    expect(files).toHaveLength(2)
    expect(files.some((f) => f.endsWith('index.ts'))).toBe(true)
    expect(files.some((f) => f.endsWith('app.js'))).toBe(true)
  })

  it('percorre subdiretórios recursivamente', async () => {
    mkdirSync(join(rootDir, 'src'))
    mkdirSync(join(rootDir, 'src', 'lib'))
    writeFileSync(join(rootDir, 'src', 'index.ts'), 'export {}')
    writeFileSync(join(rootDir, 'src', 'lib', 'util.ts'), 'export {}')

    const files = await walkDirectory(rootDir)
    expect(files).toHaveLength(2)
  })

  it('ignora node_modules', async () => {
    mkdirSync(join(rootDir, 'node_modules'))
    mkdirSync(join(rootDir, 'node_modules', 'pkg'))
    writeFileSync(join(rootDir, 'node_modules', 'pkg', 'index.js'), 'module.exports = {}')
    writeFileSync(join(rootDir, 'app.ts'), 'const x = 1')

    const files = await walkDirectory(rootDir)
    expect(files).toHaveLength(1)
    expect(files[0]).toContain('app.ts')
  })

  it('ignora .git', async () => {
    mkdirSync(join(rootDir, '.git'))
    writeFileSync(join(rootDir, '.git', 'config'), 'git config')
    writeFileSync(join(rootDir, 'app.ts'), 'export {}')

    const files = await walkDirectory(rootDir)
    expect(files).toHaveLength(1)
  })

  it('ignora dist e build', async () => {
    mkdirSync(join(rootDir, 'dist'))
    mkdirSync(join(rootDir, 'build'))
    writeFileSync(join(rootDir, 'dist', 'bundle.js'), 'bundled')
    writeFileSync(join(rootDir, 'build', 'output.js'), 'built')
    writeFileSync(join(rootDir, 'app.ts'), 'export {}')

    const files = await walkDirectory(rootDir)
    expect(files).toHaveLength(1)
  })

  it('filtra por extensões de código', async () => {
    writeFileSync(join(rootDir, 'app.ts'), 'export {}')
    writeFileSync(join(rootDir, 'image.png'), 'binary')
    writeFileSync(join(rootDir, 'readme.txt'), 'text')

    const files = await walkDirectory(rootDir)
    expect(files).toHaveLength(1)
    expect(files[0]).toContain('app.ts')
  })

  it('respeita extraExtensions', async () => {
    writeFileSync(join(rootDir, 'app.ts'), 'export {}')
    writeFileSync(join(rootDir, 'custom.xyz'), 'custom format')

    const files = await walkDirectory(rootDir, { extraExtensions: ['xyz'] })
    expect(files).toHaveLength(2)
  })

  it('respeita ignoredDirs customizados', async () => {
    mkdirSync(join(rootDir, 'generated'))
    writeFileSync(join(rootDir, 'generated', 'types.ts'), 'export {}')
    writeFileSync(join(rootDir, 'app.ts'), 'export {}')

    const files = await walkDirectory(rootDir, { ignoredDirs: ['generated'] })
    expect(files).toHaveLength(1)
    expect(files[0]).toContain('app.ts')
  })

  it('respeita maxFileSizeBytes', async () => {
    writeFileSync(join(rootDir, 'small.ts'), 'const x = 1')
    writeFileSync(join(rootDir, 'big.ts'), 'x'.repeat(1000))

    const files = await walkDirectory(rootDir, { maxFileSizeBytes: 500 })
    expect(files).toHaveLength(1)
    expect(files[0]).toContain('small.ts')
  })

  it('respeita .gitignore', async () => {
    writeFileSync(join(rootDir, '.gitignore'), '*.log\ntmp/\n')
    writeFileSync(join(rootDir, 'app.ts'), 'export {}')
    writeFileSync(join(rootDir, 'debug.log'), 'log content')
    mkdirSync(join(rootDir, 'tmp'))
    writeFileSync(join(rootDir, 'tmp', 'cache.ts'), 'export {}')

    const files = await walkDirectory(rootDir)
    expect(files).toHaveLength(1)
    expect(files[0]).toContain('app.ts')
  })

  it('respeita negação no .gitignore', async () => {
    writeFileSync(join(rootDir, '.gitignore'), '*.ts\n!important.ts\n')
    writeFileSync(join(rootDir, 'app.ts'), 'export {}')
    writeFileSync(join(rootDir, 'important.ts'), 'export {}')

    const files = await walkDirectory(rootDir)
    expect(files).toHaveLength(1)
    expect(files[0]).toContain('important.ts')
  })

  it('funciona sem .gitignore', async () => {
    writeFileSync(join(rootDir, 'app.ts'), 'export {}')

    const files = await walkDirectory(rootDir)
    expect(files).toHaveLength(1)
  })

  it('retorna caminhos absolutos', async () => {
    writeFileSync(join(rootDir, 'app.ts'), 'export {}')

    const files = await walkDirectory(rootDir)
    expect(files[0]).toMatch(/^\//)
  })

  it('retorna array vazio para diretório vazio', async () => {
    const files = await walkDirectory(rootDir)
    expect(files).toEqual([])
  })
})
