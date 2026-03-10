/**
 * SkillsMenu — Submenu interativo de skills.
 *
 * Fluxo:
 *   'list'    → lista skills com ↑↓ + Enter para selecionar
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

interface SkillsMenuProps {
  skills: SkillDefinition[]
  onClose: () => void
  onMessage: (msg: string) => void
  onSkillDeleted: (name: string) => void
  theme: Theme
}

type Mode = 'list' | 'actions'

const ACTIONS = ['Ver conteúdo', 'Editar arquivo', 'Excluir skill'] as const

export function SkillsMenu({ skills, onClose, onMessage, onSkillDeleted, theme }: SkillsMenuProps) {
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

  function executeAction(ai: number, skill: SkillDefinition) {
    if (ai === 0) {
      // Ver conteúdo
      onMessage(
        `**Skill: ${skill.name}**\n\n` +
          `*${skill.description}*\n\n` +
          `**Triggers:** ${skill.triggers.join(', ')}\n\n` +
          `**Instruções:**\n${skill.instructions}`,
      )
      onClose()
    } else if (ai === 1) {
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
        // Fallback: tenta abrir com open (macOS)
        try {
          execSync(`open "${skill.sourcePath}"`, { stdio: 'ignore' })
          onMessage(`Abrindo \`${skill.sourcePath}\`...`)
        } catch {
          onMessage(`Não foi possível abrir o editor. Arquivo: \`${skill.sourcePath}\``)
        }
      }
      onClose()
    } else if (ai === 2) {
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
            return (
              <Box key={skill.name} gap={1}>
                <Text color={isSelected ? theme.accent : theme.muted} bold={isSelected}>
                  {isSelected ? '▶' : ' '}
                </Text>
                <Text color={isSelected ? theme.accent : theme.secondary} bold={isSelected}>
                  {skill.name}
                </Text>
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
            const colors = ['', theme.warning, theme.error]
            return (
              <Box key={action} gap={1}>
                <Text color={isSelected ? theme.accent : theme.muted} bold={isSelected}>
                  {isSelected ? '▶' : ' '}
                </Text>
                <Text
                  color={isSelected ? (colors[i] ?? theme.accent) : theme.secondary}
                  bold={isSelected}
                >
                  {action}
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
