/**
 * MockBridge
 * Descrição: Implementação mock da interface UIBridge para uso no Storybook.
 * Simula respostas do sidecar para permitir preview de componentes.
 */

export interface UIBridge {
  sendMessage(content: string): Promise<void>
  abortGeneration(): Promise<void>
  onEvent(handler: (event: { type: string; [key: string]: unknown }) => void): () => void
  getSkills(): Promise<SkillInfo[]>
  getFiles(query: string): Promise<FileInfo[]>
}

export interface SkillInfo {
  name: string
  description: string
}

export interface FileInfo {
  path: string
  name: string
}

export class MockBridge implements UIBridge {
  async sendMessage(_content: string): Promise<void> {
    // Mock: no-op — Storybook preview only
  }

  async abortGeneration(): Promise<void> {
    // Mock: no-op — Storybook preview only
  }

  onEvent(handler: (event: { type: string; [key: string]: unknown }) => void): () => void {
    const timer = setTimeout(() => {
      handler({ type: 'content', content: 'Mock response from Athion assistant...' })
      setTimeout(() => handler({ type: 'finish' }), 1000)
    }, 500)
    return () => clearTimeout(timer)
  }

  async getSkills(): Promise<SkillInfo[]> {
    return [
      { name: 'commit', description: 'Cria commits git formatados' },
      { name: 'review-code', description: 'Revisão de código detalhada' },
      { name: 'solution-architect', description: 'Design de soluções de alto nível' },
    ]
  }

  async getFiles(query: string): Promise<FileInfo[]> {
    return [
      { path: `src/${query}.ts`, name: `${query}.ts` },
      { path: `src/${query}.test.ts`, name: `${query}.test.ts` },
    ]
  }
}
