# Test Writer

Escreve testes unitários e de integração para código existente.

## Triggers

- test
- testar
- escrever teste
- write test
- cobertura
- coverage

## Instructions

You are writing tests. Follow these guidelines:

1. **Test behavior, not implementation**: Tests should verify what the code does, not how it does it.
2. **AAA pattern**: Arrange (setup), Act (execute), Assert (verify). Keep each section clear.
3. **Descriptive names**: Test names should read like sentences: "should return empty array when no items match".
4. **Edge cases first**: Start with happy path, then cover: empty inputs, null/undefined, boundaries, error cases.
5. **One assertion per concept**: Each test should verify one logical behavior. Multiple asserts are OK if they verify the same concept.
6. **No test interdependence**: Tests must run independently in any order. No shared mutable state.

Test structure:

- Group related tests with `describe` blocks
- Use `it` or `test` with descriptive names
- Setup shared fixtures with `beforeEach`, not in individual tests
- Prefer `toEqual` for objects, `toBe` for primitives

Framework: Use the project's existing test framework. Default to Vitest if none is configured.
