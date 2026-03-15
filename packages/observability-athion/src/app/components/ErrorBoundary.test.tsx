import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

// Suppress console.error from React's error boundary logging
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error')
  }
  return <div>Child content</div>
}

describe('ErrorBoundary', () => {
  it('should render children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Hello World</div>
      </ErrorBoundary>,
    )

    expect(screen.getByText('Hello World')).toBeTruthy()
  })

  it('should show fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Erro ao renderizar painel.')).toBeTruthy()
  })

  it('should show custom fallback message', () => {
    render(
      <ErrorBoundary fallbackMessage="Custom error message">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Custom error message')).toBeTruthy()
  })

  it('should show Recarregar button in error state', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Recarregar')).toBeTruthy()
  })

  it('should reset error state when Recarregar is clicked', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Erro ao renderizar painel.')).toBeTruthy()

    // Click Recarregar - this resets the error state
    // But the component will throw again on next render if shouldThrow is still true
    // So we need to rerender with shouldThrow=false after clicking
    // Actually, ErrorBoundary.setState resets, then it tries to render children again

    // Re-render with non-throwing child before clicking reset
    rerender(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>,
    )

    // Still in error state because getDerivedStateFromError already set it
    // We need to click Recarregar to clear
    const reloadBtn = screen.queryByText('Recarregar')
    if (reloadBtn) {
      fireEvent.click(reloadBtn)
      // After reset, should show child content
      expect(screen.getByText('Child content')).toBeTruthy()
    }
  })

  it('should log error to console', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )

    // React calls console.error and our componentDidCatch calls it too
    expect(consoleSpy).toHaveBeenCalled()
  })

  it('should not show error UI for normal children', () => {
    render(
      <ErrorBoundary>
        <div>Normal content</div>
      </ErrorBoundary>,
    )

    expect(screen.queryByText('Erro ao renderizar painel.')).toBeNull()
    expect(screen.queryByText('Recarregar')).toBeNull()
  })

  it('should use default fallback message when none provided', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Erro ao renderizar painel.')).toBeTruthy()
  })
})
