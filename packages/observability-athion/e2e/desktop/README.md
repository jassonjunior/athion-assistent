# Desktop E2E Tests

Desktop E2E tests require `tauri-driver` and WebDriverIO.

## Prerequisites

```bash
# Install tauri-driver
cargo install tauri-driver

# Install WebDriverIO deps
bun add -d @wdio/cli @wdio/mocha-framework @wdio/spec-reporter
```

## Running

```bash
# Build the app first
bun run tauri:build

# Run desktop E2E tests
bun run test:e2e:desktop
```

## Test Specs

- `app-startup.e2e.ts` — Verifies app opens, loading state, sidecar starts
- `websocket.e2e.ts` — WebSocket connects, test list appears, mode toggle
- `test-execution.e2e.ts` — Run test, events in panels, test finishes
- `lifecycle.e2e.ts` — Close window kills sidecar, tray works
