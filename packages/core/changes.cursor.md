# Changes — Fase 6: Polish

## Status: Em Andamento

---

## 6.1 Testes Unitários Core ✅

**113 testes passando** com Vitest 4.x

### Arquivos criados:

- `src/bus/bus.test.ts` — 11 testes
- `src/tools/registry.test.ts` — 15 testes
- `src/tokens/manager.test.ts` — 22 testes
- `src/permissions/permissions.test.ts` — 17 testes
- `src/config/config.test.ts` — 16 testes
- `src/skills/parser.test.ts` — 10 testes
- `src/storage/db.test.ts` — 22 testes
- `vitest.config.ts` — server.deps.inline: ['zod'] (fix ESM/Vite SSR)

## 6.2 Testes E2E CLI ✅

- `packages/cli/src/e2e/cli.e2e.test.ts`

## 6.3 Telemetria OpenTelemetry ✅

- `src/telemetry/types.ts`, `src/telemetry/telemetry.ts`, `src/telemetry/index.ts`
- Opt-in (enabled: false por padrão), dynamic import, anonymize

## 6.4 Security Audit ✅

- `docs/security-audit.md` — checklist OWASP

## 6.5 Performance Benchmarks ✅

- `scripts/benchmark.ts` — bus: 6.7M ops/s, config.get: 83M ops/s

## 6.6 i18n (5 idiomas) ✅

- pt-BR, en-US, es, fr, zh-CN + t(), initI18n(), getLocale()

## 6.7 Documentação ✅

- README.md atualizado com quick start, arquitetura, stack

## 6.8 CI/CD ✅

- .github/workflows/ci.yml — jobs: coverage, security, e2e

## Arquivos Modificados:

- `src/index.ts` — exporta telemetry
- `package.json` — scripts: test:coverage, bench
- `packages/shared/src/index.ts` — exporta i18n
- `package.json` (root) — test:core, bench
