/**
 * Comando `athion chat` — Chat interativo com o assistente.
 *
 * Três modos de operação:
 * 1. Interativo (default): abre TUI com Ink
 * 2. One-shot (-m "prompt"): envia, imprime resposta, sai
 * 3. Resume (--resume ou --session <id>): retoma sessão existente
 */

import type { Argv } from 'yargs'

export interface ChatArgs {
  message?: string | undefined
  resume?: boolean | undefined
  session?: string | undefined
}

export function chatCommand(yargs: Argv) {
  return yargs
    .option('message', {
      alias: 'm',
      type: 'string',
      describe: 'Enviar mensagem e sair (one-shot mode)',
    })
    .option('resume', {
      alias: 'r',
      type: 'boolean',
      describe: 'Retomar última sessão',
    })
    .option('session', {
      alias: 's',
      type: 'string',
      describe: 'Retomar sessão específica por ID',
    })
}

export async function chatHandler(args: ChatArgs) {
  const { bootstrap } = await import('@athion/core')
  const { resolve } = await import('node:path')

  const core = await bootstrap({
    skillsDir: resolve(import.meta.dir, '../../core/skills'),
  })

  if (args.message) {
    await runOneShot(core, args.message)
  } else {
    await runInteractive(core, args)
  }
}

/** One-shot: envia mensagem, imprime resposta, sai. Sem Ink. */
async function runOneShot(
  core: Awaited<ReturnType<typeof import('@athion/core').bootstrap>>,
  message: string,
) {
  const session = await core.orchestrator.createSession('cli', 'One-shot')
  const stream = core.orchestrator.chat(session.id, { content: message })

  for await (const event of stream) {
    if (event.type === 'content') {
      process.stdout.write(event.content)
    }
  }
  process.stdout.write('\n')
}

/** Interativo: abre TUI com Ink. */
async function runInteractive(
  core: Awaited<ReturnType<typeof import('@athion/core').bootstrap>>,
  args: ChatArgs,
) {
  const { render } = await import('ink')
  const { createElement } = await import('react')
  const { ChatApp } = await import('../ui/ChatApp.js')

  let sessionId: string | undefined

  if (args.session) {
    sessionId = args.session
  } else if (args.resume) {
    // TODO: buscar última sessão do storage
  }

  const session = sessionId
    ? await core.orchestrator.loadSession(sessionId)
    : await core.orchestrator.createSession('cli', 'Chat interativo')

  render(createElement(ChatApp, { core, session }))
}
