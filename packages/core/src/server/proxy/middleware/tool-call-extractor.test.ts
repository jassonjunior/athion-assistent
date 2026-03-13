import { describe, expect, it } from 'vitest'
import {
  createToolCallExtractorState,
  processContent,
  applyToChunk,
  buildToolCallsChunk,
} from './tool-call-extractor'
import type { ToolCallExtractorState } from './tool-call-extractor'
import type { OpenAIStreamChunk } from '../types'

// ── helpers ──────────────────────────────────────────────────────────────────

function makeChunk(content: string): OpenAIStreamChunk {
  return {
    id: 'test-id',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'test',
    choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }],
  }
}

// ── processContent: formato XML <tool_call> ───────────────────────────────────

describe('processContent — formato XML <tool_call>', () => {
  it('suprime o bloco e extrai a call em JSON', () => {
    const state = createToolCallExtractorState()
    const text = '<tool_call>{"name":"read_file","arguments":{"path":"/foo"}}</tool_call>'
    const result = processContent(text, state)

    expect(result).toBeNull()
    expect(state.extractedCalls).toHaveLength(1)
    expect(state.extractedCalls[0]?.name).toBe('read_file')
    expect(state.extractedCalls[0]?.arguments).toEqual({ path: '/foo' })
    expect(state.hasToolCalls).toBe(true)
  })

  it('emite texto antes da tag e suprime a call', () => {
    const state = createToolCallExtractorState()
    const text =
      'Texto normal<tool_call>{"name":"list_files","arguments":{"path":"/bar"}}</tool_call>'
    const result = processContent(text, state)

    expect(result).toBe('Texto normal')
    expect(state.extractedCalls[0]?.name).toBe('list_files')
  })
})

// ── processContent: formato Bracket [Calling tool: name(args)] ───────────────

describe('processContent — formato Bracket [Calling tool: name(args)]', () => {
  it('suprime o bloco completo e extrai a call', () => {
    const state = createToolCallExtractorState()
    const text = '[Calling tool: read_file({"path":"/some/file.ts"})]'
    const result = processContent(text, state)

    expect(result).toBeNull()
    expect(state.hasToolCalls).toBe(true)
    expect(state.extractedCalls).toHaveLength(1)
    expect(state.extractedCalls[0]?.name).toBe('read_file')
    expect(state.extractedCalls[0]?.arguments).toEqual({ path: '/some/file.ts' })
  })

  it('extrai tool call com args complexos (array no JSON)', () => {
    const state = createToolCallExtractorState()
    const text =
      '[Calling tool: task({"agent":"search","steps":[{"desc":"foo","completed":false}]})]'
    const result = processContent(text, state)

    expect(result).toBeNull()
    expect(state.extractedCalls[0]?.name).toBe('task')
    expect((state.extractedCalls[0]?.arguments as { agent: string }).agent).toBe('search')
  })

  it('emite texto antes da bracket call e suprime a call', () => {
    const state = createToolCallExtractorState()
    const text = 'Vou buscar agora.\n[Calling tool: list_files({"path":"/src"})]'
    const result = processContent(text, state)

    expect(result).toContain('Vou buscar agora.')
    expect(result).not.toContain('[Calling tool:')
    expect(state.extractedCalls[0]?.name).toBe('list_files')
  })

  it('extrai múltiplas bracket calls em sequência', () => {
    const state = createToolCallExtractorState()

    processContent('[Calling tool: read_file({"path":"/a.ts"})]', state)
    processContent('[Calling tool: read_file({"path":"/b.ts"})]', state)

    expect(state.extractedCalls).toHaveLength(2)
    expect(state.extractedCalls[0]?.arguments).toEqual({ path: '/a.ts' })
    expect(state.extractedCalls[1]?.arguments).toEqual({ path: '/b.ts' })
  })

  it('handles streaming em chunks separados', () => {
    const state = createToolCallExtractorState()

    // Chega em 3 chunks
    const r1 = processContent('[Calling tool: ', state)
    const r2 = processContent('read_file({"path":"/foo"}', state)
    const r3 = processContent(')]', state)

    expect(r1).toBeNull()
    expect(r2).toBeNull()
    expect(r3).toBeNull()
    expect(state.extractedCalls).toHaveLength(1)
    expect(state.extractedCalls[0]?.name).toBe('read_file')
  })

  it('detecta partial [Calling tool: e bufferiza no pending', () => {
    const state = createToolCallExtractorState()

    // Texto termina com prefixo parcial de BRACKET_START
    const result = processContent('Olá mundo[Calling', state)

    // Deve emitir "Olá mundo" e guardar "[Calling" no pending
    expect(result).toBe('Olá mundo')
    expect(state.pending).toBe('[Calling')
  })
})

// ── applyToChunk ─────────────────────────────────────────────────────────────

describe('applyToChunk — bracket format', () => {
  it('suprime chunk com bracket call e popula extractedCalls', () => {
    const state = createToolCallExtractorState()
    const chunk = makeChunk('[Calling tool: read_file({"path":"/test.ts"})]')
    const result = applyToChunk(chunk, state)

    // Chunk deve ser suprimido (null) ou ter content null
    const emitted = result === null || result.choices[0]?.delta?.content === null
    expect(emitted).toBe(true)
    expect(state.extractedCalls).toHaveLength(1)
  })
})

// ── buildToolCallsChunk ───────────────────────────────────────────────────────

describe('buildToolCallsChunk', () => {
  it('constrói chunk OpenAI com tool_calls corretas', () => {
    const state: ToolCallExtractorState = {
      insideToolCall: false,
      insideBracketCall: false,
      buffer: '',
      pending: '',
      hasToolCalls: true,
      extractedCalls: [{ id: 'call_abc123', name: 'read_file', arguments: { path: '/foo.ts' } }],
    }

    const chunk = buildToolCallsChunk(state, 'chatcmpl-test', 'test-model')

    expect(chunk.choices[0]?.finish_reason).toBe('tool_calls')
    expect(chunk.choices[0]?.delta?.tool_calls).toHaveLength(1)
    expect(chunk.choices[0]?.delta?.tool_calls?.[0]?.function?.name).toBe('read_file')
    expect(chunk.choices[0]?.delta?.tool_calls?.[0]?.function?.arguments).toBe(
      JSON.stringify({ path: '/foo.ts' }),
    )
  })
})
