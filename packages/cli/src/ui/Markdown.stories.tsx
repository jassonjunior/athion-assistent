/**
 * Markdown Stories
 * Representação visual HTML do componente Ink Markdown para preview no Storybook.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CLIDecorator } from '@athion/storybook/decorators'

function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split('\n')

  return (
    <div>
      {lines.map((line, i) => {
        if (line.startsWith('### ')) {
          return (
            <div key={i} style={{ color: '#bb9af7', fontWeight: 'bold' }}>
              {line.slice(4)}
            </div>
          )
        }
        if (line.startsWith('## ')) {
          return (
            <div key={i} style={{ color: '#7aa2f7', fontWeight: 'bold' }}>
              {line.slice(3)}
            </div>
          )
        }
        if (line.startsWith('# ')) {
          return (
            <div key={i} style={{ color: '#e0af68', fontWeight: 'bold', fontSize: 15 }}>
              {line.slice(2)}
            </div>
          )
        }
        if (line.match(/^[-*] /)) {
          return (
            <div key={i}>
              <span style={{ color: '#9ece6a' }}> • </span>
              {line.slice(2)}
            </div>
          )
        }
        if (line.match(/^\d+\. /)) {
          return (
            <div key={i}>
              <span style={{ color: '#7aa2f7' }}> {(line.match(/^\d+/) ?? [''])[0]}. </span>
              {line.replace(/^\d+\. /, '')}
            </div>
          )
        }
        if (line.startsWith('```')) {
          return (
            <div key={i} style={{ color: '#565f89' }}>
              {line}
            </div>
          )
        }
        return <div key={i}>{line || '\u00A0'}</div>
      })}
    </div>
  )
}

const meta = {
  title: 'CLI/Display/Markdown',
  component: MarkdownPreview,
  decorators: [CLIDecorator],
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof MarkdownPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Headers: Story = {
  args: {
    content: '# Título Principal\n\n## Subtítulo\n\n### Seção menor\n\nTexto normal aqui.',
  },
}

export const Lists: Story = {
  args: {
    content:
      '## Vantagens do TypeScript\n\n- Tipagem estática\n- Autocompletar\n- Refatoração segura\n\n## Passos\n\n1. Instalar TypeScript\n2. Configurar tsconfig\n3. Compilar o projeto',
  },
}

export const CodeBlock: Story = {
  args: {
    content:
      '## Exemplo\n\nAqui está um trecho de código:\n\n```typescript\nfunction hello(name: string) {\n  console.log(`Hello, ${name}!`)\n}\n```\n\nIsso define uma função simples.',
  },
}

export const MixedContent: Story = {
  args: {
    content:
      '# Análise do Código\n\n## Problemas encontrados\n\n- Variável não utilizada em `src/utils.ts`\n- Import circular entre módulos\n\n## Recomendações\n\n1. Remover imports não utilizados\n2. Extrair lógica para módulo compartilhado\n3. Adicionar testes unitários\n\n### Prioridade\n\nAlta — resolver antes do merge.',
  },
}
