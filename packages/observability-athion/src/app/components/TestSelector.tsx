import { useEffect, useState } from 'react'
import type { TestInfo } from '../../server/protocol'

interface TestSelectorProps {
  tests: TestInfo[]
  running: boolean
  connected: boolean
  onRun: (testName: string) => void
  onStop: () => void
  onClear: () => void
}

export function TestSelector({
  tests,
  running,
  connected,
  onRun,
  onStop,
  onClear,
}: TestSelectorProps) {
  const [selected, setSelected] = useState('')

  // Selecionar primeiro teste quando a lista chegar
  useEffect(() => {
    if (tests.length > 0 && !selected) {
      setSelected(tests[0].name)
    }
  }, [tests, selected])

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={running}
          className="test-select"
        >
          {tests.map((t) => (
            <option key={t.name} value={t.name}>
              [{t.agent}] {t.description}
            </option>
          ))}
        </select>
      </div>
      <div className="toolbar-right">
        {running ? (
          <button onClick={onStop} className="btn btn-danger">
            ■ Stop
          </button>
        ) : (
          <button
            onClick={() => onRun(selected)}
            disabled={!connected || !selected}
            className="btn btn-primary"
          >
            ▶ Run
          </button>
        )}
        <button onClick={onClear} className="btn btn-secondary">
          Clear
        </button>
      </div>
    </div>
  )
}
