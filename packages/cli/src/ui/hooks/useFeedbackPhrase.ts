/**
 * useFeedbackPhrase — Cicla frases humorísticas enquanto o modelo processa (CLI).
 *
 * - Ativo quando `isActive=true`
 * - Troca frase a cada `intervalMs` ms (padrão 15s)
 * - Anti-repetição: evita mostrar a mesma frase consecutivamente
 * - Frases vêm do sistema i18n via `ta('feedback.loading_phrases')`
 */

import { useEffect, useRef, useState } from 'react'
import { ta } from '@athion/shared'

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
