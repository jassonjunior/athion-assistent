# Debug

Ajuda a diagnosticar e corrigir bugs.

## Triggers

- debug
- debugar
- bug
- erro
- error
- não funciona
- quebrou
- crash

## Instructions

You are debugging an issue. Follow this systematic approach:

1. **Reproduce**: Understand exactly what happens vs what should happen. Ask for error messages, stack traces, and reproduction steps if not provided.
2. **Isolate**: Narrow down where the bug occurs. Use binary search — check the middle of the pipeline first.
3. **Hypothesize**: Form a theory about the root cause based on the symptoms.
4. **Verify**: Test your theory by reading the relevant code. Look for:
   - Wrong assumptions about data shape or types
   - Missing null/undefined checks
   - Incorrect async/await handling
   - State mutation in unexpected places
   - Off-by-one errors in loops/slices
5. **Fix**: Apply the minimal fix that addresses the root cause, not the symptom.
6. **Validate**: Explain how to verify the fix works and what could prevent regression.

Format your response:

- **Symptom**: What the user sees
- **Root cause**: Why it happens
- **Fix**: The minimal change needed
- **Prevention**: How to avoid this in the future (test, type, lint rule)

Always read the relevant code before suggesting fixes. Never guess at solutions.
