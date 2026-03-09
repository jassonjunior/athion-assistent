/**
 * Plugin de exemplo: Hello World
 *
 * Demonstra as 3 capacidades principais de um plugin Athion:
 * 1. Registrar tools — o LLM pode chamar `greet` durante o chat
 * 2. Escutar eventos do bus — reage quando config muda
 * 3. Acessar config — lê configurações do sistema
 *
 * Para usar:
 *   copie esta pasta para ~/.athion/plugins/hello-world/
 *   ou carregue programaticamente: plugins.load(helloWorldPlugin)
 */

import { z } from 'zod/v4'
import type { PluginDefinition } from '../../types'

let configUnsub: (() => void) | null = null

const helloWorldPlugin: PluginDefinition = {
  name: 'hello-world',
  version: '1.0.0',
  description: 'Plugin de exemplo que registra uma tool de saudação e escuta eventos.',

  async onLoad(ctx) {
    // 1. Registrar uma tool que o LLM pode usar
    ctx.tools.register({
      name: 'greet',
      description: 'Greets a person by name. Returns a friendly message.',
      parameters: z.object({
        name: z.string().describe('The name of the person to greet'),
        language: z
          .enum(['pt', 'en', 'es'])
          .optional()
          .describe('Language for the greeting (default: en)'),
      }),
      execute: async (params) => {
        const { name, language } = params as { name: string; language?: 'pt' | 'en' | 'es' }
        const greetings: Record<string, string> = {
          en: `Hello, ${name}! Welcome to Athion.`,
          pt: `Olá, ${name}! Bem-vindo ao Athion.`,
          es: `¡Hola, ${name}! Bienvenido a Athion.`,
        }
        const msg = greetings[language ?? 'en'] ?? greetings.en
        return { success: true, data: msg }
      },
    })

    // 2. Escutar eventos do bus — reage quando config muda
    configUnsub = ctx.bus.subscribe(
      // Importamos o evento inline para não depender de caminhos internos
      {
        type: 'config.changed',
        schema: z.object({ key: z.string(), value: z.unknown() }),
      },
      (data) => {
        ctx.log.info(`Config '${data.key}' mudou para: ${JSON.stringify(data.value)}`)
      },
    )

    // 3. Ler config atual
    const model = ctx.config.get('model')
    ctx.log.info(`Modelo atual: ${model}`)
  },

  async onUnload(ctx) {
    // Cleanup: remove a tool e o listener
    ctx.tools.unregister('greet')
    if (configUnsub) {
      configUnsub()
      configUnsub = null
    }
    ctx.log.info('Goodbye!')
  },
}

export default helloWorldPlugin
