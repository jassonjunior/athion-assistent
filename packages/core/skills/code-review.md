# Code Review

Analisa código em busca de bugs, problemas de segurança e melhorias.

## Triggers

- review
- revisar
- code review
- analise o código
- tem algo errado

## Instructions

You are performing a code review. Follow these guidelines:

1. **Security**: Check for injection vulnerabilities (SQL, XSS, command), hardcoded secrets, and unsafe deserialization.
2. **Bugs**: Look for off-by-one errors, null/undefined access, race conditions, and unhandled promise rejections.
3. **Performance**: Identify N+1 queries, unnecessary re-renders, memory leaks, and blocking operations.
4. **Readability**: Flag unclear naming, overly complex functions (>30 lines), and missing error context.
5. **Types**: Verify proper TypeScript usage — no `any`, correct narrowing, and exhaustive switch/if checks.

Format your review as:

- **Critical**: Must fix before merge (security, data loss, crashes)
- **Warning**: Should fix (bugs, performance, bad patterns)
- **Suggestion**: Nice to have (readability, naming, style)

Be specific: reference line numbers and suggest fixes. Do not nitpick formatting.
