/**
 * vscode-api-mock
 * Mock do acquireVsCodeApi() para uso no Storybook.
 * Injeta no window global para que hooks VSCode funcionem fora do webview.
 */

const mockVsCodeApi = {
  postMessage: (_msg: unknown) => {
    // no-op in storybook
  },
  getState: () => ({}),
  setState: (_state: unknown) => {
    // no-op in storybook
  },
}

export function installVsCodeApiMock() {
  if (typeof window !== 'undefined' && !(window as Record<string, unknown>).acquireVsCodeApi) {
    ;(window as Record<string, unknown>).acquireVsCodeApi = () => mockVsCodeApi
  }
}
