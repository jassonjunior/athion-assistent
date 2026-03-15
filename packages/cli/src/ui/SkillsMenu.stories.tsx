/**
 * SkillsMenu Stories
 * Representação visual HTML do componente Ink SkillsMenu para preview no Storybook.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CLIDecorator } from '@athion/storybook/decorators'

function SkillsMenuPreview({
  skills,
  selectedIndex,
  activeSkillName,
}: {
  skills: { name: string; description: string }[]
  selectedIndex: number
  activeSkillName?: string
}) {
  return (
    <div style={{ border: '1px solid #565f89', borderRadius: 4, padding: 12 }}>
      <div style={{ color: '#7aa2f7', fontWeight: 'bold', marginBottom: 8 }}>● Skills</div>
      {skills.map((skill, i) => (
        <div
          key={skill.name}
          style={{
            padding: '4px 8px',
            backgroundColor: i === selectedIndex ? '#24283b' : 'transparent',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>
            {i === selectedIndex && <span style={{ color: '#7aa2f7' }}>→ </span>}
            <span style={{ color: skill.name === activeSkillName ? '#9ece6a' : '#c0caf5' }}>
              {skill.name}
            </span>
          </span>
          <span style={{ color: '#565f89', fontSize: 12 }}>{skill.description}</span>
        </div>
      ))}
      <div style={{ marginTop: 8, color: '#565f89', fontSize: 11 }}>
        ↑↓ navegar · Enter selecionar · Esc fechar
      </div>
    </div>
  )
}

const meta = {
  title: 'CLI/Interactive/SkillsMenu',
  component: SkillsMenuPreview,
  decorators: [CLIDecorator],
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SkillsMenuPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    selectedIndex: 0,
    skills: [
      { name: 'commit', description: 'Cria commits git formatados' },
      { name: 'review-code', description: 'Revisão de código detalhada' },
      { name: 'solution-architect', description: 'Design de soluções' },
      { name: 'codebase-analysis', description: 'Análise de codebase' },
    ],
  },
}

export const WithActiveSkill: Story = {
  args: {
    selectedIndex: 1,
    activeSkillName: 'commit',
    skills: [
      { name: 'commit', description: 'Cria commits git formatados' },
      { name: 'review-code', description: 'Revisão de código detalhada' },
      { name: 'solution-architect', description: 'Design de soluções' },
    ],
  },
}

export const SingleSkill: Story = {
  args: {
    selectedIndex: 0,
    skills: [{ name: 'commit', description: 'Cria commits git formatados' }],
  },
}
