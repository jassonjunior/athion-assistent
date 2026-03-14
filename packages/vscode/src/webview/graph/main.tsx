/**
 * Graph webview entry point
 * Descrição: Monta o React app do DependencyGraph no webview.
 */

import { createRoot } from 'react-dom/client'
import { GraphApp } from './GraphApp.js'
import './graph.css'

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(<GraphApp />)
}
