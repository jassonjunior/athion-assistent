/**
 * useFeedbackPhrase
 * Descrição: Hook que cicla frases humorísticas enquanto o modelo processa a resposta.
 * Ativo quando `isActive=true`, troca a frase a cada `intervalMs` ms.
 * Anti-repetição: evita mostrar a mesma frase consecutivamente.
 * Frases vêm do sistema i18n via `ta('feedback.loading_phrases')`.
 */

import { useEffect, useRef, useState } from 'react'
import { ta } from '../i18n/i18n.js'

/** useFeedbackPhrase
 * Descrição: Hook React que retorna uma frase de feedback aleatória durante o processamento, trocando periodicamente
 * @param isActive - Indica se o hook deve estar ativo (ex: durante streaming)
 * @param intervalMs - Intervalo em milissegundos entre trocas de frase (padrão: 5000)
 * @returns A frase atual de feedback, ou string vazia quando inativo
 */
export function useFeedbackPhrase(isActive: boolean, intervalMs = 5000): string {
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

    /** pick — Seleciona uma frase aleatória diferente da anterior */
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
