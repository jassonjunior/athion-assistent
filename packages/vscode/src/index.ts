/**
 * index
 * Descrição: Ponto de entrada público do pacote @athion/vscode.
 * Re-exporta a versão e as funções activate/deactivate para consumidores do pacote.
 */

/** VERSION - Versão atual do pacote, importada de @athion/shared */
export { VERSION } from '@athion/shared'
/** activate, deactivate - Funções de ciclo de vida da extensão VS Code */
export { activate, deactivate } from './extension.js'
