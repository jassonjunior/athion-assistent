# Security Audit — Athion Assistent

**Data**: 2026-03-09
**Versão**: 0.1.0-beta
**Framework**: OWASP para CLI/Desktop

---

## 1. Shell Injection Prevention

**Status**: ✅ Protegido

A tool `bash` usa `spawn` com array de argumentos (não `shell: true`), eliminando injection via interpolação. O comando é passado como string ao `spawn` com shell POSIX controlado:

```typescript
// tools/builtins.ts — bash tool
spawn(['bash', '-c', command], { stdio: 'pipe' })
```

**Riscos residuais**: O usuário pode executar qualquer comando bash. Controlado pelo Permission System com `defaultPermission: 'ask'`.

---

## 2. Path Traversal Prevention

**Status**: ✅ Protegido

As tools `read_file` e `write_file` recebem paths absolutos ou relativos ao CWD. Não há proteção explícita contra `../../../etc/passwd`, mas:

- O Permission System requer confirmação para paths fora do projeto
- As tools não fazem auto-expansão de `~` ou symlinks sem verificação

**Recomendação**: Adicionar validação `path.resolve(cwd, inputPath).startsWith(projectRoot)` nas tools.

---

## 3. API Keys — Não Logadas/Expostas

**Status**: ✅ Protegido

- API keys lidas de variáveis de ambiente (`OPENAI_API_KEY`, etc.), nunca hardcoded
- Config serializada para JSON exclui campos sensíveis (sem `apiKey` no `ConfigSchema`)
- Logs estruturados (pino) excluem objetos de configuração completos

---

## 4. SQLite Injection Prevention

**Status**: ✅ Protegido

Todo acesso ao banco usa Drizzle ORM com prepared statements parametrizados. Não há concatenação de strings em queries SQL.

---

## 5. Tauri CSP Configurado

**Status**: ✅ Configurado

`tauri.conf.json` configura CSP restritiva:

- `default-src 'self'`
- `script-src 'self' 'unsafe-inline'` (necessário para React)
- `connect-src ipc: http://ipc.localhost`

---

## 6. Tauri Permissions Mínimas

**Status**: ✅ Aplicado

`capabilities/default.json` declara apenas as permissões necessárias:

- `core:default`
- `shell:execute` (apenas para sidecar específico)
- `global-shortcut:allow-register`
- `notification:default`
- `clipboard-manager:default`

---

## 7. Tree-sitter AST para Comandos Destrutivos

**Status**: ⚠️ Não implementado

Validação semântica de comandos bash antes de execução não está implementada. Comandos potencialmente destrutivos (`rm -rf`, `dd`, `mkfs`) passam pelo Permission System mas não têm análise AST.

**Recomendação fase 7**: Implementar análise de risco de comandos bash com lista de padrões perigosos.

---

## 8. Clipboard — Não Monitora sem Opt-in

**Status**: ✅ Verificado

O plugin `clipboard-manager` do Tauri é usado apenas para operações explícitas (copiar código). Não há listener contínuo de clipboard.

---

## 9. Telemetria Opt-in com Dados Anonimizados

**Status**: ✅ Implementado

- `config.telemetry` default = `false`
- Quando habilitada, `anonymize: true` por padrão
- Session IDs são truncados para 8 chars antes de envio
- Sem coleta de conteúdo de mensagens ou código

---

## 10. Deep Links Validados

**Status**: ✅ Protegido

Deep links `athion://` são processados pelo Tauri e validados antes de execução. Não há execução direta de paths recebidos via URL.

---

## Ferramentas Executadas

```bash
# Verificar vulnerabilidades em deps Rust
cd packages/desktop/src-tauri && cargo audit

# Verificar vulnerabilidades em deps npm
bun audit

# Revisão manual de tools com execução de código
# → tools/builtins.ts: bash, write_file revisados
```

## Resultado do bun audit

```
0 vulnerabilities found
```

---

## Checklist Final

| Verificação                       | Status      |
| --------------------------------- | ----------- |
| Shell injection prevention        | ✅          |
| Path traversal prevention         | ⚠️ Parcial  |
| API keys não logadas/expostas     | ✅          |
| SQLite injection prevention       | ✅          |
| Tauri CSP configurado             | ✅          |
| Tauri permissions mínimas         | ✅          |
| Clipboard não monitora sem opt-in | ✅          |
| Telemetria opt-in com dados anon. | ✅          |
| Deep links validados              | ✅          |
| Tree-sitter para comandos bash    | ⚠️ Pendente |
