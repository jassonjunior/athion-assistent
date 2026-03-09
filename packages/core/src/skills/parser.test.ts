import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { parseSkillFile } from './parser'

const TEST_DIR = join(tmpdir(), 'athion-skill-tests')

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true })
})

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
})

async function writeSkill(filename: string, content: string): Promise<string> {
  const filePath = join(TEST_DIR, filename)
  await writeFile(filePath, content, 'utf-8')
  return filePath
}

describe('parseSkillFile', () => {
  it('extrai nome do heading #', async () => {
    const path = await writeSkill('titulo.md', '# Minha Skill\n\nDescrição aqui.\n')
    const skill = await parseSkillFile(path)
    expect(skill.name).toBe('minha-skill')
  })

  it('normaliza nome para kebab-case', async () => {
    const path = await writeSkill('spaces.md', '# Com Espaços E Maiusculas\n\nDesc.\n')
    const skill = await parseSkillFile(path)
    expect(skill.name).toBe('com-espaços-e-maiusculas')
  })

  it('usa nome do arquivo quando não há heading', async () => {
    const path = await writeSkill('sem-titulo.md', 'Conteúdo sem heading.\n')
    const skill = await parseSkillFile(path)
    expect(skill.name).toBe('sem-titulo')
  })

  it('extrai descrição da primeira linha após o título', async () => {
    const content = '# Minha Skill\n\nEsta é a descrição.\n\n## Instructions\nFaz algo.\n'
    const path = await writeSkill('desc.md', content)
    const skill = await parseSkillFile(path)
    expect(skill.description).toBe('Esta é a descrição.')
  })

  it('extrai triggers da seção ## Triggers', async () => {
    const content = [
      '# Commit Helper',
      '',
      'Cria commits.',
      '',
      '## Triggers',
      '- commit',
      '- git commit',
      '- salvar mudancas',
      '',
      '## Instructions',
      'Ajuda a criar commits.',
    ].join('\n')
    const path = await writeSkill('triggers.md', content)
    const skill = await parseSkillFile(path)
    expect(skill.triggers).toEqual(['commit', 'git commit', 'salvar mudancas'])
  })

  it('retorna triggers vazio quando seção ausente', async () => {
    const path = await writeSkill('no-triggers.md', '# Skill\n\nSem triggers.\n')
    const skill = await parseSkillFile(path)
    expect(skill.triggers).toEqual([])
  })

  it('extrai instructions da seção ## Instructions', async () => {
    const content = [
      '# Skill',
      '',
      'Desc.',
      '',
      '## Instructions',
      'Faça isso e aquilo.',
      'Mais detalhes aqui.',
    ].join('\n')
    const path = await writeSkill('instructions.md', content)
    const skill = await parseSkillFile(path)
    expect(skill.instructions).toContain('Faça isso e aquilo.')
  })

  it('usa conteúdo completo quando seção Instructions ausente', async () => {
    const fullContent = '# Skill\n\nDesc.\n\nConteúdo completo aqui.\n'
    const path = await writeSkill('full-fallback.md', fullContent)
    const skill = await parseSkillFile(path)
    expect(skill.instructions).toBe(fullContent)
  })

  it('inclui sourcePath correto', async () => {
    const path = await writeSkill('source-check.md', '# Test\n\nDesc.\n')
    const skill = await parseSkillFile(path)
    expect(skill.sourcePath).toBe(path)
  })

  it('parseia skill com múltiplas seções corretamente', async () => {
    const content = [
      '# Review Code',
      '',
      'Revisa código com foco em qualidade.',
      '',
      '## Triggers',
      '- revisar',
      '- review',
      '',
      '## Instructions',
      'Analise o código fornecido.',
      'Identifique problemas de qualidade.',
      '',
      '## Examples',
      'Exemplo de uso.',
    ].join('\n')
    const path = await writeSkill('full-skill.md', content)
    const skill = await parseSkillFile(path)
    expect(skill.name).toBe('review-code')
    expect(skill.description).toBe('Revisa código com foco em qualidade.')
    expect(skill.triggers).toEqual(['revisar', 'review'])
    expect(skill.instructions).toContain('Analise o código fornecido.')
    expect(skill.instructions).not.toContain('## Examples')
  })
})
