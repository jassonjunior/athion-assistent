/**
 * useFeedbackPhrase — Cicla frases humorísticas enquanto o modelo processa.
 *
 * - Ativo quando `isStreaming=true`
 * - Troca frase a cada `intervalMs` ms (padrão 5s)
 * - Anti-repetição: evita mostrar a mesma frase consecutivamente
 */

import { useEffect, useRef, useState } from 'react'

export const FEEDBACK_PHRASES: string[] = [
  'Calibrando o capacitor de fluxo...',
  'Tentando sair do Vim...',
  'Convertendo café em código...',
  'Resolvendo dependências... e crises existenciais...',
  'O bolo não é uma mentira, está apenas carregando...',
  'Reescrevendo em Rust... de brincadeira (ou não)...',
  'Consultando o Stack Overflow pela 47ª vez...',
  'Canalizando a Força...',
  'Aguardando o respawn...',
  'Debugando a realidade...',
  'Verificando se os elétrons estão bem...',
  'Processando... como um mainframe dos anos 80...',
  'Fazendo git blame no universo...',
  'Quase lá... (mentira descarada)...',
  'Invocando os deuses do JavaScript...',
  'Removendo console.logs do passado...',
  'Comprimindo o espaço-tempo em um array...',
  'Negociando com o garbage collector...',
  'Contando bits à mão para economizar...',
  'Sincronizando com a Matrix...',
  'Perguntando pro Copilot... que também não sabe...',
  'Iniciando protocolo de pânico controlado...',
  'Lendo a documentação pela primeira vez...',
  'Aplicando 15 camadas de abstração...',
  'Revertendo para o último commit funcional...',
  'Pressionando F para continuar...',
  'Calculando a resposta para tudo... é 42...',
  'Tentando não quebrar o prod...',
  'Fazendo deploy às sexta às 17h59...',
  'Esperando o CI/CD terminar...',
  'Mergeando PR sem conflitos (sonho)...',
  'Transpilando promessas em realidade...',
  'Procurando o bug que só aparece em prod...',
  'Escalando horizontalmente a criatividade...',
]

export function useFeedbackPhrase(isStreaming: boolean, intervalMs = 5000): string {
  const [phrase, setPhrase] = useState('')
  const prevIndexRef = useRef<number>(-1)

  useEffect(() => {
    if (!isStreaming) {
      setPhrase('')
      prevIndexRef.current = -1
      return
    }

    const pick = () => {
      let next = Math.floor(Math.random() * FEEDBACK_PHRASES.length)
      let guard = 0
      while (next === prevIndexRef.current && guard < 5) {
        next = Math.floor(Math.random() * FEEDBACK_PHRASES.length)
        guard++
      }
      prevIndexRef.current = next
      setPhrase(FEEDBACK_PHRASES[next] ?? '')
    }

    pick()
    const id = setInterval(pick, intervalMs)
    return () => clearInterval(id)
  }, [isStreaming, intervalMs])

  return phrase
}
