/**
 * useFeedbackPhrase
 * Descrição: Hook que cicla frases humorísticas enquanto o modelo processa a resposta (Desktop).
 * Ativo quando `isStreaming=true`, troca a frase a cada `intervalMs` ms (padrão 5s).
 * Possui anti-repetição para evitar mostrar a mesma frase consecutivamente.
 * As frases vêm do sistema i18n via `ta('feedback.loading_phrases')`.
 */

import { useEffect, useRef, useState } from 'react'
import { ta } from '@athion/shared'

/** useFeedbackPhrase
 * Descrição: Hook React que retorna uma frase de feedback aleatória durante o streaming, trocando periodicamente
 * @param isStreaming - Indica se o assistente está gerando uma resposta
 * @param intervalMs - Intervalo em milissegundos entre trocas de frase (padrão: 5000)
 * @returns A frase atual de feedback, ou string vazia quando não está em streaming
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

    /** pick
     * Descrição: Seleciona uma frase aleatória diferente da anterior
     */
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
