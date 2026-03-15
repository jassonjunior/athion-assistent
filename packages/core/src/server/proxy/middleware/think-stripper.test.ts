/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from 'vitest'
import {
  stripThinkTags,
  thinkStripper,
  createThinkStripperState,
  processThinkContent,
  thinkStripperStream,
  isThinkStrippedEmpty,
} from './think-stripper'
import type { OpenAIChatResponse, OpenAIStreamChunk } from '../types'

// ── helpers ──────────────────────────────────────────────────────────────────

function makeResponse(content: string): OpenAIChatResponse {
  return {
    id: 'test',
    object: 'chat.completion',
    created: 0,
    model: 'test',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}

function makeChunk(content: string): OpenAIStreamChunk {
  return {
    id: 'test-id',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'test',
    choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }],
  }
}

// ── stripThinkTags ───────────────────────────────────────────────────────────

describe('stripThinkTags', () => {
  it('remove bloco think simples', () => {
    expect(stripThinkTags('<think>pensando...</think>Hello')).toBe('Hello')
  })

  it('remove multiplos blocos think', () => {
    const text = '<think>first</think>A<think>second</think>B'
    expect(stripThinkTags(text)).toBe('AB')
  })

  it('remove blocos think com newlines', () => {
    const text = '<think>\nline1\nline2\n</think>Result'
    expect(stripThinkTags(text)).toBe('Result')
  })

  it('retorna string vazia quando so tem think', () => {
    expect(stripThinkTags('<think>only think</think>')).toBe('')
  })

  it('nao altera texto sem think tags', () => {
    expect(stripThinkTags('Hello World')).toBe('Hello World')
  })

  it('faz trim do resultado', () => {
    expect(stripThinkTags('  <think>x</think>  Hello  ')).toBe('Hello')
  })
})

// ── thinkStripper (non-streaming) ────────────────────────────────────────────

describe('thinkStripper', () => {
  it('remove think tags do content da resposta', () => {
    const response = makeResponse('<think>internal</think>Visible text')
    const result = thinkStripper(response)
    expect(result.choices[0]!.message.content).toBe('Visible text')
  })

  it('preserva resposta sem content', () => {
    const response: OpenAIChatResponse = {
      id: 'test',
      object: 'chat.completion',
      created: 0,
      model: 'test',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: null },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }
    const result = thinkStripper(response)
    expect(result.choices[0]!.message.content).toBeNull()
  })

  it('nao modifica outros campos', () => {
    const response = makeResponse('<think>x</think>Hello')
    const result = thinkStripper(response)
    expect(result.id).toBe('test')
    expect(result.model).toBe('test')
    expect(result.usage).toEqual({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 })
  })
})

// ── processThinkContent (streaming stateful) ─────────────────────────────────

describe('processThinkContent', () => {
  it('emite texto normal sem think tags', () => {
    const state = createThinkStripperState()
    expect(processThinkContent('Hello', state)).toBe('Hello')
  })

  it('suprime conteudo dentro de think tags', () => {
    const state = createThinkStripperState()
    expect(processThinkContent('<think>hidden</think>visible', state)).toBe('visible')
  })

  it('acumula estado entre chamadas', () => {
    const state = createThinkStripperState()
    // Inicia think tag
    expect(processThinkContent('<think>start of', state)).toBe('')
    expect(state.insideThink).toBe(true)
    // Continua dentro da tag
    expect(processThinkContent(' thinking', state)).toBe('')
    // Fecha a tag
    expect(processThinkContent('</think>Now visible', state)).toBe('Now visible')
    expect(state.insideThink).toBe(false)
  })

  it('trata tag parcial no final do texto', () => {
    const state = createThinkStripperState()
    // "<thi" poderia ser inicio de "<think>"
    const result = processThinkContent('Hello<thi', state)
    // Deve emitir "Hello" e manter "<thi" no buffer
    expect(result).toBe('Hello')
    expect(state.buffer).toBe('<thi')
  })

  it('emite texto antes de think tag e suprime o conteudo', () => {
    const state = createThinkStripperState()
    const result = processThinkContent('Before<think>hidden</think>After', state)
    expect(result).toBe('BeforeAfter')
  })
})

// ── thinkStripperStream ──────────────────────────────────────────────────────

describe('thinkStripperStream', () => {
  it('processa chunk com content', () => {
    const state = createThinkStripperState()
    const chunk = makeChunk('<think>x</think>Hello')
    const result = thinkStripperStream(chunk, state)
    expect(result.choices[0]!.delta.content).toBe('Hello')
  })

  it('retorna chunk inalterado se nao tem content', () => {
    const state = createThinkStripperState()
    const chunk: OpenAIStreamChunk = {
      id: 'test',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test',
      choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
    }
    const result = thinkStripperStream(chunk, state)
    expect(result).toBe(chunk)
  })
})

// ── isThinkStrippedEmpty ─────────────────────────────────────────────────────

describe('isThinkStrippedEmpty', () => {
  it('retorna true quando content ficou vazio e nao ha tool_calls nem finish_reason', () => {
    const chunk = makeChunk('')
    expect(isThinkStrippedEmpty(chunk)).toBe(true)
  })

  it('retorna false quando tem content', () => {
    const chunk = makeChunk('Hello')
    expect(isThinkStrippedEmpty(chunk)).toBe(false)
  })

  it('retorna false quando tem finish_reason', () => {
    const chunk: OpenAIStreamChunk = {
      id: 'test',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test',
      choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }],
    }
    expect(isThinkStrippedEmpty(chunk)).toBe(false)
  })

  it('retorna false quando tem tool_calls', () => {
    const chunk: OpenAIStreamChunk = {
      id: 'test',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test',
      choices: [
        {
          index: 0,
          delta: {
            content: '',
            tool_calls: [{ index: 0, function: { name: 'test', arguments: '' } }],
          },
          finish_reason: null,
        },
      ],
    }
    expect(isThinkStrippedEmpty(chunk)).toBe(false)
  })
})
