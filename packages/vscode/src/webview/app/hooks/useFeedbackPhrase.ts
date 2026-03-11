/**
 * useFeedbackPhrase — Cicla frases humorísticas enquanto o modelo processa.
 *
 * - Ativo quando `isStreaming=true`
 * - Troca frase a cada `intervalMs` ms (padrão 5s)
 * - Anti-repetição: evita mostrar a mesma frase consecutivamente
 * - Frases vêm do sistema i18n via `ta('feedback.loading_phrases')`
 */

import { useEffect, useRef, useState } from 'react'
import { ta } from '@athion/shared'

export function useFeedbackPhrase(isStreaming: boolean, intervalMs = 5000): string {
  const [phrase, setPhrase] = useState('')
  const prevIndexRef = useRef<number>(-1)

  useEffect(() => {
    if (!isStreaming) {
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
  }, [isStreaming, intervalMs])

  return phrase
}
