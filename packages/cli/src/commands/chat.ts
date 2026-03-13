/**
 * Comando `athion chat` — Chat interativo com o assistente.
 * Descrição: Gerencia os modos de conversa do CLI: interativo, one-shot e retomada de sessão.
 *
 * Três modos de operação:
 * 1. Interativo (default): abre TUI com Ink
 * 2. One-shot (-m "prompt"): envia, imprime resposta, sai
 * 3. Resume (--resume ou --session <id>): retoma sessão existente
 */

import type { Argv } from 'yargs'

/** ChatArgs
 * Descrição: Argumentos aceitos pelo comando chat.
 */
export interface ChatArgs {
  /** Mensagem para envio direto no modo one-shot */
  message?: string | undefined
  /** Flag para retomar a última sessão */
  resume?: boolean | undefined
  /** ID da sessão específica a ser retomada */
  session?: string | undefined
}

/** chatCommand
 * Descrição: Configura as opções do comando chat no yargs (message, resume, session).
 * @param yargs - Instância do yargs para configuração das opções
 * @returns Instância do yargs com opções message, resume e session registradas
 */
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

/** chatHandler
 * Descrição: Handler principal que roteia entre modo one-shot e interativo.
 * @param args - Argumentos do comando chat
 * @returns Promise que resolve quando o chat é encerrado
 */
export async function chatHandler(args: ChatArgs) {
  const { bootstrap } = await import('@athion/core')
  const { resolve } = await import('node:path')

  const core = await bootstrap({
    skillsDir: resolve(import.meta.dir, '../../../core/skills'),
    workspacePath: process.cwd(),
  })

  if (args.message) {
    await runOneShot(core, args.message)
  } else {
    await runInteractive(core, args)
  }
}

/** runOneShot
 * Descrição: Executa o chat no modo one-shot: envia mensagem, imprime resposta e sai. Sem Ink.
 * @param core - Instância do core do Athion inicializada
 * @param message - Mensagem do usuário a ser enviada
 * @returns Promise que resolve quando a resposta é totalmente impressa
 */
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

/** runInteractive
 * Descrição: Abre a TUI interativa do chat usando Ink e React.
 * @param core - Instância do core do Athion inicializada
 * @param args - Argumentos do comando chat para retomada de sessão
 * @returns Promise que resolve quando o componente React é renderizado
 */
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
