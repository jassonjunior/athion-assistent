/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LogPanelBase } from './LogPanelBase'
import type { LogEntry } from './LogPanelBase'

describe('LogPanelBase', () => {
  it('should render empty message when no entries', () => {
    render(<LogPanelBase entries={[]} emptyMessage="No logs yet" />)
    expect(screen.getByText('No logs yet')).toBeTruthy()
  })

  it('should render log entries', () => {
    const entries: LogEntry[] = [
      { key: 1, type: 'orch:content', color: '#10b981', content: 'Hello world' },
      { key: 2, type: 'orch:tool_call', color: '#f59e0b', content: 'grep: TODO' },
    ]
    render(<LogPanelBase entries={entries} emptyMessage="No logs" />)

    expect(screen.getByText('Hello world')).toBeTruthy()
    expect(screen.getByText('grep: TODO')).toBeTruthy()
  })

  it('should not show empty message when entries exist', () => {
    const entries: LogEntry[] = [{ key: 1, type: 'test', color: '#fff', content: 'Log line' }]
    render(<LogPanelBase entries={entries} emptyMessage="No logs" />)

    expect(screen.queryByText('No logs')).toBeNull()
  })

  it('should render tokens when provided', () => {
    const entries: LogEntry[] = [
      { key: 1, type: 'orch:content', color: '#10b981', content: 'Hello', tokens: '150/50000' },
    ]
    render(<LogPanelBase entries={entries} emptyMessage="No logs" />)

    expect(screen.getByText('150/50000')).toBeTruthy()
  })

  it('should render time when provided', () => {
    const entries: LogEntry[] = [
      { key: 1, type: 'test', color: '#fff', content: 'Log', time: '12:34:56' },
    ]
    render(<LogPanelBase entries={entries} emptyMessage="No logs" />)

    expect(screen.getByText('12:34:56')).toBeTruthy()
  })

  it('should apply error class to error entries', () => {
    const entries: LogEntry[] = [
      { key: 1, type: 'error', color: '#ef4444', content: 'Error occurred', isError: true },
    ]
    const { container } = render(<LogPanelBase entries={entries} emptyMessage="No logs" />)

    const logLine = container.querySelector('.log-error')
    expect(logLine).toBeTruthy()
  })

  it('should not apply error class to normal entries', () => {
    const entries: LogEntry[] = [{ key: 1, type: 'info', color: '#10b981', content: 'Normal log' }]
    const { container } = render(<LogPanelBase entries={entries} emptyMessage="No logs" />)

    const logLine = container.querySelector('.log-error')
    expect(logLine).toBeNull()
  })

  it('should render type with padding', () => {
    const entries: LogEntry[] = [
      { key: 1, type: 'orch:content', color: '#10b981', content: 'test' },
    ]
    const { container } = render(<LogPanelBase entries={entries} emptyMessage="No logs" />)

    // padEnd(22) pads the type string — use container query to avoid text normalization
    const typeSpan = container.querySelector('.log-type')
    expect(typeSpan).toBeTruthy()
    expect(typeSpan!.textContent).toBe('orch:content'.padEnd(22))
  })

  it('should apply color to type span', () => {
    const entries: LogEntry[] = [{ key: 1, type: 'test', color: '#ff0000', content: 'content' }]
    const { container } = render(<LogPanelBase entries={entries} emptyMessage="No logs" />)

    const typeSpan = container.querySelector('.log-type')
    expect(typeSpan).toBeTruthy()
    expect((typeSpan as HTMLElement).style.color).toBe('rgb(255, 0, 0)')
  })

  it('should render multiple entries with correct keys', () => {
    const entries: LogEntry[] = Array.from({ length: 10 }, (_, i) => ({
      key: i,
      type: `type-${i}`,
      color: '#fff',
      content: `content-${i}`,
    }))
    render(<LogPanelBase entries={entries} emptyMessage="No logs" />)

    for (let i = 0; i < 10; i++) {
      expect(screen.getByText(`content-${i}`)).toBeTruthy()
    }
  })
})
