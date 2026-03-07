# Fase 0: Bootstrap

**Semanas**: 1-2
**Objetivo**: Setup completo do monorepo, CI/CD, e infraestrutura basica para desenvolvimento.
**Pre-requisitos**: Nenhum (primeira fase)
**Entregavel**: Monorepo funcional com CI rodando, pronto para receber codigo.

---

## 1. Visao Geral

Esta fase prepara toda a infraestrutura de desenvolvimento. Nenhuma logica de negocio e implementada aqui — apenas tooling, configuracao e estrutura de projeto.

### Por que isso importa
Um setup mal feito no inicio causa atrito em todas as fases seguintes. Investir 2 semanas agora economiza semanas de debugging de build/CI depois.

---

## 2. Tasks Detalhadas

### 2.1 Monorepo Setup (Complexidade: Baixa)

**Objetivo**: Configurar Turborepo + Bun workspaces para o monorepo.

**Passos**:
1. Inicializar repositorio Git
2. Criar `package.json` root com Bun workspaces
3. Configurar Turborepo (`turbo.json`) com pipelines:
   - `build` — compila todos os packages
   - `dev` — modo desenvolvimento com watch
   - `test` — executa testes
   - `lint` — linting e formatting
   - `typecheck` — verificacao de tipos
4. Criar `.gitignore` abrangente (node_modules, dist, .turbo, *.db, .env)
5. Criar `.npmrc` com configuracoes de workspace

**Arquivo turbo.json**:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

**Criterio de aceite**:
- [ ] `bun install` funciona sem erros
- [ ] `bun run build` compila todos packages (mesmo vazios)
- [ ] `bun run dev` inicia watch mode
- [ ] Turborepo cache funciona (segunda build e mais rapida)

---

### 2.2 Package Structure (Complexidade: Media)

**Objetivo**: Criar todos os packages do monorepo com configuracao minima.

**Packages a criar**:

| Package | Path | Descricao |
|---------|------|-----------|
| `@athion/core` | `packages/core/` | Core engine (orquestrador, tools, providers) |
| `@athion/cli` | `packages/cli/` | CLI terminal (yargs + Ink) |
| `@athion/vscode` | `packages/vscode/` | Extensao VS Code/Cursor |
| `@athion/desktop` | `packages/desktop/` | App Tauri desktop |
| `@athion/shared` | `packages/shared/` | Tipos e utilidades compartilhadas |

**Para cada package, criar**:
```
packages/{name}/
├── package.json          # name, version, dependencies, scripts
├── tsconfig.json         # extends root, paths especificos
├── src/
│   └── index.ts          # barrel export (vazio por enquanto)
└── README.md             # descricao do package
```

**package.json de cada package** (exemplo @athion/core):
```json
{
  "name": "@athion/core",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "bun build ./src/index.ts --outdir ./dist --target bun",
    "dev": "bun --watch ./src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@athion/shared": "workspace:*"
  }
}
```

**Criterio de aceite**:
- [ ] Todos os 5 packages existem com package.json valido
- [ ] Imports entre packages funcionam (`@athion/core` importa `@athion/shared`)
- [ ] `bun run build` compila todos sem erros
- [ ] TypeScript resolve paths entre packages

---

### 2.3 TypeScript Config (Complexidade: Baixa)

**Objetivo**: Configuracao TypeScript strict para todo o monorepo.

**tsconfig.json (root)**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "paths": {
      "@athion/core": ["./packages/core/src"],
      "@athion/cli": ["./packages/cli/src"],
      "@athion/shared": ["./packages/shared/src"],
      "@athion/vscode": ["./packages/vscode/src"],
      "@athion/desktop": ["./packages/desktop/src"]
    }
  },
  "exclude": ["node_modules", "dist", "**/dist"]
}
```

**Regras strict que DEVEM estar ativas**:
- `strict: true` (inclui strictNullChecks, noImplicitAny, etc.)
- `noUnusedLocals` / `noUnusedParameters` — codigo limpo
- `exactOptionalPropertyTypes` — previne bugs com `undefined`
- `noImplicitReturns` — todas funcoes tem return explicito

**Criterio de aceite**:
- [ ] `tsc --noEmit` passa sem erros em todos packages
- [ ] Strict mode ativo (testar com codigo que deveria falhar)
- [ ] Path aliases resolvem entre packages

---

### 2.4 Linting e Formatting (Complexidade: Baixa)

**Objetivo**: ESLint 9 + Prettier + lint-staged para qualidade de codigo.

**Dependencias**:
```bash
bun add -d eslint @eslint/js typescript-eslint prettier eslint-config-prettier lint-staged husky
```

**eslint.config.js (ESLint 9 flat config)**:
```javascript
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    rules: {
      // Max 300 linhas por arquivo (anti God Class)
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      // Max 50 linhas por funcao
      'max-lines-per-function': ['warn', { max: 50, skipBlankLines: true, skipComments: true }],
      // No console.log (usar Pino)
      'no-console': 'error',
      // Sempre usar ===
      'eqeqeq': 'error',
      // Sem any explicito
      '@typescript-eslint/no-explicit-any': 'error',
      // Sem unused vars
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    }
  },
  {
    ignores: ['dist/', 'node_modules/', '*.config.js', '*.config.ts']
  }
)
```

**Prettier (.prettierrc)**:
```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

**lint-staged (.lintstagedrc)**:
```json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,yml}": ["prettier --write"]
}
```

**Husky pre-commit hook**:
```bash
#!/bin/sh
bunx lint-staged
```

**Criterio de aceite**:
- [ ] `bun run lint` executa sem erros
- [ ] Prettier formata todos os arquivos
- [ ] Pre-commit hook roda lint-staged
- [ ] Regra max-lines = 300 ativa (testar com arquivo grande)

---

### 2.5 CI/CD - GitHub Actions (Complexidade: Media)

**Objetivo**: Pipeline de CI que roda test, lint, build e typecheck em todo PR.

**.github/workflows/ci.yml**:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    name: Quality Checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Typecheck
        run: bun run typecheck

      - name: Lint
        run: bun run lint

      - name: Test
        run: bun run test

      - name: Build
        run: bun run build

  # Job separado para Node.js (fallback/compatibilidade)
  build-node:
    name: Build (Node.js)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
```

**Criterio de aceite**:
- [ ] CI roda em push para main
- [ ] CI roda em PRs
- [ ] Job de quality passa (lint + typecheck + test + build)
- [ ] Job de Node.js fallback funciona

---

### 2.6 Configuracoes Adicionais (Complexidade: Baixa)

**Arquivos a criar na raiz**:

| Arquivo | Proposito |
|---------|-----------|
| `.editorconfig` | Consistencia entre editores |
| `.nvmrc` | Versao do Node.js para fallback |
| `.env.example` | Template de variaveis de ambiente |
| `CONTRIBUTING.md` | Guia de contribuicao |
| `LICENSE` | MIT License |

**.editorconfig**:
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

**.env.example**:
```bash
# LLM Providers
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=

# Ollama
OLLAMA_BASE_URL=http://localhost:11434

# Telemetry (opt-in)
ATHION_TELEMETRY=false
OTEL_EXPORTER_OTLP_ENDPOINT=

# Debug
ATHION_LOG_LEVEL=info
ATHION_DEBUG=false
```

**Criterio de aceite**:
- [ ] `.editorconfig` e respeitado pelo VS Code
- [ ] `.env.example` documenta todas variaveis
- [ ] CONTRIBUTING.md explica workflow de desenvolvimento

---

## 3. Estrutura Final da Fase 0

```
athion-assistent/
├── .editorconfig
├── .env.example
├── .eslintrc.config.js
├── .github/
│   └── workflows/
│       └── ci.yml
├── .gitignore
├── .husky/
│   └── pre-commit
├── .lintstagedrc
├── .nvmrc
├── .prettierrc
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── bun.lockb
├── package.json
├── packages/
│   ├── cli/
│   │   ├── package.json
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   ├── core/
│   │   ├── package.json
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   ├── desktop/
│   │   ├── package.json
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   ├── shared/
│   │   ├── package.json
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   └── vscode/
│       ├── package.json
│       ├── src/
│       │   └── index.ts
│       └── tsconfig.json
├── tsconfig.json
├── turbo.json
└── vitest.config.ts
```

---

## 4. Riscos Especificos da Fase

| Risco | Mitigacao |
|-------|----------|
| Bun incompativel com alguma dep | Testar deps criticas logo no setup |
| Turborepo cache inconsistente | Configurar `inputs`/`outputs` corretos |
| ESLint 9 breaking com plugins antigos | Usar apenas plugins com suporte flat config |
| Path aliases nao resolvem | Testar imports entre packages imediatamente |

---

## 5. Checklist de Conclusao

- [ ] `git clone && bun install` funciona
- [ ] `bun run build` compila todos packages
- [ ] `bun run lint` passa sem erros
- [ ] `bun run test` executa (mesmo sem testes reais)
- [ ] `bun run typecheck` passa
- [ ] CI no GitHub Actions funciona
- [ ] Pre-commit hook roda lint-staged
- [ ] Imports entre packages funcionam
- [ ] Max 300 linhas/arquivo ativo no ESLint
- [ ] Documentacao basica existe (README, CONTRIBUTING)

---

## 6. Proximo Passo

Ao concluir a Fase 0, a equipe deve ter confianca de que:
1. O ambiente de desenvolvimento esta 100% funcional
2. Qualquer dev pode clonar e comecar a codar em 5 minutos
3. CI vai pegar problemas antes do merge

**Proxima fase**: [Fase 1: Core Foundation](../fase-1-core-foundation/fase-1-core-foundation.md)
