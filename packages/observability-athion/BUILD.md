# Build Requirements

## Prerequisites

| Tool      | Version | Purpose                     |
| --------- | ------- | --------------------------- |
| Rust      | 1.75+   | Tauri backend compilation   |
| Bun       | 1.0+    | JS runtime, package manager |
| Tauri CLI | 2.x     | `cargo install tauri-cli`   |

## Development

```bash
# Web only (no Tauri)
bun run dev

# Desktop (Tauri + Vite + Bun server)
bun run tauri:dev
```

## Build

### macOS

```bash
# Generates .app and .dmg in src-tauri/target/release/bundle/macos/
bun run tauri:build
```

Requirements: Xcode Command Line Tools

### Linux

```bash
# Generates .deb and .AppImage
bun run tauri:build
```

Requirements: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`

### Windows

```bash
bun run tauri:build
```

Requirements: Visual Studio Build Tools, WebView2

## Bundle Structure

The Tauri bundle includes:

- Frontend: `dist/` (Vite build output)
- Server: `src/server/**/*` (bundled as resources)
- Runtime: Bun must be available in PATH on the target machine

## Testing

```bash
# Web E2E tests
bun run test:e2e

# Desktop E2E tests (requires built app)
bun run test:e2e:desktop
```
