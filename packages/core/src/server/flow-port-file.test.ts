/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as fs from 'node:fs'

// Mock all dependencies
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
  readdirSync: vi.fn(() => []),
  rmSync: vi.fn(),
}))

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock-home'),
}))

vi.mock('../logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

import {
  writeFlowPortFile,
  removeFlowPortFile,
  listFlowPorts,
  findFlowPort,
} from './flow-port-file'

describe('writeFlowPortFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fs.existsSync).mockReturnValue(true)
  })

  it('escreve arquivo de porta', () => {
    writeFlowPortFile(3000, '/workspace/test')
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('flow-port-'),
      expect.stringContaining('"port": 3000'),
      'utf-8',
    )
  })

  it('cria diretorio se nao existe', () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(false)
    writeFlowPortFile(3000, '/workspace/test')
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.athion'), {
      recursive: true,
    })
  })

  it('inclui pid, port, workspace e startedAt no conteudo', () => {
    writeFlowPortFile(4000, '/my/workspace')
    const writtenContent = (fs.writeFileSync as any).mock.calls[0][1] as string
    const parsed = JSON.parse(writtenContent)
    expect(parsed.pid).toBe(process.pid)
    expect(parsed.port).toBe(4000)
    expect(parsed.workspacePath).toBe('/my/workspace')
    expect(parsed.startedAt).toBeTruthy()
  })
})

describe('removeFlowPortFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('remove o arquivo de porta do PID atual', () => {
    removeFlowPortFile()
    expect(fs.rmSync).toHaveBeenCalledWith(
      expect.stringContaining(`flow-port-${process.pid}.json`),
      { force: true },
    )
  })

  it('nao lanca erro se arquivo nao existe', () => {
    vi.mocked(fs.rmSync).mockImplementationOnce(() => {
      throw new Error('ENOENT')
    })
    expect(() => removeFlowPortFile()).not.toThrow()
  })
})

describe('listFlowPorts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna array vazio quando diretorio nao existe', () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(false)
    const result = listFlowPorts()
    expect(result).toEqual([])
  })

  it('retorna array vazio quando nao ha port files', () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true)
    vi.mocked(fs.readdirSync).mockReturnValueOnce([])
    const result = listFlowPorts()
    expect(result).toEqual([])
  })

  it('filtra apenas arquivos flow-port-*.json', () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true)
    vi.mocked(fs.readdirSync).mockReturnValueOnce([
      'flow-port-123.json' as any,
      'other-file.txt' as any,
      'flow-port-456.json' as any,
    ])
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)

    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (String(path).includes('123')) {
        return JSON.stringify({
          pid: 123,
          port: 3000,
          workspacePath: '/ws1',
          startedAt: '2024-01-01T00:00:00Z',
        })
      }
      return JSON.stringify({
        pid: 456,
        port: 3001,
        workspacePath: '/ws2',
        startedAt: '2024-01-02T00:00:00Z',
      })
    })

    const result = listFlowPorts()
    expect(result).toHaveLength(2)
    // Mais recente primeiro
    expect(result[0]!.port).toBe(3001)

    killSpy.mockRestore()
  })

  it('remove port files de processos mortos', () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true)
    vi.mocked(fs.readdirSync).mockReturnValueOnce(['flow-port-999.json' as any])
    vi.mocked(fs.readFileSync).mockReturnValueOnce(
      JSON.stringify({
        pid: 999,
        port: 3000,
        workspacePath: '/ws',
        startedAt: '2024-01-01T00:00:00Z',
      }),
    )
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH')
    })

    const result = listFlowPorts()
    expect(result).toHaveLength(0)
    expect(fs.rmSync).toHaveBeenCalled()

    killSpy.mockRestore()
  })

  it('remove arquivos corrompidos', () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true)
    vi.mocked(fs.readdirSync).mockReturnValueOnce(['flow-port-111.json' as any])
    vi.mocked(fs.readFileSync).mockReturnValueOnce('invalid json{{{')

    const result = listFlowPorts()
    expect(result).toHaveLength(0)
    expect(fs.rmSync).toHaveBeenCalled()
  })
})

describe('findFlowPort', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna null quando nao ha instancias ativas', () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(false)
    const result = findFlowPort()
    expect(result).toBeNull()
  })

  it('retorna porta da instancia mais recente quando sem workspace', () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true)
    vi.mocked(fs.readdirSync).mockReturnValueOnce([
      'flow-port-100.json' as any,
      'flow-port-200.json' as any,
    ])
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (String(path).includes('100')) {
        return JSON.stringify({
          pid: 100,
          port: 3000,
          workspacePath: '/old',
          startedAt: '2024-01-01T00:00:00Z',
        })
      }
      return JSON.stringify({
        pid: 200,
        port: 4000,
        workspacePath: '/new',
        startedAt: '2024-01-02T00:00:00Z',
      })
    })

    const result = findFlowPort()
    expect(result).toBe(4000)

    killSpy.mockRestore()
  })

  it('retorna porta do workspace especifico', () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true)
    vi.mocked(fs.readdirSync).mockReturnValueOnce([
      'flow-port-100.json' as any,
      'flow-port-200.json' as any,
    ])
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (String(path).includes('100')) {
        return JSON.stringify({
          pid: 100,
          port: 3000,
          workspacePath: '/workspace-a',
          startedAt: '2024-01-01T00:00:00Z',
        })
      }
      return JSON.stringify({
        pid: 200,
        port: 4000,
        workspacePath: '/workspace-b',
        startedAt: '2024-01-02T00:00:00Z',
      })
    })

    const result = findFlowPort('/workspace-a')
    expect(result).toBe(3000)

    killSpy.mockRestore()
  })
})
