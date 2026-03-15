/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from 'vitest'
import {
  isDestructiveCommand,
  extractCommands,
  safetyGuardPreCheck,
  safetyGuard,
} from './safety-guard'
import type { OpenAIChatRequest, OpenAIChatResponse } from '../types'

// ── isDestructiveCommand ─────────────────────────────────────────────────────

describe('isDestructiveCommand', () => {
  it('detecta rm -rf', () => {
    expect(isDestructiveCommand('rm -rf /')).toBe(true)
  })

  it('detecta rm -r', () => {
    expect(isDestructiveCommand('rm -r /tmp')).toBe(true)
  })

  it('detecta git reset --hard', () => {
    expect(isDestructiveCommand('git reset --hard HEAD~1')).toBe(true)
  })

  it('detecta git clean -f', () => {
    expect(isDestructiveCommand('git clean -f')).toBe(true)
  })

  it('detecta git push --force', () => {
    expect(isDestructiveCommand('git push --force origin main')).toBe(true)
  })

  it('detecta git push -f', () => {
    expect(isDestructiveCommand('git push -f origin main')).toBe(true)
  })

  it('detecta chmod -R 777', () => {
    expect(isDestructiveCommand('chmod -R 777 /var')).toBe(true)
  })

  it('detecta mkfs', () => {
    expect(isDestructiveCommand('mkfs.ext4 /dev/sda1')).toBe(true)
  })

  it('detecta dd of=/dev/', () => {
    expect(isDestructiveCommand('dd if=/dev/zero of=/dev/sda')).toBe(true)
  })

  it('nao bloqueia comandos seguros', () => {
    expect(isDestructiveCommand('ls -la')).toBe(false)
    expect(isDestructiveCommand('git status')).toBe(false)
    expect(isDestructiveCommand('cat /tmp/foo')).toBe(false)
    expect(isDestructiveCommand('git push origin main')).toBe(false)
  })
})

// ── extractCommands ──────────────────────────────────────────────────────────

describe('extractCommands', () => {
  it('extrai campo command', () => {
    const cmds = extractCommands('{"command": "ls -la"}')
    expect(cmds).toEqual(['ls -la'])
  })

  it('extrai campo cmd', () => {
    const cmds = extractCommands('{"cmd": "echo hello"}')
    expect(cmds).toEqual(['echo hello'])
  })

  it('extrai campo script', () => {
    const cmds = extractCommands('{"script": "npm install"}')
    expect(cmds).toEqual(['npm install'])
  })

  it('extrai campo content', () => {
    const cmds = extractCommands('{"content": "some text"}')
    expect(cmds).toEqual(['some text'])
  })

  it('extrai multiplos campos', () => {
    const cmds = extractCommands('{"command": "ls", "script": "npm run build"}')
    expect(cmds).toEqual(['ls', 'npm run build'])
  })

  it('retorna array vazio para JSON invalido', () => {
    expect(extractCommands('not json')).toEqual([])
  })

  it('retorna array vazio para valores nao-string', () => {
    expect(extractCommands('{"command": 42}')).toEqual([])
  })

  it('retorna array vazio para null', () => {
    expect(extractCommands('null')).toEqual([])
  })
})

// ── safetyGuardPreCheck ──────────────────────────────────────────────────────

describe('safetyGuardPreCheck', () => {
  it('permite requests normais', () => {
    const body: OpenAIChatRequest = {
      model: 'test',
      messages: [{ role: 'user', content: 'Hello' }],
    }
    const result = safetyGuardPreCheck(body)
    expect(result.blocked).toBe(false)
  })

  it('detecta loop de tool calls consecutivas (5x)', () => {
    const messages: OpenAIChatRequest['messages'] = []
    for (let i = 0; i < 5; i++) {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: `tc-${i}`,
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":"/same/file"}' },
          },
        ],
      })
      messages.push({
        role: 'tool',
        content: 'result',
        tool_call_id: `tc-${i}`,
      })
    }

    const body: OpenAIChatRequest = { model: 'test', messages }
    const result = safetyGuardPreCheck(body)
    expect(result.blocked).toBe(true)
    if (result.blocked) {
      expect(result.response.choices[0]!.message.content).toContain('Loop detected')
    }
  })

  it('nao detecta loop quando tool calls sao para alvos diferentes', () => {
    const messages: OpenAIChatRequest['messages'] = []
    for (let i = 0; i < 5; i++) {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: `tc-${i}`,
            type: 'function',
            function: { name: 'read_file', arguments: `{"path":"/file${i}"}` },
          },
        ],
      })
    }

    const body: OpenAIChatRequest = { model: 'test', messages }
    const result = safetyGuardPreCheck(body)
    expect(result.blocked).toBe(false)
  })

  it('bloqueia quando excede limite de turns (25)', () => {
    const messages: OpenAIChatRequest['messages'] = []
    for (let i = 0; i < 26; i++) {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: `tc-${i}`,
            type: 'function',
            function: { name: `tool_${i}`, arguments: `{"path":"/file${i}"}` },
          },
        ],
      })
    }

    const body: OpenAIChatRequest = { model: 'test', messages }
    const result = safetyGuardPreCheck(body)
    expect(result.blocked).toBe(true)
    if (result.blocked) {
      expect(result.response.choices[0]!.message.content).toContain('Turn limit reached')
    }
  })
})

// ── safetyGuard (post-check) ─────────────────────────────────────────────────

describe('safetyGuard', () => {
  function makeResponse(
    toolCalls?: Array<{ name: string; arguments: string }>,
  ): OpenAIChatResponse {
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
            content: 'hello',
            ...(toolCalls
              ? {
                  tool_calls: toolCalls.map((tc, i) => ({
                    id: `tc-${i}`,
                    type: 'function' as const,
                    function: tc,
                  })),
                }
              : {}),
          },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }
  }

  it('permite respostas sem tool calls', () => {
    const result = safetyGuard(makeResponse())
    expect(result.blocked).toBe(false)
  })

  it('permite tool calls seguras', () => {
    const result = safetyGuard(
      makeResponse([{ name: 'exec_command', arguments: '{"command":"ls -la"}' }]),
    )
    expect(result.blocked).toBe(false)
  })

  it('bloqueia rm -rf', () => {
    const result = safetyGuard(
      makeResponse([{ name: 'exec_command', arguments: '{"command":"rm -rf /"}' }]),
    )
    expect(result.blocked).toBe(true)
  })

  it('bloqueia git push --force', () => {
    const result = safetyGuard(
      makeResponse([{ name: 'shell', arguments: '{"command":"git push --force origin main"}' }]),
    )
    expect(result.blocked).toBe(true)
  })

  it('inclui motivo do bloqueio na resposta', () => {
    const result = safetyGuard(
      makeResponse([{ name: 'exec_command', arguments: '{"command":"rm -rf /tmp"}' }]),
    )
    expect(result.blocked).toBe(true)
    if (result.blocked) {
      expect(result.response.choices[0]!.message.content).toContain('Destructive command blocked')
    }
  })
})
