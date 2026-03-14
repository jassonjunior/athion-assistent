/**
 * useFeedbackPhrase — Cicla frases humorísticas enquanto o modelo processa (CLI).
 * Descrição: Hook que exibe frases de feedback rotativas durante o processamento do LLM,
 * com anti-repetição e intervalo configurável.
 *
 * - Ativo quando `isActive=true`
 * - Troca frase a cada `intervalMs` ms (padrão 15s)
 * - Anti-repetição: evita mostrar a mesma frase consecutivamente
 * - Frases vêm do sistema i18n via `ta('feedback.loading_phrases')`
 */

import { useEffect, useRef, useState } from 'react'
import { ta } from '@athion/shared'

/** useFeedbackPhrase
 * Descrição: Hook React que seleciona e cicla frases de feedback internacionalizadas
 * durante o processamento do modelo, evitando repetições consecutivas.
 * @param isActive - Indica se o hook deve estar ativo (geralmente true durante streaming)
 * @param intervalMs - Intervalo em milissegundos entre trocas de frase (padrão: 15000)
 * @returns Frase de feedback atual, ou string vazia quando inativo
 */
export function useFeedbackPhrase(isActive: boolean, intervalMs = 15000): string {
  const [phrase, setPhrase] = useState('')
  const prevIndexRef = useRef<number>(-1)

  useEffect(() => {
    if (!isActive) {
      setPhrase('')
      prevIndexRef.current = -1
      return
    }

    const phrases = ta('feedback.loading_phrases')
    if (phrases.length === 0) return

    const pick = () => {
      let next = Math.floor(Math.random() * phrases.length)
      let guard = 0
      while (next === prevIndexRef.current && guard < 5) {
        next = Math.floor(Math.random() * phrases.length)
        guard++
      }
      prevIndexRef.current = next
      setPhrase(phrases[next] ?? '')
    }

    pick()
    const id = setInterval(pick, intervalMs)
    return () => clearInterval(id)
  }, [isActive, intervalMs])

  return phrase
}
