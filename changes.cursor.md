# Changes Log - Athion Assistent

## Fase 1: Core Foundation (branch: fase-1/core-foundation)

### 2.1 Config Manager

**Status**: Em andamento
**Path**: `packages/core/src/config/`
**Arquivos planejados**:

- `schema.ts` — Zod schema + defaults
- `loader.ts` — File/env/args loading
- `config.ts` — ConfigManager implementation
- `index.ts` — barrel export

**Dependencias necessarias**: `zod`

**Decisoes**:

- Hierarquia 5 niveis: defaults < global < project < env < CLI args
- Provider padrao: `ollama`
- Model padrao: `qwen2.5-coder:7b`
- Language padrao: `pt-BR`

---

### Proximos modulos (pendentes)

- 2.2 Event Bus
- 2.3 Storage (SQLite WAL + Drizzle)
- 2.4 Provider Layer (Vercel AI SDK)
- 2.5 Tool Registry
- 2.6 Permission System
- 2.7 Skill Manager
- 2.8 Token Manager & Compaction

---

## Agente: Instrutor

**Status**: Concluído ✅
**Path**: `~/.claude/agents/instrutor.md`
**Data**: 2026-03-07

**Descrição**: Agente de ensino que MOSTRA código sem criar arquivos.

**Características**:

- Baseado no pair-programming-mentor
- NÃO cria/modifica arquivos (Edit, Write, Bash bloqueados)
- Apenas MOSTRA código formatado no chat
- Docstrings obrigatórias no formato JSDoc `/** */`
- Fluxo passo a passo com confirmação do usuário
- Ferramentas permitidas: Glob, Grep, Read, WebFetch, WebSearch, AskUserQuestion

**Ativação**: Usar quando pedir para ensinar/mostrar código sem criar arquivos

- "me ensine X, mas não crie nada"
- "só me mostra como fazer"
- "quero entender X, apenas mostrando"
