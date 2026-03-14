# PoC: bun build --compile

## Objetivo

Compilar o server como binário standalone, eliminando dependência do Bun no runtime.

## Comando

```bash
bun build --compile src/server/index.ts --outfile dist-server/observability-server
```

## Status: PENDENTE

A PoC precisa ser executada para validar:

1. O binário compila sem erros?
2. Inicia e escuta na porta 3457?
3. WebSocket aceita conexões?
4. `test:run` funciona com bootstrap do core?
5. Dynamic imports do core funcionam?

## Limitações Conhecidas

- `bun build --compile` pode ter problemas com:
  - Dynamic imports (`import()`)
  - WASM modules
  - Native addons (better-sqlite3)
  - Workspace references (`workspace:*`)
- O `@athion/core` usa `better-sqlite3` (native addon) que pode não compilar

## Resultado

> TODO: Preencher após executar a PoC

## Decisao

- Se funciona: migrar sidecar para usar binario em producao (V2)
- Se nao funciona: manter Bun como runtime, documentar limitacoes
