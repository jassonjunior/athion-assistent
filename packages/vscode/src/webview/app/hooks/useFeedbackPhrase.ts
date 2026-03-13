/**
 * useFeedbackPhrase
 * Descrição: Hook que cicla frases humorísticas enquanto o modelo processa (streaming).
 * Ativo quando isStreaming=true, troca frase a cada intervalMs ms (padrão 5s).
 * Anti-repetição: evita mostrar a mesma frase consecutivamente.
 * Frases vêm do sistema i18n via ta('feedback.loading_phrases').
 */

import { useEffect, useRef, useState } from 'react'
import { ta } from '@athion/shared'

/**
 * useFeedbackPhrase
 * Descrição: Retorna uma frase de feedback aleatória que muda periodicamente durante streaming.
 * @param isStreaming - Flag que indica se o modelo está processando
 * @param intervalMs - Intervalo de troca de frase em milissegundos (padrão: 5000)
 * @returns Frase de feedback atual ou string vazia se não estiver em streaming
 */
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
