/**
 * Markdown — Renderiza markdown básico no terminal.
 *
 * Suporta: **bold**, *italic*, `code`, ```code blocks```, - listas
 * Usa Text do Ink com formatação inline.
 */

import { Text } from 'ink'
import type { Theme } from '../types.js'

interface MarkdownProps {
  content: string
  theme: Theme
}

export function Markdown({ content, theme }: MarkdownProps) {
  const lines = content.split('\n')

  return (
    <>
      {lines.map((line, i) => (
        <MarkdownLine key={i} line={line} theme={theme} />
      ))}
    </>
  )
}

function MarkdownLine({ line, theme }: { line: string; theme: Theme }) {
  // Code block delimiter
  if (line.startsWith('```')) {
    return <Text color={theme.muted}>{line}</Text>
  }

  // Headers
  if (line.startsWith('# ')) {
    return (
      <Text bold color={theme.primary}>
        {line.slice(2)}
      </Text>
    )
  }
  if (line.startsWith('## ')) {
    return (
      <Text bold color={theme.secondary}>
        {line.slice(3)}
      </Text>
    )
  }
  if (line.startsWith('### ')) {
    return (
      <Text bold color={theme.accent}>
        {line.slice(4)}
      </Text>
    )
  }

  // List items
  if (line.startsWith('- ') || line.startsWith('* ')) {
    return <Text> • {line.slice(2)}</Text>
  }

  // Numbered lists
  const numberedMatch = line.match(/^(\d+)\.\s/)
  if (numberedMatch) {
    return (
      <Text>
        {' '}
        {numberedMatch[1]}. {line.slice(numberedMatch[0].length)}
      </Text>
    )
  }

  // Inline formatting: bold, italic, code
  return <FormattedText text={line} theme={theme} />
}

function FormattedText({ text, theme }: { text: string; theme: Theme }) {
  // Split by inline code backticks
  const parts = text.split(/(`[^`]+`)/)

  return (
    <Text>
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <Text key={i} color={theme.accent}>
              {part.slice(1, -1)}
            </Text>
          )
        }
        // Bold
        const boldParts = part.split(/(\*\*[^*]+\*\*)/)
        return boldParts.map((bp, j) => {
          if (bp.startsWith('**') && bp.endsWith('**')) {
            return (
              <Text key={`${i}-${j}`} bold>
                {bp.slice(2, -2)}
              </Text>
            )
          }
          return <Text key={`${i}-${j}`}>{bp}</Text>
        })
      })}
    </Text>
  )
}
