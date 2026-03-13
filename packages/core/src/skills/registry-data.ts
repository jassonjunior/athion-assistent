/** registryData
 * Descrição: Catálogo embutido de skills disponíveis para instalação.
 * Cada skill inclui o conteúdo .md completo no campo `content`.
 * Para adicionar novas skills, basta inserir uma nova entrada no array.
 * O formato do content segue o padrão Athion (seções ## Triggers e ## Instructions).
 */

import type { SkillRegistryData } from './types'

/** registryData
 * Descrição: Dados estáticos do catálogo de skills bundled com o Athion
 */
export const registryData: SkillRegistryData = {
  version: 1,
  skills: [
    {
      name: 'architecture-designer',
      description: 'Design de arquitetura de sistemas, ADRs, diagramas e decisões técnicas',
      triggers: ['design architecture', 'system design', 'ADR', 'arquitetura', 'design system'],
      tags: ['architecture', 'design', 'ADR', 'system-design'],
      author: 'athion',
      content: `---
name: architecture-designer
description: Design de arquitetura de sistemas, ADRs, diagramas e decisões técnicas
---

# Architecture Designer

Você é um arquiteto de software sênior. Ao receber uma solicitação de design:

## Processo
1. **Entenda o contexto**: Analise o codebase existente antes de propor
2. **Identifique requisitos**: Funcionais, não-funcionais, restrições
3. **Proponha arquitetura**: Com justificativas claras para cada decisão
4. **Documente trade-offs**: Prós/contras de cada abordagem considerada

## Outputs esperados
- Diagrama de componentes (Mermaid)
- ADR (Architecture Decision Record) quando relevante
- Listagem de APIs/interfaces entre componentes
- Plano de migração se alterando sistema existente

## Princípios
- Prefira simplicidade sobre engenharia excessiva
- Considere operabilidade (observability, deploy, rollback)
- Avalie impacto em performance e escalabilidade
- Documente assumptions explicitamente`,
    },
    {
      name: 'code-reviewer',
      description: 'Review de código com checklist de qualidade, segurança e boas práticas',
      triggers: ['review code', 'code review', 'revisar código', 'PR review'],
      tags: ['review', 'quality', 'security', 'best-practices'],
      author: 'athion',
      content: `---
name: code-reviewer
description: Review de código com checklist de qualidade, segurança e boas práticas
---

# Code Reviewer

Ao revisar código, siga este checklist sistematicamente:

## Correção
- [ ] A lógica está correta para todos os edge cases?
- [ ] Erros são tratados adequadamente?
- [ ] Race conditions ou problemas de concorrência?

## Segurança
- [ ] Input validation em boundaries (user input, APIs externas)
- [ ] Sem SQL injection, XSS, command injection
- [ ] Secrets não hardcoded
- [ ] Autenticação/autorização adequada

## Qualidade
- [ ] Código legível e autoexplicativo
- [ ] Nomes de variáveis/funções claros
- [ ] Sem duplicação desnecessária
- [ ] Complexidade ciclomática aceitável

## Performance
- [ ] Sem N+1 queries
- [ ] Uso adequado de cache/memoização
- [ ] Sem memory leaks (event listeners, timers)

## Formato da Review
- Classifique cada issue: 🔴 Blocker | 🟡 Suggestion | 🟢 Nitpick
- Sugira correção concreta para cada issue
- Elogie padrões bem implementados`,
    },
    {
      name: 'commit-message',
      description: 'Gerar mensagens de commit seguindo Conventional Commits',
      triggers: ['commit', 'commitar', 'git commit', 'mensagem de commit'],
      tags: ['git', 'commit', 'conventional-commits'],
      author: 'athion',
      content: `---
name: commit-message
description: Gerar mensagens de commit seguindo Conventional Commits
---

# Commit Message Generator

Analise as mudanças staged e gere uma mensagem de commit seguindo Conventional Commits:

## Formato
\`\`\`
<type>(<scope>): <description>

[body opcional]

[footer opcional]
\`\`\`

## Tipos
- **feat**: Nova funcionalidade
- **fix**: Correção de bug
- **refactor**: Refatoração sem mudança de comportamento
- **docs**: Documentação
- **test**: Testes
- **chore**: Manutenção, dependências
- **perf**: Melhoria de performance
- **ci**: CI/CD

## Regras
- Description em lowercase, sem ponto final, max 72 chars
- Scope indica o módulo/componente afetado
- Body explica o "porquê", não o "o quê"
- Breaking changes: footer com BREAKING CHANGE:`,
    },
    {
      name: 'refactoring',
      description: 'Guia para refatoração segura com design patterns',
      triggers: ['refactor', 'refatorar', 'clean code', 'melhorar código'],
      tags: ['refactoring', 'clean-code', 'patterns', 'quality'],
      author: 'athion',
      content: `---
name: refactoring
description: Guia para refatoração segura com design patterns
---

# Refactoring Guide

Ao refatorar código:

## Processo Seguro
1. **Entenda primeiro**: Leia e compreenda o código existente completamente
2. **Testes antes**: Garanta cobertura de testes antes de alterar
3. **Passos pequenos**: Faça uma mudança por vez, verificando após cada uma
4. **Preserve comportamento**: O resultado externo deve ser idêntico

## Padrões Comuns
- **Extract Method**: Quebre funções longas em funções menores
- **Extract Class**: Separe responsabilidades
- **Replace Conditional with Polymorphism**: Elimine switches complexos
- **Introduce Parameter Object**: Agrupe parâmetros relacionados
- **Replace Magic Numbers**: Use constantes nomeadas

## Red Flags para Refatorar
- Função > 30 linhas
- Classe > 300 linhas
- Mais de 3 níveis de indentação
- Duplicação de código
- Feature envy (método usa mais dados de outra classe)

## NÃO refatore quando
- Sem testes de cobertura
- Prazo apertado sem margem
- Código que será deletado em breve`,
    },
    {
      name: 'test-writer',
      description: 'Escrever testes unitários e de integração eficazes',
      triggers: ['test', 'testes', 'escrever teste', 'write test', 'testing'],
      tags: ['testing', 'unit-test', 'integration-test', 'TDD'],
      author: 'athion',
      content: `---
name: test-writer
description: Escrever testes unitários e de integração eficazes
---

# Test Writer

Ao escrever testes, siga estas práticas:

## Estrutura (AAA)
- **Arrange**: Configure o cenário
- **Act**: Execute a ação sendo testada
- **Assert**: Verifique o resultado

## Naming Convention
\`\`\`
it('should <expected behavior> when <condition>')
\`\`\`

## O que testar
- Happy path (fluxo normal)
- Edge cases (null, undefined, empty, limites)
- Error paths (exceções, erros de rede)
- Boundary values (0, -1, MAX_INT)

## Princípios
- Um conceito por teste
- Testes independentes (sem dependência de ordem)
- Sem lógica no teste (sem if/for/try-catch)
- Mock apenas boundaries externos (APIs, DB, filesystem)
- Prefira testes de integração para fluxos complexos

## Anti-patterns a evitar
- Testes que testam a implementação (não o comportamento)
- Testes frágeis que quebram com refatoração interna
- Testes com setup complexo demais (indica design problem)`,
    },
    {
      name: 'bug-fixer',
      description: 'Diagnóstico e correção sistemática de bugs',
      triggers: ['bug', 'fix bug', 'corrigir bug', 'debug', 'não funciona'],
      tags: ['debugging', 'bug-fix', 'troubleshooting'],
      author: 'athion',
      content: `---
name: bug-fixer
description: Diagnóstico e correção sistemática de bugs
---

# Bug Fixer

Ao diagnosticar e corrigir bugs:

## Processo de Diagnóstico
1. **Reproduza**: Confirme o bug com passos concretos
2. **Isole**: Encontre o menor caso que reproduz
3. **Rastreie**: Siga o fluxo de dados do input até o output errado
4. **Identifique**: Encontre a causa raiz (não o sintoma)
5. **Corrija**: Mude o mínimo necessário
6. **Verifique**: Confirme que corrigiu e não quebrou nada

## Técnicas
- Leia o stack trace de baixo para cima
- Use binary search em commits (git bisect)
- Adicione logging temporário nos pontos suspeitos
- Verifique assumptions com assertions
- Reproduza em ambiente isolado

## Ao reportar a correção
- Descreva a causa raiz (não o sintoma)
- Explique por que a correção funciona
- Liste cenários testados
- Mencione riscos de regressão`,
    },
    {
      name: 'api-designer',
      description: 'Design de APIs REST e GraphQL com boas práticas',
      triggers: ['API', 'REST', 'GraphQL', 'endpoint', 'design API'],
      tags: ['api', 'rest', 'graphql', 'design'],
      author: 'athion',
      content: `---
name: api-designer
description: Design de APIs REST e GraphQL com boas práticas
---

# API Designer

Ao projetar APIs:

## REST Principles
- Use substantivos no plural para recursos (/users, /orders)
- Verbos HTTP corretos: GET (read), POST (create), PUT (replace), PATCH (update), DELETE
- Status codes adequados: 200, 201, 204, 400, 401, 403, 404, 409, 422, 500
- Paginação: cursor-based para grandes datasets
- Versionamento: /v1/ no path ou header Accept-Version

## Request/Response
- Content-Type: application/json
- Envelope consistente: { data, meta, errors }
- Filtros via query params: ?status=active&sort=-created_at
- Include/expand para relacionamentos: ?include=author,comments

## Segurança
- Autenticação via Bearer token (não query param)
- Rate limiting com headers X-RateLimit-*
- CORS configurado adequadamente
- Input validation em todo endpoint

## Documentação
- OpenAPI/Swagger spec para cada endpoint
- Exemplos de request/response
- Códigos de erro documentados`,
    },
    {
      name: 'documentation',
      description: 'Gerar documentação técnica clara e útil',
      triggers: ['documentation', 'documentar', 'docs', 'README', 'documentação'],
      tags: ['documentation', 'docs', 'README', 'technical-writing'],
      author: 'athion',
      content: `---
name: documentation
description: Gerar documentação técnica clara e útil
---

# Documentation Writer

Ao gerar documentação:

## Tipos de Docs
- **README**: Overview, setup, usage rápido
- **API Docs**: Endpoints, params, responses, errors
- **Architecture**: Decisões, diagramas, trade-offs
- **Guides**: Passo a passo para tarefas comuns
- **ADR**: Architecture Decision Records

## Princípios
- Escreva para o leitor, não para você
- Comece pelo "por quê" antes do "como"
- Exemplos concretos > descrições abstratas
- Mantenha atualizado (docs desatualizados são piores que nenhum doc)
- Link para código fonte quando possível

## Estrutura README
1. O que é (1 parágrafo)
2. Quick start (< 5 minutos)
3. Instalação detalhada
4. Uso / API
5. Configuração
6. Contribuindo
7. Licença`,
    },
    {
      name: 'security-audit',
      description: 'Auditoria de segurança baseada em OWASP Top 10',
      triggers: ['security', 'segurança', 'audit', 'vulnerabilidade', 'OWASP'],
      tags: ['security', 'audit', 'OWASP', 'vulnerability'],
      author: 'athion',
      content: `---
name: security-audit
description: Auditoria de segurança baseada em OWASP Top 10
---

# Security Auditor

Ao auditar código, verifique contra OWASP Top 10:

## Checklist
1. **Injection**: SQL, NoSQL, OS command, LDAP injection
2. **Broken Auth**: Credenciais hardcoded, sessões fracas
3. **Sensitive Data**: Dados em plain text, logs com PII
4. **XXE**: XML parsing inseguro
5. **Broken Access Control**: IDOR, privilege escalation
6. **Misconfiguration**: Headers ausentes, debug mode em prod
7. **XSS**: Reflected, stored, DOM-based
8. **Insecure Deserialization**: Untrusted input deserialized
9. **Known Vulnerabilities**: Dependências desatualizadas
10. **Insufficient Logging**: Sem audit trail

## Formato do Report
Para cada finding:
- **Severidade**: Critical / High / Medium / Low
- **Localização**: Arquivo e linha
- **Descrição**: O que está errado
- **Impacto**: O que um atacante pode fazer
- **Remediação**: Como corrigir (com código)`,
    },
    {
      name: 'performance',
      description: 'Otimização de performance e profiling',
      triggers: ['performance', 'otimizar', 'lento', 'slow', 'optimize'],
      tags: ['performance', 'optimization', 'profiling'],
      author: 'athion',
      content: `---
name: performance
description: Otimização de performance e profiling
---

# Performance Optimizer

Ao otimizar performance:

## Processo
1. **Meça primeiro**: Não otimize sem dados
2. **Identifique bottleneck**: Profile para encontrar o hotspot real
3. **Otimize o crítico**: Foque nos 20% que causam 80% do impacto
4. **Meça de novo**: Confirme a melhoria com números

## Padrões Comuns
- **Caching**: Memoize computações caras, use cache em layers
- **Lazy loading**: Carregue sob demanda, não upfront
- **Batching**: Agrupe operações I/O (queries, requests)
- **Indexação**: Índices adequados no banco de dados
- **Pooling**: Reutilize conexões (DB, HTTP)

## Frontend
- Bundle splitting e code splitting
- Virtualização de listas longas
- Debounce/throttle em event handlers
- Image optimization (lazy load, webp, srcset)

## Backend
- N+1 queries → Eager loading / DataLoader
- Pagination cursor-based para grandes datasets
- Background jobs para operações lentas
- Connection pooling para DB`,
    },
    {
      name: 'database-design',
      description: 'Modelagem de banco de dados e queries eficientes',
      triggers: ['database', 'banco de dados', 'SQL', 'schema', 'modelagem'],
      tags: ['database', 'SQL', 'schema', 'modeling'],
      author: 'athion',
      content: `---
name: database-design
description: Modelagem de banco de dados e queries eficientes
---

# Database Designer

Ao projetar banco de dados:

## Modelagem
- Normalize até 3NF, denormalize conscientemente para performance
- Primary keys: UUID ou auto-increment (depende do caso)
- Índices em colunas usadas em WHERE, JOIN, ORDER BY
- Constraints: NOT NULL, UNIQUE, FOREIGN KEY, CHECK

## Naming
- Tabelas: plural, snake_case (users, order_items)
- Colunas: singular, snake_case (created_at, user_id)
- Índices: idx_{table}_{columns} (idx_users_email)
- Foreign keys: {referenced_table}_id (user_id)

## Migrations
- Sempre reversíveis (up + down)
- Sem data loss em produção
- Teste com volume realista antes de deploy
- Considere zero-downtime migrations

## Performance
- EXPLAIN ANALYZE em queries suspeitas
- Evite SELECT * — liste colunas
- Use prepared statements
- Pagination com cursor, não OFFSET`,
    },
    {
      name: 'devops',
      description: 'CI/CD, Docker, infraestrutura e deploy',
      triggers: ['devops', 'CI/CD', 'Docker', 'deploy', 'infraestrutura', 'pipeline'],
      tags: ['devops', 'docker', 'ci-cd', 'deploy', 'infrastructure'],
      author: 'athion',
      content: `---
name: devops
description: CI/CD, Docker, infraestrutura e deploy
---

# DevOps Engineer

Ao configurar infraestrutura e CI/CD:

## Docker
- Multi-stage builds para imagens menores
- .dockerignore para excluir node_modules, .git
- Non-root user no container
- Health checks definidos
- Layer caching otimizado (COPY package.json antes do código)

## CI/CD Pipeline
1. **Lint + Format**: Rápido, falha cedo
2. **Build**: Compila e verifica tipos
3. **Test**: Unit → Integration → E2E
4. **Security**: Dependency audit, SAST
5. **Deploy**: Staging → Production com gates

## Deploy
- Blue-green ou canary deployment
- Rollback automático em caso de falha
- Health checks post-deploy
- Feature flags para releases graduais

## Monitoring
- Logs estruturados (JSON)
- Métricas: latência, throughput, error rate
- Alertas baseados em SLOs
- Dashboards para visibilidade`,
    },
    {
      name: 'typescript-expert',
      description: 'TypeScript avançado — tipos genéricos, utility types, patterns',
      triggers: ['typescript', 'TS', 'tipos', 'generics', 'type-safe'],
      tags: ['typescript', 'types', 'generics', 'advanced'],
      author: 'athion',
      content: `---
name: typescript-expert
description: TypeScript avançado — tipos genéricos, utility types, patterns
---

# TypeScript Expert

Ao escrever TypeScript avançado:

## Princípios
- Tipo mais específico possível (evite any/unknown quando possível)
- Inferência > anotação explícita (deixe TS inferir quando óbvio)
- Discriminated unions para state machines
- Branded types para IDs (UserId vs OrderId)

## Patterns Úteis
- \`satisfies\` para validar tipos sem widening
- \`as const\` para literals exatos
- Mapped types para transformações
- Template literal types para strings tipadas
- Conditional types para lógica no type system

## Utility Types
- Partial<T>, Required<T>, Readonly<T>
- Pick<T, K>, Omit<T, K>
- Record<K, V>, Extract<T, U>, Exclude<T, U>
- ReturnType<T>, Parameters<T>, Awaited<T>

## Anti-patterns
- Evite enums — use union de strings ou as const
- Evite type assertions (as) — use type guards
- Evite @ts-ignore — corrija o tipo
- Evite interface merging acidental`,
    },
  ],
}
