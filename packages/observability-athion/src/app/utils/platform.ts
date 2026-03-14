/** Returns true if running inside Tauri WebView */
export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window
}
