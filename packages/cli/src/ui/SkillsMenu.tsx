/**
 * SkillsMenu — Submenu interativo de skills.
 * Descrição: Componente que exibe um menu navegável para gerenciar skills instaladas.
 *
 * Fluxo:
 *   'list'    → lista skills com setas + Enter para selecionar
 *   'actions' → mostra Ver / Editar / Excluir para a skill selecionada
 *
 * Esc volta ao modo anterior ou fecha o menu.
 */

import { Box, Text, useInput } from 'ink'
import { useState, useRef } from 'react'
import { unlinkSync } from 'node:fs'
import { execSync } from 'node:child_process'
import type { SkillDefinition } from '@athion/core'
import type { Theme } from '../types.js'

/** SkillsMenuProps
 * Descrição: Props do componente SkillsMenu.
 */
interface SkillsMenuProps {
  /** Lista de skills disponíveis para exibição */
  skills: SkillDefinition[]
  /** Nome da skill ativa atualmente, se houver */
  activeSkillName: string | undefined
  /** Callback para fechar o menu */
  onClose: () => void
  /** Callback para exibir uma mensagem no chat */
  onMessage: (msg: string) => void
  /** Callback chamado quando uma skill é excluída */
  onSkillDeleted: (name: string) => void
  /** Callback chamado quando uma skill é ativada ou desativada */
  onSkillActivated: (name: string | undefined) => void
  /** Tema visual com as cores a serem aplicadas */
  theme: Theme
}

/** Mode
 * Descrição: Modo de exibição do menu: lista de skills ou ações para uma skill.
 */
type Mode = 'list' | 'actions'

/** ACTIONS
 * Descrição: Lista de ações disponíveis para uma skill selecionada.
 */
const ACTIONS = ['Usar skill', 'Ver conteúdo', 'Editar arquivo', 'Excluir skill'] as const

/** SkillsMenu
 * Descrição: Componente interativo que permite navegar, visualizar, ativar, editar e excluir skills
 * usando setas do teclado e Enter para seleção.
 * @param props - Props contendo skills, callbacks e tema visual
 * @returns Elemento React com o menu de skills
 */
export function SkillsMenu({
  skills,
  activeSkillName,
  onClose,
  onMessage,
  onSkillDeleted,
  onSkillActivated,
  theme,
}: SkillsMenuProps) {
  const [mode, setMode] = useState<Mode>('list')
  const [skillIdx, setSkillIdx] = useState(0)
  const [actionIdx, setActionIdx] = useState(0)

  // Refs frescos para useInput
  const modeRef = useRef(mode)
  const skillIdxRef = useRef(skillIdx)
  const actionIdxRef = useRef(actionIdx)
  const skillsRef = useRef(skills)
  modeRef.current = mode
  skillIdxRef.current = skillIdx
  actionIdxRef.current = actionIdx
  skillsRef.current = skills

  useInput((input, key) => {
    const m = modeRef.current
    const sks = skillsRef.current
    const si = skillIdxRef.current
    const ai = actionIdxRef.current

    // Escape: volta ou fecha
    if (key.escape) {
      if (m === 'actions') {
        setMode('list')
        setActionIdx(0)
      } else {
        onClose()
      }
      return
    }

    if (m === 'list') {
      if (key.upArrow) {
        setSkillIdx((i) => (i === 0 ? sks.length - 1 : i - 1))
      } else if (key.downArrow) {
        setSkillIdx((i) => (i === sks.length - 1 ? 0 : i + 1))
      } else if (key.return) {
        setMode('actions')
        setActionIdx(0)
      }
      return
    }

    if (m === 'actions') {
      if (key.upArrow) {
        setActionIdx((i) => (i === 0 ? ACTIONS.length - 1 : i - 1))
      } else if (key.downArrow) {
        setActionIdx((i) => (i === ACTIONS.length - 1 ? 0 : i + 1))
      } else if (key.return) {
        const skill = sks[si]
        if (!skill) return
        executeAction(ai, skill)
      }
    }

    void input // suppress unused warning
  })

  /** executeAction
   * Descrição: Executa a ação selecionada sobre a skill (usar, ver, editar ou excluir).
   * @param ai - Índice da ação selecionada
   * @param skill - Definição da skill alvo da ação
   */
  function executeAction(ai: number, skill: SkillDefinition) {
    if (ai === 0) {
      // Usar skill — ativa explicitamente
      const isAlreadyActive = activeSkillName === skill.name
      if (isAlreadyActive) {
        onSkillActivated(undefined)
        onMessage(`Skill \`${skill.name}\` desativada. Voltando ao modo automático.`)
      } else {
        onSkillActivated(skill.name)
        onMessage(
          `**Skill \`${skill.name}\` ativada!**\n\n` +
            `*${skill.description}*\n\n` +
            `As instruções desta skill serão aplicadas nas próximas mensagens.\n` +
            `Para desativar: abra \`/skills\` e selecione "Usar skill" novamente.`,
        )
      }
      onClose()
    } else if (ai === 1) {
      // Ver conteúdo
      onMessage(
        `**Skill: ${skill.name}**\n\n` +
          `*${skill.description}*\n\n` +
          `**Triggers:** ${skill.triggers.join(', ') || '(nenhum)'}\n\n` +
          `**Instruções:**\n${skill.instructions}`,
      )
      onClose()
    } else if (ai === 2) {
      // Editar — abre no editor do sistema
      if (!skill.sourcePath) {
        onMessage(`Skill \`${skill.name}\` não tem arquivo fonte para editar.`)
        onClose()
        return
      }
      try {
        const editor = process.env.EDITOR ?? process.env.VISUAL ?? 'open'
        execSync(`${editor} "${skill.sourcePath}"`, { stdio: 'ignore' })
        onMessage(`Abrindo \`${skill.sourcePath}\` no editor...`)
      } catch {
        try {
          execSync(`open "${skill.sourcePath}"`, { stdio: 'ignore' })
          onMessage(`Abrindo \`${skill.sourcePath}\`...`)
        } catch {
          onMessage(`Não foi possível abrir o editor. Arquivo: \`${skill.sourcePath}\``)
        }
      }
      onClose()
    } else if (ai === 3) {
      // Excluir
      if (!skill.sourcePath) {
        onMessage(`Skill \`${skill.name}\` não tem arquivo fonte para excluir.`)
        onClose()
        return
      }
      try {
        unlinkSync(skill.sourcePath)
        onSkillDeleted(skill.name)
        onMessage(`Skill \`${skill.name}\` excluída.`)
      } catch (err) {
        onMessage(`Erro ao excluir: ${(err as Error).message}`)
      }
      onClose()
    }
  }

  const selectedSkill = skills[skillIdx]

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.accent}
      paddingX={1}
      marginBottom={1}
    >
      {/* Header */}
      <Box marginBottom={0}>
        <Text color={theme.accent} bold>
          ◆ Skills{mode === 'actions' && selectedSkill ? ` › ${selectedSkill.name}` : ''}
        </Text>
        <Text color={theme.muted}> — Esc para voltar/fechar</Text>
      </Box>

      <Box marginBottom={0}>
        <Text color={theme.muted}>{'─'.repeat(40)}</Text>
      </Box>

      {mode === 'list' && (
        <>
          {skills.map((skill, i) => {
            const isSelected = i === skillIdx
            const isActive = skill.name === activeSkillName
            return (
              <Box key={skill.name} gap={1}>
                <Text color={isSelected ? theme.accent : theme.muted} bold={isSelected}>
                  {isSelected ? '▶' : ' '}
                </Text>
                <Text
                  color={
                    isActive
                      ? (theme.success ?? theme.accent)
                      : isSelected
                        ? theme.accent
                        : theme.secondary
                  }
                  bold={isSelected || isActive}
                >
                  {skill.name}
                </Text>
                {isActive && <Text color={theme.success ?? theme.accent}> ●</Text>}
                <Text color={theme.muted}>{skill.description}</Text>
              </Box>
            )
          })}
          <Box marginTop={0}>
            <Text color={theme.muted} dimColor>
              ↑↓ navegar │ Enter selecionar │ Esc fechar
            </Text>
          </Box>
        </>
      )}

      {mode === 'actions' && selectedSkill && (
        <>
          <Box marginBottom={0}>
            <Text color={theme.secondary}>{selectedSkill.description}</Text>
          </Box>
          {ACTIONS.map((action, i) => {
            const isSelected = i === actionIdx
            // 0=Usar(success/warning), 1=Ver(accent), 2=Editar(warning), 3=Excluir(error)
            const colors = [theme.success ?? theme.accent, theme.accent, theme.warning, theme.error]
            const isActiveSkill = i === 0 && selectedSkill && activeSkillName === selectedSkill.name
            const label = i === 0 && isActiveSkill ? 'Desativar skill ✓' : action
            return (
              <Box key={action} gap={1}>
                <Text color={isSelected ? theme.accent : theme.muted} bold={isSelected}>
                  {isSelected ? '▶' : ' '}
                </Text>
                <Text
                  color={
                    isSelected
                      ? (colors[i] ?? theme.accent)
                      : isActiveSkill
                        ? (theme.success ?? theme.accent)
                        : theme.secondary
                  }
                  bold={isSelected || isActiveSkill}
                >
                  {label}
                </Text>
              </Box>
            )
          })}
          <Box marginTop={0}>
            <Text color={theme.muted} dimColor>
              ↑↓ navegar │ Enter executar │ Esc voltar
            </Text>
          </Box>
        </>
      )}
    </Box>
  )
}
