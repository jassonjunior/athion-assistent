/**
 * Entry point do React App do webview.
 * Renderiza o App no root div injetado pelo WebviewViewProvider.
 */

import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './styles/vscode.css'

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(<App />)
}
