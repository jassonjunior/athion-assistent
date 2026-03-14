/**
 * App
 * Descrição: Componente raiz do chat webview. Layout composto por Header + MessageList + InputArea.
 */

import { useChat } from './hooks/useChat.js'
import { MessageList } from './components/MessageList.js'
import { InputArea } from './components/InputArea.js'

/**
 * App
 * Descrição: Componente principal da aplicação React do webview de chat.
 * Gerencia o estado do chat via useChat e renderiza header, lista de mensagens e área de input.
 * @returns Elemento JSX do componente raiz
 */
export function App() {
  const chat = useChat()

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">Athion</span>
        <span className={`status-dot ${chat.status}`} />
        {chat.session && <span className="session-info">{chat.session.title}</span>}
        <button className="icon-button" onClick={chat.newSession} title="Nova sessão">
          +
        </button>
      </header>

      <MessageList messages={chat.messages} isStreaming={chat.isStreaming} />

      <InputArea
        onSubmit={chat.sendMessage}
        onAbort={chat.abort}
        isStreaming={chat.isStreaming}
        isDisabled={chat.status !== 'ready'}
      />
    </div>
  )
}
