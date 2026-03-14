import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallbackMessage?: string
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#ef4444',
            flexDirection: 'column',
            gap: 12,
            padding: 20,
          }}
        >
          <p>{this.props.fallbackMessage ?? 'Erro ao renderizar painel.'}</p>
          <button
            className="btn btn-sm"
            onClick={() => this.setState({ hasError: false, error: undefined })}
          >
            Recarregar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
