/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from 'vitest'
import { toolSanitizer, toolSanitizerStream } from './tool-sanitizer'
import type { OpenAIChatResponse, OpenAIStreamChunk } from '../types'

// ── helpers ──────────────────────────────────────────────────────────────────

function makeResponse(toolCalls: Array<{ name: string; arguments: string }>): OpenAIChatResponse {
  return {
    id: 'test',
    object: 'chat.completion',
    created: 0,
    model: 'test',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: toolCalls.map((tc, i) => ({
            id: `tc-${i}`,
            type: 'function' as const,
            function: tc,
          })),
        },
        finish_reason: 'tool_calls',
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}

// ── toolSanitizer (non-streaming) ────────────────────────────────────────────

describe('toolSanitizer', () => {
  it('converte content objeto para JSON string em write_file', () => {
    const response = makeResponse([
      {
        name: 'write_file',
        arguments: JSON.stringify({ content: { key: 'value' }, path: '/foo' }),
      },
    ])
    const result = toolSanitizer(response)
    const args = JSON.parse(result.choices[0]!.message.tool_calls![0]!.function.arguments)
    expect(typeof args.content).toBe('string')
    expect(args.content).toBe('{"key":"value"}')
  })

  it('nao altera write_file quando content ja e string', () => {
    const response = makeResponse([
      {
        name: 'write_file',
        arguments: JSON.stringify({ content: 'hello', path: '/foo' }),
      },
    ])
    const result = toolSanitizer(response)
    const args = JSON.parse(result.choices[0]!.message.tool_calls![0]!.function.arguments)
    expect(args.content).toBe('hello')
  })

  it('converte echo com heredoc em exec_command', () => {
    const response = makeResponse([
      {
        name: 'exec_command',
        arguments: JSON.stringify({ command: "echo 'line1\\nline2' > /tmp/test.txt" }),
      },
    ])
    const result = toolSanitizer(response)
    const args = JSON.parse(result.choices[0]!.message.tool_calls![0]!.function.arguments)
    expect(args.command).toContain('cat <<')
    expect(args.command).toContain('EOF')
  })

  it('nao altera exec_command sem echo multiline', () => {
    const response = makeResponse([
      {
        name: 'exec_command',
        arguments: JSON.stringify({ command: 'ls -la' }),
      },
    ])
    const result = toolSanitizer(response)
    const args = JSON.parse(result.choices[0]!.message.tool_calls![0]!.function.arguments)
    expect(args.command).toBe('ls -la')
  })

  it('remove parametros nulos de Read', () => {
    const response = makeResponse([
      {
        name: 'Read',
        arguments: JSON.stringify({ file_path: '/foo', offset: null, limit: undefined }),
      },
    ])
    const result = toolSanitizer(response)
    const args = JSON.parse(result.choices[0]!.message.tool_calls![0]!.function.arguments)
    expect(args).toEqual({ file_path: '/foo' })
    expect('offset' in args).toBe(false)
  })

  it('nao altera tool calls sem regra de sanitizacao', () => {
    const response = makeResponse([
      {
        name: 'unknown_tool',
        arguments: JSON.stringify({ foo: 'bar' }),
      },
    ])
    const result = toolSanitizer(response)
    const args = JSON.parse(result.choices[0]!.message.tool_calls![0]!.function.arguments)
    expect(args).toEqual({ foo: 'bar' })
  })

  it('preserva resposta sem tool calls', () => {
    const response: OpenAIChatResponse = {
      id: 'test',
      object: 'chat.completion',
      created: 0,
      model: 'test',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }
    const result = toolSanitizer(response)
    expect(result.choices[0]!.message.content).toBe('Hello')
  })

  it('trata JSON invalido nos arguments graciosamente', () => {
    const response = makeResponse([{ name: 'write_file', arguments: 'not json' }])
    const result = toolSanitizer(response)
    expect(result.choices[0]!.message.tool_calls![0]!.function.arguments).toBe('not json')
  })

  it('aplica sanitize_rules a shell tambem', () => {
    const response = makeResponse([
      {
        name: 'shell',
        arguments: JSON.stringify({ command: "echo 'a\\nb' > /tmp/x.txt" }),
      },
    ])
    const result = toolSanitizer(response)
    const args = JSON.parse(result.choices[0]!.message.tool_calls![0]!.function.arguments)
    expect(args.command).toContain('cat <<')
  })
})

// ── toolSanitizerStream ──────────────────────────────────────────────────────

describe('toolSanitizerStream', () => {
  it('retorna chunk inalterado sem tool_calls no delta', () => {
    const chunk: OpenAIStreamChunk = {
      id: 'test',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test',
      choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: null }],
    }
    const result = toolSanitizerStream(chunk)
    expect(result).toBe(chunk)
  })

  it('sanitiza tool calls no delta', () => {
    const chunk: OpenAIStreamChunk = {
      id: 'test',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test',
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                function: {
                  name: 'write_file',
                  arguments: JSON.stringify({ content: { nested: true }, path: '/x' }),
                },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    }
    const result = toolSanitizerStream(chunk)
    const args = JSON.parse(result.choices[0]!.delta.tool_calls![0]!.function!.arguments!)
    expect(typeof args.content).toBe('string')
  })

  it('nao altera tool calls sem name', () => {
    const chunk: OpenAIStreamChunk = {
      id: 'test',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test',
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '{"partial": true}' } }],
          },
          finish_reason: null,
        },
      ],
    }
    const result = toolSanitizerStream(chunk)
    expect(result.choices[0]!.delta.tool_calls![0]!.function!.arguments).toBe('{"partial": true}')
  })
})
