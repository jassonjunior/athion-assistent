import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockHandleCopy = vi.fn()
let mockCopied = false

vi.mock('@athion/shared', () => ({
  useCodeCopy: () => ({ copied: mockCopied, handleCopy: mockHandleCopy }),
}))

import { CodeBlock } from './CodeBlock.js'

describe('CodeBlock', () => {
  it('deve renderizar o código', () => {
    render(<CodeBlock language="typescript" code="const x = 1" />)
    expect(screen.getByText('const x = 1')).toBeDefined()
  })

  it('deve exibir o label de linguagem', () => {
    render(<CodeBlock language="python" code="print('hello')" />)
    expect(screen.getByText('python')).toBeDefined()
  })

  it('deve exibir botão Copiar quando não copiado', () => {
    mockCopied = false
    render(<CodeBlock language="javascript" code="let a = 1" />)
    expect(screen.getByText('Copiar')).toBeDefined()
  })

  it('deve exibir "Copiado!" quando copiado', () => {
    mockCopied = true
    render(<CodeBlock language="javascript" code="let a = 1" />)
    expect(screen.getByText('Copiado!')).toBeDefined()
    mockCopied = false
  })

  it('deve chamar handleCopy com o código ao clicar em Copiar', () => {
    mockCopied = false
    render(<CodeBlock language="rust" code="fn main() {}" />)
    fireEvent.click(screen.getByText('Copiar'))
    expect(mockHandleCopy).toHaveBeenCalledWith('fn main() {}')
  })

  it('deve renderizar código multilinha', () => {
    const code = 'line1\nline2\nline3'
    render(<CodeBlock language="text" code={code} />)
    const codeEl = screen.getByText((_content, element) => {
      return element?.tagName === 'CODE' && element.textContent === code
    })
    expect(codeEl).toBeDefined()
  })

  it('deve renderizar com linguagem text', () => {
    render(<CodeBlock language="text" code="plain text" />)
    expect(screen.getByText('text')).toBeDefined()
    expect(screen.getByText('plain text')).toBeDefined()
  })
})
