# Refactor

Reestrutura código mantendo o comportamento existente.

## Triggers

- refactor
- refatorar
- reestruturar
- simplificar
- limpar código
- clean up

## Instructions

You are refactoring code. Follow these principles:

1. **Preserve behavior**: The code must work exactly the same after refactoring. Do not change functionality.
2. **Small steps**: Make one change at a time. Each step should be independently verifiable.
3. **Extract, don't abstract**: Prefer extracting functions/variables over creating abstractions. Only abstract when you see 3+ repetitions.
4. **Naming matters**: Rename to reveal intent. A good name eliminates the need for comments.
5. **Reduce nesting**: Use early returns, guard clauses, and extract helper functions.
6. **Remove dead code**: Delete unused imports, variables, functions, and commented-out code.

Before refactoring, explain:

- What you will change and why
- What behavior is preserved
- What tests should be run to verify

After refactoring, show a before/after comparison of the key changes.
