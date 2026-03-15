import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TokenBar } from './TokenBar'
import type { TokenTrackerState } from '../hooks/useTokenTracker'

describe('TokenBar', () => {
  const baseTokens: TokenTrackerState = {
    contextLimit: 50_000,
    totalUsed: 1500,
    percentUsed: 3,
    estimatedInput: 1000,
    estimatedOutput: 500,
  }

  it('should render token limit', () => {
    render(<TokenBar tokens={baseTokens} />)
    expect(screen.getByText('50,000')).toBeTruthy()
  })

  it('should render total used', () => {
    render(<TokenBar tokens={baseTokens} />)
    expect(screen.getByText('1,500')).toBeTruthy()
  })

  it('should render input tokens', () => {
    render(<TokenBar tokens={baseTokens} />)
    expect(screen.getByText('1,000')).toBeTruthy()
  })

  it('should render output tokens', () => {
    render(<TokenBar tokens={baseTokens} />)
    expect(screen.getByText('500')).toBeTruthy()
  })

  it('should render percent used', () => {
    render(<TokenBar tokens={baseTokens} />)
    expect(screen.getByText('3% Used')).toBeTruthy()
  })

  it('should use green color when under 50%', () => {
    const tokens = { ...baseTokens, percentUsed: 30 }
    const { container } = render(<TokenBar tokens={tokens} />)

    const fill = container.querySelector('.token-bar-fill') as HTMLElement
    expect(fill.style.backgroundColor).toBe('rgb(16, 185, 129)') // #10b981
  })

  it('should use amber color when between 50% and 80%', () => {
    const tokens = { ...baseTokens, percentUsed: 65 }
    const { container } = render(<TokenBar tokens={tokens} />)

    const fill = container.querySelector('.token-bar-fill') as HTMLElement
    expect(fill.style.backgroundColor).toBe('rgb(245, 158, 11)') // #f59e0b
  })

  it('should use red color when over 80%', () => {
    const tokens = { ...baseTokens, percentUsed: 90 }
    const { container } = render(<TokenBar tokens={tokens} />)

    const fill = container.querySelector('.token-bar-fill') as HTMLElement
    expect(fill.style.backgroundColor).toBe('rgb(239, 68, 68)') // #ef4444
  })

  it('should cap fill width at 100%', () => {
    const tokens = { ...baseTokens, percentUsed: 150 }
    const { container } = render(<TokenBar tokens={tokens} />)

    const fill = container.querySelector('.token-bar-fill') as HTMLElement
    expect(fill.style.width).toBe('100%')
  })

  it('should set fill width based on percentUsed', () => {
    const tokens = { ...baseTokens, percentUsed: 45 }
    const { container } = render(<TokenBar tokens={tokens} />)

    const fill = container.querySelector('.token-bar-fill') as HTMLElement
    expect(fill.style.width).toBe('45%')
  })

  it('should handle zero values', () => {
    const tokens: TokenTrackerState = {
      contextLimit: 50_000,
      totalUsed: 0,
      percentUsed: 0,
      estimatedInput: 0,
      estimatedOutput: 0,
    }
    render(<TokenBar tokens={tokens} />)

    expect(screen.getByText('0% Used')).toBeTruthy()
  })

  it('should render the bar track container', () => {
    const { container } = render(<TokenBar tokens={baseTokens} />)
    expect(container.querySelector('.token-bar-track')).toBeTruthy()
  })

  it('should render token info section', () => {
    const { container } = render(<TokenBar tokens={baseTokens} />)
    expect(container.querySelector('.token-bar-info')).toBeTruthy()
  })
})
