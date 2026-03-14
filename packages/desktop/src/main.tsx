/**
 * main
 * Descrição: Ponto de entrada da aplicação desktop React. Monta o componente App no DOM.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './styles/app.css'

/** root
 * Descrição: Elemento DOM raiz onde a aplicação React será montada
 */
const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
