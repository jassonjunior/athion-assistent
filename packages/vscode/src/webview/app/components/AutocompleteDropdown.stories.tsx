import type { Meta, StoryObj } from '@storybook/react-vite'
import { VSCodeDecorator } from '@athion/storybook/decorators'
import { AutocompleteDropdown } from './AutocompleteDropdown'
import { fn } from 'storybook/test'

const meta = {
  title: 'VSCode/Autocomplete/AutocompleteDropdown',
  component: AutocompleteDropdown,
  decorators: [VSCodeDecorator],
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    onSelect: fn(),
  },
} satisfies Meta<typeof AutocompleteDropdown>

export default meta
type Story = StoryObj<typeof meta>

export const CommandMode: Story = {
  args: {
    mode: 'command',
    selectedIndex: 0,
    items: [
      { label: '/clear', description: 'Limpa o histórico do chat', insertValue: '/clear' },
      { label: '/help', description: 'Mostra ajuda', insertValue: '/help' },
      {
        label: '/skills',
        description: 'Lista skills instaladas',
        insertValue: '/skills',
        badge: '→',
      },
      { label: '/model', description: 'Altera o modelo', insertValue: '/model ' },
      {
        label: '/codebase',
        description: 'Busca no codebase indexado',
        insertValue: '/codebase-search ',
      },
    ],
  },
}

export const SkillsBrowser: Story = {
  args: {
    mode: 'skills-browser',
    selectedIndex: 1,
    items: [
      {
        label: 'commit',
        description: 'Cria commits git formatados',
        insertValue: '/use-skill commit',
        badge: 'ativar',
      },
      {
        label: 'review-code',
        description: 'Revisão de código detalhada',
        insertValue: '/use-skill review-code',
        badge: 'ativar',
      },
      {
        label: 'solution-architect',
        description: 'Design de soluções',
        insertValue: '/use-skill solution-architect',
        badge: 'ativar',
      },
    ],
  },
}

export const SkillsBrowserLoading: Story = {
  args: {
    mode: 'skills-browser',
    selectedIndex: 0,
    items: [],
  },
}

export const FileMode: Story = {
  args: {
    mode: 'file',
    selectedIndex: 0,
    items: [
      { label: 'src/index.ts', description: 'Entry point', insertValue: '@src/index.ts' },
      { label: 'src/server.ts', description: 'HTTP server', insertValue: '@src/server.ts' },
      { label: 'package.json', description: 'Package manifest', insertValue: '@package.json' },
    ],
  },
}

export const SingleItem: Story = {
  args: {
    mode: 'command',
    selectedIndex: 0,
    items: [{ label: '/clear', description: 'Limpa o histórico do chat', insertValue: '/clear' }],
  },
}
