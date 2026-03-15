import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockInvoke, mockListen } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockListen: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: mockListen }))
vi.mock('@athion/shared', () => ({}))

import {
  chatSend,
  chatAbort,
  sessionCreate,
  sessionList,
  sessionLoad,
  sessionDelete,
  configGet,
  configSet,
  configList,
  pluginSearch,
  pluginInstall,
  skillList,
  skillSetActive,
  skillClearActive,
  filesList,
  ping,
  sidecarStatus,
  onChatEvent,
  onTrayNewChat,
  onDeepLinkSession,
  onDeepLinkMessage,
  onDeepLinkNew,
  onDeepLinkConfig,
} from './tauri-bridge.js'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Chat ────────────────────────────────────────────────────────

describe('chatSend', () => {
  it('deve chamar invoke com chat_send e os parâmetros corretos', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await chatSend('session-1', 'Olá mundo')
    expect(mockInvoke).toHaveBeenCalledWith('chat_send', {
      sessionId: 'session-1',
      content: 'Olá mundo',
    })
  })

  it('deve propagar erro do invoke', async () => {
    mockInvoke.mockRejectedValue(new Error('fail'))
    await expect(chatSend('s1', 'x')).rejects.toThrow('fail')
  })
})

describe('chatAbort', () => {
  it('deve chamar invoke com chat_abort', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await chatAbort('session-2')
    expect(mockInvoke).toHaveBeenCalledWith('chat_abort', { sessionId: 'session-2' })
  })
})

// ─── Sessions ────────────────────────────────────────────────────

describe('sessionCreate', () => {
  it('deve retornar SessionInfo ao criar sessão', async () => {
    const session = { id: 's1', title: 'Test', createdAt: Date.now() }
    mockInvoke.mockResolvedValue(session)
    const result = await sessionCreate('proj-1', 'Test')
    expect(mockInvoke).toHaveBeenCalledWith('session_create', {
      projectId: 'proj-1',
      title: 'Test',
    })
    expect(result).toEqual(session)
  })

  it('deve aceitar title undefined', async () => {
    mockInvoke.mockResolvedValue({ id: 's2' })
    await sessionCreate('proj-1')
    expect(mockInvoke).toHaveBeenCalledWith('session_create', {
      projectId: 'proj-1',
      title: undefined,
    })
  })
})

describe('sessionList', () => {
  it('deve retornar lista de sessões', async () => {
    const sessions = [{ id: 's1' }, { id: 's2' }]
    mockInvoke.mockResolvedValue(sessions)
    const result = await sessionList('proj-1')
    expect(mockInvoke).toHaveBeenCalledWith('session_list', { projectId: 'proj-1' })
    expect(result).toEqual(sessions)
  })

  it('deve aceitar projectId undefined', async () => {
    mockInvoke.mockResolvedValue([])
    await sessionList()
    expect(mockInvoke).toHaveBeenCalledWith('session_list', { projectId: undefined })
  })
})

describe('sessionLoad', () => {
  it('deve retornar a sessão carregada', async () => {
    const session = { id: 's1', title: 'Loaded' }
    mockInvoke.mockResolvedValue(session)
    const result = await sessionLoad('s1')
    expect(mockInvoke).toHaveBeenCalledWith('session_load', { sessionId: 's1' })
    expect(result).toEqual(session)
  })
})

describe('sessionDelete', () => {
  it('deve chamar invoke com session_delete', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await sessionDelete('s1')
    expect(mockInvoke).toHaveBeenCalledWith('session_delete', { sessionId: 's1' })
  })
})

// ─── Config ──────────────────────────────────────────────────────

describe('configGet', () => {
  it('deve retornar chave e valor da configuração', async () => {
    const config = { key: 'theme', value: 'dark' }
    mockInvoke.mockResolvedValue(config)
    const result = await configGet('theme')
    expect(mockInvoke).toHaveBeenCalledWith('config_get', { key: 'theme' })
    expect(result).toEqual(config)
  })
})

describe('configSet', () => {
  it('deve chamar invoke com config_set', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await configSet('theme', 'light')
    expect(mockInvoke).toHaveBeenCalledWith('config_set', { key: 'theme', value: 'light' })
  })
})

describe('configList', () => {
  it('deve retornar todas as configurações', async () => {
    const configs = { theme: 'dark', lang: 'pt' }
    mockInvoke.mockResolvedValue(configs)
    const result = await configList()
    expect(mockInvoke).toHaveBeenCalledWith('config_list')
    expect(result).toEqual(configs)
  })
})

// ─── Plugin/Skills ───────────────────────────────────────────────

describe('pluginSearch', () => {
  it('deve buscar plugins com query', async () => {
    const data = {
      results: [{ packageName: 'pkg', pluginName: 'test', description: 'd', version: '1.0' }],
    }
    mockInvoke.mockResolvedValue(data)
    const result = await pluginSearch('test')
    expect(mockInvoke).toHaveBeenCalledWith('plugin_search', { query: 'test' })
    expect(result).toEqual(data)
  })

  it('deve buscar sem query', async () => {
    mockInvoke.mockResolvedValue({ results: [] })
    await pluginSearch()
    expect(mockInvoke).toHaveBeenCalledWith('plugin_search', { query: undefined })
  })
})

describe('pluginInstall', () => {
  it('deve retornar resultado de instalação com sucesso', async () => {
    const data = { success: true }
    mockInvoke.mockResolvedValue(data)
    const result = await pluginInstall('my-plugin')
    expect(mockInvoke).toHaveBeenCalledWith('plugin_install', { name: 'my-plugin' })
    expect(result).toEqual(data)
  })

  it('deve retornar resultado de instalação com erro', async () => {
    const data = { success: false, error: 'not found' }
    mockInvoke.mockResolvedValue(data)
    const result = await pluginInstall('unknown')
    expect(result.success).toBe(false)
    expect(result.error).toBe('not found')
  })
})

describe('skillList', () => {
  it('deve retornar lista de skills instaladas', async () => {
    const skills = [{ name: 'refactor', description: 'Refactoring', triggers: ['refact'] }]
    mockInvoke.mockResolvedValue(skills)
    const result = await skillList()
    expect(mockInvoke).toHaveBeenCalledWith('skill_list')
    expect(result).toEqual(skills)
  })
})

describe('skillSetActive', () => {
  it('deve chamar invoke com skill_set_active', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await skillSetActive('refactor')
    expect(mockInvoke).toHaveBeenCalledWith('skill_set_active', { name: 'refactor' })
  })
})

describe('skillClearActive', () => {
  it('deve chamar invoke com skill_clear_active', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await skillClearActive()
    expect(mockInvoke).toHaveBeenCalledWith('skill_clear_active')
  })
})

describe('filesList', () => {
  it('deve retornar lista de arquivos', async () => {
    const data = { files: ['src/index.ts', 'src/main.ts'] }
    mockInvoke.mockResolvedValue(data)
    const result = await filesList('src/')
    expect(mockInvoke).toHaveBeenCalledWith('files_list', { prefix: 'src/', cwd: undefined })
    expect(result).toEqual(data)
  })

  it('deve aceitar cwd opcional', async () => {
    mockInvoke.mockResolvedValue({ files: [] })
    await filesList('lib/', '/home/user')
    expect(mockInvoke).toHaveBeenCalledWith('files_list', { prefix: 'lib/', cwd: '/home/user' })
  })
})

// ─── Status ──────────────────────────────────────────────────────

describe('ping', () => {
  it('deve retornar pong: true', async () => {
    mockInvoke.mockResolvedValue({ pong: true })
    const result = await ping()
    expect(mockInvoke).toHaveBeenCalledWith('ping')
    expect(result).toEqual({ pong: true })
  })
})

describe('sidecarStatus', () => {
  it('deve retornar running: true', async () => {
    mockInvoke.mockResolvedValue({ running: true })
    const result = await sidecarStatus()
    expect(mockInvoke).toHaveBeenCalledWith('sidecar_status')
    expect(result).toEqual({ running: true })
  })
})

// ─── Event Listeners ─────────────────────────────────────────────

describe('onChatEvent', () => {
  it('deve registrar listener para chat:event e extrair payload', async () => {
    const unlisten = vi.fn()
    mockListen.mockImplementation((_event: string, cb: (e: { payload: unknown }) => void) => {
      cb({ payload: { type: 'content', content: 'hello' } })
      return Promise.resolve(unlisten)
    })

    const handler = vi.fn()
    await onChatEvent(handler)

    expect(mockListen).toHaveBeenCalledWith('chat:event', expect.any(Function))
    expect(handler).toHaveBeenCalledWith({ type: 'content', content: 'hello' })
  })
})

describe('onTrayNewChat', () => {
  it('deve registrar listener para tray:new-chat', async () => {
    const unlisten = vi.fn()
    mockListen.mockImplementation((_event: string, cb: () => void) => {
      cb()
      return Promise.resolve(unlisten)
    })

    const handler = vi.fn()
    await onTrayNewChat(handler)

    expect(mockListen).toHaveBeenCalledWith('tray:new-chat', expect.any(Function))
    expect(handler).toHaveBeenCalled()
  })
})

describe('onDeepLinkSession', () => {
  it('deve registrar listener e extrair payload de sessão', async () => {
    mockListen.mockImplementation((_event: string, cb: (e: { payload: string }) => void) => {
      cb({ payload: 'session-123' })
      return Promise.resolve(vi.fn())
    })

    const handler = vi.fn()
    await onDeepLinkSession(handler)

    expect(mockListen).toHaveBeenCalledWith('deep-link:session', expect.any(Function))
    expect(handler).toHaveBeenCalledWith('session-123')
  })
})

describe('onDeepLinkMessage', () => {
  it('deve registrar listener e extrair payload de mensagem', async () => {
    mockListen.mockImplementation((_event: string, cb: (e: { payload: string }) => void) => {
      cb({ payload: 'hello deep link' })
      return Promise.resolve(vi.fn())
    })

    const handler = vi.fn()
    await onDeepLinkMessage(handler)

    expect(handler).toHaveBeenCalledWith('hello deep link')
  })
})

describe('onDeepLinkNew', () => {
  it('deve registrar listener para deep-link:new', async () => {
    mockListen.mockImplementation((_event: string, cb: () => void) => {
      cb()
      return Promise.resolve(vi.fn())
    })

    const handler = vi.fn()
    await onDeepLinkNew(handler)

    expect(mockListen).toHaveBeenCalledWith('deep-link:new', expect.any(Function))
    expect(handler).toHaveBeenCalled()
  })
})

describe('onDeepLinkConfig', () => {
  it('deve registrar listener e extrair key/value do payload', async () => {
    mockListen.mockImplementation(
      (_event: string, cb: (e: { payload: { key: string; value: string } }) => void) => {
        cb({ payload: { key: 'theme', value: 'dark' } })
        return Promise.resolve(vi.fn())
      },
    )

    const handler = vi.fn()
    await onDeepLinkConfig(handler)

    expect(mockListen).toHaveBeenCalledWith('deep-link:config', expect.any(Function))
    expect(handler).toHaveBeenCalledWith('theme', 'dark')
  })
})
