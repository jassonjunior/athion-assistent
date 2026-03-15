import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { scaffoldPlugin } from './scaffold'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TEST_DIR = join(tmpdir(), 'athion-scaffold-tests-' + Date.now())

beforeEach(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true })
  } catch {
    // ok
  }
})

afterAll(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true })
  } catch {
    // ok
  }
})

describe('scaffoldPlugin', () => {
  it('cria diretório do plugin com index.ts, package.json e README.md', () => {
    const pluginDir = scaffoldPlugin({
      name: 'my-tool',
      targetDir: TEST_DIR,
    })

    expect(existsSync(pluginDir)).toBe(true)
    expect(existsSync(join(pluginDir, 'index.ts'))).toBe(true)
    expect(existsSync(join(pluginDir, 'package.json'))).toBe(true)
    expect(existsSync(join(pluginDir, 'README.md'))).toBe(true)
  })

  it('gera package.json com nome correto e prefixo athion-plugin-', () => {
    const pluginDir = scaffoldPlugin({
      name: 'git-tools',
      targetDir: TEST_DIR,
    })

    const pkg = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf-8'))
    expect(pkg.name).toBe('athion-plugin-git-tools')
    expect(pkg.version).toBe('0.1.0')
    expect(pkg.keywords).toContain('athion-plugin')
    expect(pkg.keywords).toContain('git-tools')
  })

  it('usa description custom quando fornecida', () => {
    const pluginDir = scaffoldPlugin({
      name: 'custom',
      description: 'My custom plugin',
      targetDir: TEST_DIR,
    })

    const pkg = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf-8'))
    expect(pkg.description).toBe('My custom plugin')
  })

  it('usa author custom quando fornecido', () => {
    const pluginDir = scaffoldPlugin({
      name: 'authored',
      author: 'Test Author',
      targetDir: TEST_DIR,
    })

    const pkg = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf-8'))
    expect(pkg.author).toBe('Test Author')
  })

  it('gera index.ts com tool de exemplo quando withExampleTool=true', () => {
    const pluginDir = scaffoldPlugin({
      name: 'with-tool',
      targetDir: TEST_DIR,
      withExampleTool: true,
    })

    const index = readFileSync(join(pluginDir, 'index.ts'), 'utf-8')
    expect(index).toContain('with_tool_example')
    expect(index).toContain('ctx.tools.register')
    expect(index).toContain('ctx.tools.unregister')
  })

  it('gera index.ts sem tool quando withExampleTool=false', () => {
    const pluginDir = scaffoldPlugin({
      name: 'no-tool',
      targetDir: TEST_DIR,
      withExampleTool: false,
    })

    const index = readFileSync(join(pluginDir, 'index.ts'), 'utf-8')
    expect(index).toContain('Registre suas tools aqui')
    expect(index).not.toContain('_example')
  })

  it('gera README.md com nome do plugin', () => {
    const pluginDir = scaffoldPlugin({
      name: 'readme-test',
      targetDir: TEST_DIR,
    })

    const readme = readFileSync(join(pluginDir, 'README.md'), 'utf-8')
    expect(readme).toContain('athion-plugin-readme-test')
    expect(readme).toContain('readme_test_example')
  })

  it('lança erro se diretório já existe', () => {
    scaffoldPlugin({ name: 'duplicate', targetDir: TEST_DIR })

    expect(() => scaffoldPlugin({ name: 'duplicate', targetDir: TEST_DIR })).toThrow(
      'Diretório já existe',
    )
  })

  it('retorna caminho do diretório criado', () => {
    const result = scaffoldPlugin({ name: 'return-path', targetDir: TEST_DIR })
    expect(result).toBe(join(TEST_DIR, 'return-path'))
  })

  it('usa defaults para description e author quando não fornecidos', () => {
    const pluginDir = scaffoldPlugin({
      name: 'defaults',
      targetDir: TEST_DIR,
    })

    const pkg = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf-8'))
    expect(pkg.description).toContain('Athion plugin: defaults')
    expect(pkg.author).toBe('Athion User')
  })
})
