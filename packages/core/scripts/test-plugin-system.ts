/**
 * E2E Test: Plugin System
 *
 * Valida o ciclo de vida completo do sistema de plugins:
 * 1. Load — plugin carrega e registra tools
 * 2. Tools — tools do plugin aparecem no registry
 * 3. Execute — tool do plugin executa corretamente
 * 4. Bus events — eventos plugin.loaded/plugin.unloaded são emitidos
 * 5. Unload — plugin descarrega e cleanup automático
 * 6. Reload — hot-reload funciona
 * 7. Scaffold — gerador de template cria estrutura correta
 */

import { z } from 'zod/v4'
import { createBus } from '../src/bus/bus'
import { PluginError, PluginLoaded, PluginUnloaded } from '../src/bus/events'
import { createConfigManager } from '../src/config'
import { createPluginManager } from '../src/plugins'
import { scaffoldPlugin } from '../src/plugins/scaffold'
import type { PluginDefinition } from '../src/plugins/types'
import { createProviderLayer } from '../src/provider'
import { createToolRegistry } from '../src/tools'
import { BUILTIN_TOOLS } from '../src/tools/builtins'
import type { ToolDefinition } from '../src/tools/types'
import { existsSync, rmSync } from 'node:fs'

const DIVIDER = '═'.repeat(60)
const LINE = '─'.repeat(60)
let testsPassed = 0
let testsFailed = 0

function print(msg: string) {
  console.log(msg)
}

function assert(label: string, condition: boolean) {
  if (condition) {
    print(`  ✓ ${label}`)
    testsPassed++
  } else {
    print(`  ✗ ${label}`)
    testsFailed++
  }
}

// ── Plugin de teste (inline) ──────────────────────────────────

function createTestPlugin(name = 'test-plugin'): PluginDefinition {
  return {
    name,
    version: '1.0.0',
    description: 'Plugin de teste E2E',
    async onLoad(ctx) {
      ctx.tools.register({
        name: 'test_echo',
        description: 'Echoes the input back',
        parameters: z.object({ message: z.string() }),
        execute: async (params) => {
          const { message } = params as { message: string }
          return { success: true, data: `Echo: ${message}` }
        },
      })
      ctx.log.info('Test plugin loaded')
    },
    async onUnload(ctx) {
      ctx.tools.unregister('test_echo')
      ctx.log.info('Test plugin unloaded')
    },
  }
}

// ── Setup ──────────────────────────────────────────────────────

function createTestDeps() {
  const bus = createBus()
  const config = createConfigManager()
  const provider = createProviderLayer()
  const tools = createToolRegistry()
  for (const tool of BUILTIN_TOOLS) tools.register(tool as ToolDefinition)
  return { bus, config, provider, tools }
}

// ── Tests ──────────────────────────────────────────────────────

async function testLoadAndUnload() {
  print(`\n${LINE}`)
  print('  TEST 1: Load e Unload')
  print(LINE)

  const deps = createTestDeps()
  const manager = createPluginManager(deps)
  const plugin = createTestPlugin()

  // Antes do load
  assert('Nenhum plugin carregado inicialmente', manager.list().length === 0)
  assert('has() retorna false antes do load', !manager.has('test-plugin'))

  // Load
  await manager.load(plugin)

  assert('Plugin carregado', manager.has('test-plugin'))
  assert('list() retorna 1 plugin', manager.list().length === 1)
  assert('get() retorna o plugin', manager.get('test-plugin')?.definition.name === 'test-plugin')
  assert('get() tem versão correta', manager.get('test-plugin')?.definition.version === '1.0.0')

  // Tool registrada
  const tool = deps.tools.get('test_echo')
  assert('Tool test_echo registrada no registry', tool !== undefined)
  assert('Tool tem nome correto', tool?.name === 'test_echo')

  // Unload
  await manager.unload('test-plugin')

  assert('Plugin removido após unload', !manager.has('test-plugin'))
  assert('list() vazio após unload', manager.list().length === 0)
  assert('Tool removida após unload', deps.tools.get('test_echo') === undefined)
}

async function testToolExecution() {
  print(`\n${LINE}`)
  print('  TEST 2: Execução de tool do plugin')
  print(LINE)

  const deps = createTestDeps()
  const manager = createPluginManager(deps)
  await manager.load(createTestPlugin())

  const result = await deps.tools.execute('test_echo', { message: 'Hello Athion!' })

  assert('Tool executou com sucesso', result.success === true)
  assert('Resultado correto', result.data === 'Echo: Hello Athion!')

  // Parâmetro inválido
  const badResult = await deps.tools.execute('test_echo', { wrong: 'param' })
  assert('Parâmetro inválido retorna erro', badResult.success === false)

  await manager.unload('test-plugin')
}

async function testBusEvents() {
  print(`\n${LINE}`)
  print('  TEST 3: Eventos do bus')
  print(LINE)

  const deps = createTestDeps()
  const manager = createPluginManager(deps)

  // Escuta eventos ANTES do load
  let loadedEvent: { name: string; version: string; toolsRegistered: string[] } | null = null
  let unloadedEvent: { name: string } | null = null
  let errorEvent: { name: string; error: string } | null = null

  deps.bus.subscribe(PluginLoaded, (data) => {
    loadedEvent = data
  })
  deps.bus.subscribe(PluginUnloaded, (data) => {
    unloadedEvent = data
  })
  deps.bus.subscribe(PluginError, (data) => {
    errorEvent = data
  })

  // Load
  await manager.load(createTestPlugin())

  assert('Evento plugin.loaded emitido', loadedEvent !== null)
  assert('Evento tem nome correto', loadedEvent?.name === 'test-plugin')
  assert('Evento tem versão', loadedEvent?.version === '1.0.0')
  assert(
    'Evento lista tools registradas',
    loadedEvent?.toolsRegistered.includes('test_echo') ?? false,
  )

  // Unload
  await manager.unload('test-plugin')

  assert('Evento plugin.unloaded emitido', unloadedEvent !== null)
  assert('Evento unloaded tem nome correto', unloadedEvent?.name === 'test-plugin')

  // Error — plugin que falha no onLoad
  const badPlugin: PluginDefinition = {
    name: 'bad-plugin',
    version: '0.0.1',
    onLoad: async () => {
      throw new Error('Falha intencional')
    },
  }

  try {
    await manager.load(badPlugin)
  } catch {
    // Esperado
  }

  assert('Evento plugin.error emitido', errorEvent !== null)
  assert('Evento error tem nome correto', errorEvent?.name === 'bad-plugin')
  assert('Evento error tem mensagem', errorEvent?.error.includes('Falha intencional') ?? false)
  assert('Plugin com erro NÃO ficou carregado', !manager.has('bad-plugin'))
}

async function testAutoCleanup() {
  print(`\n${LINE}`)
  print('  TEST 4: Cleanup automático (plugin sem onUnload)')
  print(LINE)

  const deps = createTestDeps()
  const manager = createPluginManager(deps)

  // Plugin SEM onUnload — o manager deve fazer cleanup automaticamente
  const lazyPlugin: PluginDefinition = {
    name: 'lazy-plugin',
    version: '1.0.0',
    async onLoad(ctx) {
      ctx.tools.register({
        name: 'lazy_tool',
        description: 'Tool that will be auto-cleaned',
        parameters: z.object({}),
        execute: async () => ({ success: true, data: 'lazy' }),
      })
      // Também registra um listener no bus
      ctx.bus.subscribe(PluginLoaded, () => {
        /* noop */
      })
    },
    // Sem onUnload! O manager deve limpar tudo sozinho.
  }

  await manager.load(lazyPlugin)

  assert('Tool lazy_tool registrada', deps.tools.get('lazy_tool') !== undefined)

  await manager.unload('lazy-plugin')

  assert('Tool lazy_tool removida automaticamente', deps.tools.get('lazy_tool') === undefined)
  assert('Plugin removido', !manager.has('lazy-plugin'))
}

async function testReload() {
  print(`\n${LINE}`)
  print('  TEST 5: Hot-reload')
  print(LINE)

  const deps = createTestDeps()
  const manager = createPluginManager(deps)

  // Load v1
  await manager.load(createTestPlugin())
  assert('v1 carregado', manager.get('test-plugin')?.definition.version === '1.0.0')

  // Reload com nova definição (v2)
  const v2: PluginDefinition = {
    name: 'test-plugin',
    version: '2.0.0',
    async onLoad(ctx) {
      ctx.tools.register({
        name: 'test_echo_v2',
        description: 'Echo v2',
        parameters: z.object({ text: z.string() }),
        execute: async (params) => {
          const { text } = params as { text: string }
          return { success: true, data: `V2: ${text}` }
        },
      })
    },
  }

  await manager.reload('test-plugin', v2)

  assert('Versão atualizada para 2.0.0', manager.get('test-plugin')?.definition.version === '2.0.0')
  assert('Tool v1 removida', deps.tools.get('test_echo') === undefined)
  assert('Tool v2 registrada', deps.tools.get('test_echo_v2') !== undefined)

  // Executa v2
  const result = await deps.tools.execute('test_echo_v2', { text: 'reload works' })
  assert('Tool v2 executa corretamente', result.data === 'V2: reload works')

  await manager.unload('test-plugin')
}

async function testDuplicateLoad() {
  print(`\n${LINE}`)
  print('  TEST 6: Proteção contra load duplicado')
  print(LINE)

  const deps = createTestDeps()
  const manager = createPluginManager(deps)

  await manager.load(createTestPlugin())

  let threw = false
  try {
    await manager.load(createTestPlugin())
  } catch (err) {
    threw = true
    assert('Erro menciona reload()', (err as Error).message.includes('reload()'))
  }

  assert('Load duplicado lança erro', threw)

  await manager.unload('test-plugin')
}

async function testScaffold() {
  print(`\n${LINE}`)
  print('  TEST 7: Scaffold (gerador de template)')
  print(LINE)

  const testDir = '/tmp/athion-test-scaffold'
  const pluginName = 'test-scaffold'

  // Limpa se existir de teste anterior
  if (existsSync(`${testDir}/${pluginName}`)) {
    rmSync(`${testDir}/${pluginName}`, { recursive: true })
  }

  const path = scaffoldPlugin({
    name: pluginName,
    description: 'Plugin gerado por teste',
    author: 'E2E Test',
    targetDir: testDir,
    withExampleTool: true,
  })

  assert('Diretório criado', existsSync(path))
  assert('index.ts criado', existsSync(`${path}/index.ts`))
  assert('package.json criado', existsSync(`${path}/package.json`))
  assert('README.md criado', existsSync(`${path}/README.md`))

  // Valida conteúdo do package.json
  const pkg = JSON.parse(await Bun.file(`${path}/package.json`).text())
  assert('package.json tem nome correto', pkg.name === 'athion-plugin-test-scaffold')
  assert('package.json tem versão', pkg.version === '0.1.0')
  assert('package.json tem keyword athion-plugin', pkg.keywords.includes('athion-plugin'))

  // Valida que index.ts é importável
  const indexContent = await Bun.file(`${path}/index.ts`).text()
  assert('index.ts contém nome do plugin', indexContent.includes("name: 'test-scaffold'"))
  assert('index.ts contém tool de exemplo', indexContent.includes('test_scaffold_example'))

  // Scaffold duplicado deve lançar erro
  let dupeError = false
  try {
    scaffoldPlugin({ name: pluginName, targetDir: testDir })
  } catch {
    dupeError = true
  }
  assert('Scaffold duplicado lança erro', dupeError)

  // Cleanup
  rmSync(testDir, { recursive: true })
}

async function testHelloWorldPlugin() {
  print(`\n${LINE}`)
  print('  TEST 8: Plugin hello-world (exemplo)')
  print(LINE)

  const deps = createTestDeps()
  const manager = createPluginManager(deps)

  // Importa o plugin de exemplo
  const helloWorld = (await import('../src/plugins/examples/hello-world/index.ts')).default

  assert('hello-world tem name', helloWorld.name === 'hello-world')
  assert('hello-world tem version', helloWorld.version === '1.0.0')
  assert('hello-world tem onLoad', typeof helloWorld.onLoad === 'function')
  assert('hello-world tem onUnload', typeof helloWorld.onUnload === 'function')

  // Load
  await manager.load(helloWorld)

  assert('hello-world carregado', manager.has('hello-world'))
  assert('Tool greet registrada', deps.tools.get('greet') !== undefined)

  // Executa tool greet
  const ptResult = await deps.tools.execute('greet', { name: 'Jasson', language: 'pt' })
  assert('greet pt funciona', ptResult.success && (ptResult.data as string).includes('Olá, Jasson'))

  const enResult = await deps.tools.execute('greet', { name: 'World' })
  assert(
    'greet en (default) funciona',
    enResult.success && (enResult.data as string).includes('Hello, World'),
  )

  const esResult = await deps.tools.execute('greet', { name: 'Mundo', language: 'es' })
  assert(
    'greet es funciona',
    esResult.success && (esResult.data as string).includes('¡Hola, Mundo'),
  )

  // Unload
  await manager.unload('hello-world')

  assert('Tool greet removida após unload', deps.tools.get('greet') === undefined)
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  print(DIVIDER)
  print('  ATHION PLUGIN SYSTEM — E2E TEST')
  print(DIVIDER)

  await testLoadAndUnload()
  await testToolExecution()
  await testBusEvents()
  await testAutoCleanup()
  await testReload()
  await testDuplicateLoad()
  await testScaffold()
  await testHelloWorldPlugin()

  print(`\n${DIVIDER}`)
  print(`  RESULTADO: ${testsPassed} passed, ${testsFailed} failed`)
  print(DIVIDER)

  process.exit(testsFailed > 0 ? 1 : 0)
}

main()
