import { describe, expect, it } from 'vitest'
import {
  compressionSystemPrompt,
  compressionUserPrompt,
  formatMessageForCompression,
  buildCompressionInput,
} from './compression-prompt'

describe('compressionSystemPrompt', () => {
  it('inclui o preserveCount no prompt', () => {
    const prompt = compressionSystemPrompt(6)
    expect(prompt).toContain('last 6 messages')
  })

  it('varia com diferentes valores de preserveCount', () => {
    const prompt = compressionSystemPrompt(10)
    expect(prompt).toContain('last 10 messages')
  })

  it('contem regras de formatacao', () => {
    const prompt = compressionSystemPrompt(6)
    expect(prompt).toContain('Preserve ALL technical details')
    expect(prompt).toContain('output_format')
  })
})

describe('compressionUserPrompt', () => {
  it('inclui as mensagens no prompt', () => {
    const prompt = compressionUserPrompt('some conversation text')
    expect(prompt).toContain('some conversation text')
  })

  it('usa tag conversation', () => {
    const prompt = compressionUserPrompt('hello')
    expect(prompt).toContain('<conversation>')
    expect(prompt).toContain('</conversation>')
  })
})

describe('formatMessageForCompression', () => {
  it('formata mensagem basica com role e content', () => {
    const result = formatMessageForCompression('user', 'Hello world')
    expect(result).toBe('[user] Hello world')
  })

  it('formata mensagem sem content', () => {
    const result = formatMessageForCompression('assistant', null)
    expect(result).toBe('[assistant]')
  })

  it('trunca content longo a 500 chars', () => {
    const longContent = 'a'.repeat(600)
    const result = formatMessageForCompression('user', longContent)
    expect(result).toContain('... (truncated)')
    expect(result.length).toBeLessThan(600)
  })

  it('nao trunca content com 500 chars ou menos', () => {
    const content = 'a'.repeat(500)
    const result = formatMessageForCompression('user', content)
    expect(result).not.toContain('(truncated)')
  })

  it('inclui tool calls quando presentes', () => {
    const result = formatMessageForCompression('assistant', 'text', ['read_file', 'write_file'])
    expect(result).toContain('Tool calls: read_file, write_file')
  })

  it('nao inclui tool calls quando array vazio', () => {
    const result = formatMessageForCompression('assistant', 'text', [])
    expect(result).not.toContain('Tool calls')
  })
})

describe('buildCompressionInput', () => {
  it('combina multiplas mensagens com separador', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ]
    const result = buildCompressionInput(messages)
    expect(result).toContain('[user] Hello')
    expect(result).toContain('[assistant] Hi there')
    expect(result).toContain('\n\n')
  })

  it('retorna string vazia para array vazio', () => {
    const result = buildCompressionInput([])
    expect(result).toBe('')
  })

  it('inclui tool calls nas mensagens', () => {
    const messages = [{ role: 'assistant', content: null, toolCalls: ['read_file'] }]
    const result = buildCompressionInput(messages)
    expect(result).toContain('Tool calls: read_file')
  })
})
