/**
 * common-args
 * Descrição: Dados mock reutilizáveis para stories — mensagens, tool calls, skills.
 */

import type { ChatMessage, ToolCallInfo } from '@athion/shared'

export const mockMessages: ChatMessage[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Como funciona o sistema de indexação?',
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content:
      'O sistema usa **FTS5** para busca textual e embeddings vetoriais para busca semântica.\n\n```typescript\nconst results = await indexer.search("vector search", { limit: 10 })\n```\n\nOs resultados são ranqueados por score de similaridade.',
  },
  {
    id: 'msg-3',
    role: 'user',
    content: 'Pode mostrar um exemplo com tool call?',
  },
  {
    id: 'msg-4',
    role: 'assistant',
    content: 'Claro! Vou buscar no codebase...',
    toolCalls: [
      {
        id: 'tc-1',
        name: 'search_codebase',
        args: { query: 'indexing manager' },
        status: 'success',
        result: '3 resultados encontrados',
      },
    ],
  },
]

export const mockToolCallRunning: ToolCallInfo = {
  id: 'tc-running',
  name: 'search_codebase',
  args: { query: 'vector search' },
  status: 'running',
}

export const mockToolCallSuccess: ToolCallInfo = {
  id: 'tc-success',
  name: 'read_file',
  args: { path: 'src/indexing/manager.ts' },
  status: 'success',
  result: 'File read: 245 lines',
}

export const mockToolCallError: ToolCallInfo = {
  id: 'tc-error',
  name: 'execute_command',
  args: { command: 'npm test' },
  status: 'error',
  result: 'Permission denied',
}

export const mockSkills = [
  { name: 'commit', description: 'Cria commits git formatados' },
  { name: 'review-code', description: 'Revisão de código detalhada' },
  { name: 'solution-architect', description: 'Design de soluções de alto nível' },
]
