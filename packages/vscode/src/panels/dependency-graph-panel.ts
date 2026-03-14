/**
 * DependencyGraphPanel
 * Descrição: Webview Panel para visualização interativa do DependencyGraph.
 * Usa ReactFlow + Dagre layout para renderizar o grafo de dependências.
 * Comunica com o CoreBridge para obter dados do grafo.
 */

import * as vscode from 'vscode'
import { CoreBridge } from '../bridge/core-bridge.js'

/**
 * SerializedGraphData
 * Descrição: Dados do grafo serializados recebidos do core.
 */
interface SerializedGraphData {
  version: number
  files: string[]
  edges: Array<{ from: string; to: string }>
  stats: { totalFiles: number; totalEdges: number }
  exportedAt: string
}

/**
 * GraphPanelMessage
 * Descrição: Mensagens enviadas do webview para a extensão.
 */
interface GraphPanelMessage {
  type: 'openFile' | 'refresh' | 'ready'
  filePath?: string
}

/**
 * DependencyGraphPanel
 * Descrição: Gerencia o lifecycle do Webview Panel de dependency graph.
 * Singleton: apenas um painel pode existir por vez.
 */
export class DependencyGraphPanel {
  private static instance: DependencyGraphPanel | undefined
  private readonly panel: vscode.WebviewPanel
  private disposed = false

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly bridge: CoreBridge,
  ) {
    this.panel = panel

    this.panel.webview.onDidReceiveMessage((msg: GraphPanelMessage) => this.handleMessage(msg))

    this.panel.onDidDispose(() => {
      this.disposed = true
      DependencyGraphPanel.instance = undefined
    })

    this.panel.webview.html = this.getHtml()
  }

  /**
   * createOrShow
   * Descrição: Cria um novo painel ou foca o existente.
   */
  static createOrShow(extensionUri: vscode.Uri, bridge: CoreBridge, focusFile?: string): void {
    if (DependencyGraphPanel.instance) {
      DependencyGraphPanel.instance.panel.reveal(vscode.ViewColumn.Beside)
      if (focusFile) {
        DependencyGraphPanel.instance.loadGraph(focusFile)
      }
      return
    }

    const panel = vscode.window.createWebviewPanel(
      'athion.dependencyGraph',
      'Dependency Graph',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'graph')],
      },
    )

    DependencyGraphPanel.instance = new DependencyGraphPanel(panel, extensionUri, bridge)

    if (focusFile) {
      DependencyGraphPanel.instance.loadGraph(focusFile)
    }
  }

  /**
   * loadGraph
   * Descrição: Solicita o grafo ao core e envia para o webview.
   */
  private async loadGraph(focusFile?: string): Promise<void> {
    if (this.disposed) return

    try {
      this.panel.webview.postMessage({ type: 'loading' })

      const data = await this.bridge.request<SerializedGraphData>(
        'codebase.getDependencyGraph',
        { focus: focusFile, depth: 3 },
        15000,
      )

      this.panel.webview.postMessage({
        type: 'graphData',
        data,
        focusFile,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.panel.webview.postMessage({
        type: 'error',
        message: msg,
      })
    }
  }

  /**
   * handleMessage
   * Descrição: Processa mensagens vindas do webview.
   */
  private handleMessage(msg: GraphPanelMessage): void {
    switch (msg.type) {
      case 'openFile':
        if (msg.filePath) {
          const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
          const uri = wsRoot
            ? vscode.Uri.file(`${wsRoot}/${msg.filePath}`)
            : vscode.Uri.file(msg.filePath)
          vscode.window.showTextDocument(uri, { preview: true })
        }
        break
      case 'refresh':
        this.loadGraph(msg.filePath)
        break
      case 'ready':
        this.loadGraph()
        break
    }
  }

  /**
   * getHtml
   * Descrição: Gera o HTML do webview com CSP e referências aos bundles.
   */
  private getHtml(): string {
    const webview = this.panel.webview
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'graph', 'main.js'),
    )
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'graph', 'main.css'),
    )
    const nonce = getNonce()

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}">
  <title>Dependency Graph</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
