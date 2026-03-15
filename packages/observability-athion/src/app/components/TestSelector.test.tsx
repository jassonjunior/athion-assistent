/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TestSelector } from './TestSelector'
import type { TestInfo } from '../../server/protocol'

const mockTests: TestInfo[] = [
  { name: 'search-codebase', agent: 'search', description: 'Search codebase' },
  { name: 'code-reviewer', agent: 'code-reviewer', description: 'Review code' },
  { name: 'explainer', agent: 'explainer', description: 'Explain code' },
]

describe('TestSelector', () => {
  it('should render select with test options', () => {
    render(
      <TestSelector
        tests={mockTests}
        running={false}
        connected={true}
        onRun={vi.fn()}
        onStop={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select).toBeTruthy()
    expect(select.options).toHaveLength(3)
  })

  it('should show Run button when not running', () => {
    render(
      <TestSelector
        tests={mockTests}
        running={false}
        connected={true}
        onRun={vi.fn()}
        onStop={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    expect(screen.queryByText(/Run/)).toBeTruthy()
    expect(screen.queryByText(/Stop/)).toBeNull()
  })

  it('should show Stop button when running', () => {
    render(
      <TestSelector
        tests={mockTests}
        running={true}
        connected={true}
        onRun={vi.fn()}
        onStop={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    expect(screen.queryByText(/Stop/)).toBeTruthy()
    expect(screen.queryByText(/Run/)).toBeNull()
  })

  it('should disable Run button when not connected', () => {
    render(
      <TestSelector
        tests={mockTests}
        running={false}
        connected={false}
        onRun={vi.fn()}
        onStop={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    const runBtn = screen.getByText(/Run/).closest('button')!
    expect(runBtn.disabled).toBe(true)
  })

  it('should enable Run button when connected', () => {
    render(
      <TestSelector
        tests={mockTests}
        running={false}
        connected={true}
        onRun={vi.fn()}
        onStop={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    const runBtn = screen.getByText(/Run/).closest('button')!
    expect(runBtn.disabled).toBe(false)
  })

  it('should call onRun with selected test name', () => {
    const onRun = vi.fn()
    render(
      <TestSelector
        tests={mockTests}
        running={false}
        connected={true}
        onRun={onRun}
        onStop={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    // First test is auto-selected
    const runBtn = screen.getByText(/Run/).closest('button')!
    fireEvent.click(runBtn)

    expect(onRun).toHaveBeenCalledWith('search-codebase')
  })

  it('should call onStop when Stop button is clicked', () => {
    const onStop = vi.fn()
    render(
      <TestSelector
        tests={mockTests}
        running={true}
        connected={true}
        onRun={vi.fn()}
        onStop={onStop}
        onClear={vi.fn()}
      />,
    )

    const stopBtn = screen.getByText(/Stop/).closest('button')!
    fireEvent.click(stopBtn)

    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('should call onClear when Clear button is clicked', () => {
    const onClear = vi.fn()
    render(
      <TestSelector
        tests={mockTests}
        running={false}
        connected={true}
        onRun={vi.fn()}
        onStop={vi.fn()}
        onClear={onClear}
      />,
    )

    const clearBtn = screen.getByText('Clear')
    fireEvent.click(clearBtn)

    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('should disable select when running', () => {
    render(
      <TestSelector
        tests={mockTests}
        running={true}
        connected={true}
        onRun={vi.fn()}
        onStop={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.disabled).toBe(true)
  })

  it('should enable select when not running', () => {
    render(
      <TestSelector
        tests={mockTests}
        running={false}
        connected={true}
        onRun={vi.fn()}
        onStop={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.disabled).toBe(false)
  })

  it('should allow changing selected test', () => {
    const onRun = vi.fn()
    render(
      <TestSelector
        tests={mockTests}
        running={false}
        connected={true}
        onRun={onRun}
        onStop={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    const select = screen.getByRole('combobox') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'code-reviewer' } })

    const runBtn = screen.getByText(/Run/).closest('button')!
    fireEvent.click(runBtn)

    expect(onRun).toHaveBeenCalledWith('code-reviewer')
  })

  it('should show connection status dot', () => {
    const { container } = render(
      <TestSelector
        tests={mockTests}
        running={false}
        connected={true}
        onRun={vi.fn()}
        onStop={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    const dot = container.querySelector('.status-dot.connected')
    expect(dot).toBeTruthy()
  })

  it('should show disconnected status dot when not connected', () => {
    const { container } = render(
      <TestSelector
        tests={mockTests}
        running={false}
        connected={false}
        onRun={vi.fn()}
        onStop={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    const dot = container.querySelector('.status-dot.disconnected')
    expect(dot).toBeTruthy()
  })

  it('should format options with agent prefix', () => {
    render(
      <TestSelector
        tests={mockTests}
        running={false}
        connected={true}
        onRun={vi.fn()}
        onStop={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    // Options should have format: [agent] description
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.options[0].textContent).toContain('[search]')
    expect(select.options[0].textContent).toContain('Search codebase')
  })

  it('should handle empty tests list', () => {
    render(
      <TestSelector
        tests={[]}
        running={false}
        connected={true}
        onRun={vi.fn()}
        onStop={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.options).toHaveLength(0)
  })
})
