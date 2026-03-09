# Contributing to Athion Assistent

## Setup

```bash
# Clone the repository
git clone git@github.com:jassonjunior/athion-assistent.git
cd athion-assistent

# Install dependencies (requires Bun)
bun install

# Verify everything works
bun run typecheck
bun run lint
bun run build
```

## Development Workflow

1. Create a branch from `main`
2. Make your changes
3. Commit (Husky runs lint-staged automatically)
4. Push and open a Pull Request
5. Wait for CI to pass

## Commands

| Command             | Description                    |
| ------------------- | ------------------------------ |
| `bun run build`     | Build all packages             |
| `bun run dev`       | Development mode (watch)       |
| `bun run test`      | Run tests                      |
| `bun run lint`      | Run ESLint                     |
| `bun run typecheck` | Check TypeScript types         |
| `bun run format`    | Format all files with Prettier |

## Code Quality Rules

- Max **300 lines** per file (no God Classes)
- Max **50 lines** per function
- No `console.log` (use structured logger)
- No `any` type
- Always use `===`
- TypeScript strict mode enabled

## Project Structure

```
packages/
  shared/   - Shared types and utilities
  core/     - Core engine (orchestrator, tools, providers)
  cli/      - CLI terminal (yargs + Ink)
  vscode/   - VS Code/Cursor extension
  desktop/  - Tauri desktop app
```

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(core): add config manager
fix(cli): resolve streaming issue
docs: update README
chore: update dependencies
```
