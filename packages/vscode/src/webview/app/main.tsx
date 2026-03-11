/**
 * Entry point do React App do webview.
 * Renderiza o App no root div injetado pelo WebviewViewProvider.
 */

import { createRoot } from 'react-dom/client'
import { initI18n } from '@athion/shared'
import { App } from './App.js'
import './styles/vscode.css'

// Inicializa i18n com locale padrão (pt-BR) imediatamente.
// O locale correto será aplicado quando 'locale:set' chegar da extensão via useChat.
initI18n()

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(<App />)
}
