import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Opções para criar um novo plugin.
 */
export interface ScaffoldOptions {
  /** Nome do plugin (ex: 'git-tools', 'my-plugin') */
  name: string
  /** Descrição do plugin */
  description?: string
  /** Autor do plugin */
  author?: string
  /** Diretório onde criar (default: ~/.athion/plugins/) */
  targetDir?: string
  /** Se deve criar uma tool de exemplo */
  withExampleTool?: boolean
}

/**
 * Cria a estrutura de diretórios e arquivos para um novo plugin Athion.
 *
 * Gera:
 *   <targetDir>/<name>/
 *   ├── index.ts        — entry point com PluginDefinition
 *   ├── package.json    — metadata do plugin
 *   └── README.md       — documentação básica
 *
 * @param options - Configuração do scaffold
 * @returns Caminho do diretório criado
 * @throws Se o diretório já existir
 */
export function scaffoldPlugin(options: ScaffoldOptions): string {
  const {
    name,
    description = `Athion plugin: ${name}`,
    author = 'Athion User',
    targetDir = '~/.athion/plugins',
    withExampleTool = true,
  } = options

  const resolvedDir = targetDir.replace('~', process.env.HOME ?? '.')
  const pluginDir = join(resolvedDir, name)

  if (existsSync(pluginDir)) {
    throw new Error(`Diretório já existe: ${pluginDir}`)
  }

  mkdirSync(pluginDir, { recursive: true })

  // ── index.ts ────────────────────────────────────────────
  const indexContent = generateIndexTs(name, description, withExampleTool)
  writeFileSync(join(pluginDir, 'index.ts'), indexContent, 'utf-8')

  // ── package.json ────────────────────────────────────────
  const packageJson = {
    name: `athion-plugin-${name}`,
    version: '0.1.0',
    description,
    author,
    main: 'index.ts',
    keywords: ['athion', 'athion-plugin', name],
    license: 'MIT',
  }
  writeFileSync(join(pluginDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf-8')

  // ── README.md ───────────────────────────────────────────
  const readme = generateReadme(name, description)
  writeFileSync(join(pluginDir, 'README.md'), readme, 'utf-8')

  return pluginDir
}

// ── Generators ──────────────────────────────────────────────

function generateIndexTs(name: string, description: string, withTool: boolean): string {
  const toolBlock = withTool
    ? `
    // Registra uma tool que o LLM pode chamar
    ctx.tools.register({
      name: '${name.replace(/-/g, '_')}_example',
      description: 'Example tool from ${name} plugin',
      parameters: z.object({
        input: z.string().describe('Input text'),
      }),
      execute: async ({ input }) => {
        return { success: true, data: \`[${name}] Processed: \${input}\` }
      },
    })`
    : `    // Registre suas tools aqui:
    // ctx.tools.register({ name: '...', description: '...', parameters: z.object({...}), execute: async (params) => ({ success: true, data: '...' }) })`

  const unloadBlock = withTool
    ? `
    ctx.tools.unregister('${name.replace(/-/g, '_')}_example')`
    : `    // Faça cleanup aqui`

  return `/**
 * Plugin: ${name}
 * ${description}
 */

import { z } from 'zod/v4'
import type { PluginDefinition } from '@athion/core'

const plugin: PluginDefinition = {
  name: '${name}',
  version: '0.1.0',
  description: '${description}',

  async onLoad(ctx) {
    ctx.log.info('Carregando...')
${toolBlock}
    ctx.log.info('Pronto!')
  },

  async onUnload(ctx) {
${unloadBlock}
    ctx.log.info('Descarregado')
  },
}

export default plugin
`
}

function generateReadme(name: string, description: string): string {
  return `# athion-plugin-${name}

${description}

## Instalacao

Copie esta pasta para \`~/.athion/plugins/${name}/\` ou instale via npm:

\`\`\`bash
bun add athion-plugin-${name}
\`\`\`

## Uso

O plugin é carregado automaticamente pelo Athion ao iniciar.

### Tools registradas

| Tool | Descricao |
|------|-----------|
| \`${name.replace(/-/g, '_')}_example\` | Example tool |

## Desenvolvimento

Edite \`index.ts\` e use \`plugins.reload('${name}')\` para hot-reload.
`
}
