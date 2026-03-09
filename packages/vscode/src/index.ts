/**
 * @athion/vscode — VS Code Extension
 *
 * Entry point is extension.ts (activate/deactivate).
 * This file re-exports for library consumers (if any).
 */

export { VERSION } from '@athion/shared'
export { activate, deactivate } from './extension.js'
