#!/usr/bin/env bun
/**
 * Athion CLI — Entry point.
 *
 * Comandos:
 *   athion              → chat interativo (default)
 *   athion chat          → chat interativo
 *   athion chat -m "..."→ one-shot
 *   athion config        → gerenciar config
 *   athion agents        → listar agentes
 *   athion skills        → listar skills
 *   athion sessions      → gerenciar sessões
 *   athion serve         → servidor HTTP (stub)
 */

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { chatCommand, chatHandler } from './commands/chat.js'
import { configCommand } from './commands/config.js'
import { agentsCommand, agentsHandler } from './commands/agents.js'
import { skillsCommand, skillsHandler } from './commands/skills.js'
import { sessionsCommand } from './commands/sessions.js'
import { serveCommand, serveHandler } from './commands/serve.js'
import { codebaseCommand } from './commands/codebase.js'
import { VERSION, initI18n } from '@athion/shared'

// Inicializa i18n com locale do sistema (LANG / LC_ALL / LC_MESSAGES)
initI18n()

await yargs(hideBin(process.argv))
  .scriptName('athion')
  .version(VERSION)
  .command('chat', 'Chat interativo com o assistente', chatCommand, chatHandler)
  .command('config', 'Gerenciar configuração', configCommand)
  .command('agents', 'Listar agentes disponíveis', agentsCommand, agentsHandler)
  .command('skills', 'Listar skills disponíveis', skillsCommand, skillsHandler)
  .command('sessions', 'Gerenciar sessões', sessionsCommand)
  .command('serve', 'Iniciar servidor HTTP', serveCommand, serveHandler)
  .command('codebase', 'Indexar e buscar no codebase', codebaseCommand)
  .command('$0', false as never, chatCommand, chatHandler)
  .strict()
  .help()
  .parse()
