/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock bootstrap before importing test-runner
vi.mock('../../../core/src/bootstrap', () => ({
  bootstrap: vi.fn(),
}))

// We need to test the exported functions: listTests, runTest, stopTest
// Since test-runner has module-level state, we need to be careful about isolation
import { listTests, runTest, stopTest } from './test-runner'

describe('test-runner', () => {
  describe('listTests', () => {
    it('should return an array of TestInfo objects', () => {
      const tests = listTests()
      expect(Array.isArray(tests)).toBe(true)
      expect(tests.length).toBeGreaterThan(0)
    })

    it('should have name, agent, and description for each test', () => {
      const tests = listTests()
      for (const test of tests) {
        expect(test).toHaveProperty('name')
        expect(test).toHaveProperty('agent')
        expect(test).toHaveProperty('description')
        expect(typeof test.name).toBe('string')
        expect(typeof test.agent).toBe('string')
        expect(typeof test.description).toBe('string')
      }
    })

    it('should include search-codebase-only test', () => {
      const tests = listTests()
      const found = tests.find((t) => t.name === 'search-codebase-only')
      expect(found).toBeDefined()
      expect(found!.agent).toBe('search')
    })

    it('should include code-reviewer test', () => {
      const tests = listTests()
      const found = tests.find((t) => t.name === 'code-reviewer')
      expect(found).toBeDefined()
      expect(found!.agent).toBe('code-reviewer')
    })

    it('should include explainer test', () => {
      const tests = listTests()
      const found = tests.find((t) => t.name === 'explainer')
      expect(found).toBeDefined()
      expect(found!.agent).toBe('explainer')
    })

    it('should not include userMessage in returned TestInfo', () => {
      const tests = listTests()
      for (const test of tests) {
        expect(test).not.toHaveProperty('userMessage')
      }
    })
  })

  describe('runTest', () => {
    let emit: ReturnType<typeof vi.fn>

    beforeEach(() => {
      emit = vi.fn()
    })

    it('should emit error for non-existent test', async () => {
      await runTest('nonexistent-test', emit)

      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'orch:error',
          message: 'Test "nonexistent-test" not found',
        }),
      )
    })

    it('should include tokens and ts in error for non-existent test', async () => {
      await runTest('nonexistent-test', emit)

      const call = emit.mock.calls[0][0]
      expect(call).toHaveProperty('tokens')
      expect(call).toHaveProperty('ts')
      expect(typeof call.ts).toBe('number')
    })
  })

  describe('stopTest', () => {
    it('should not throw when called without a running test', () => {
      expect(() => stopTest()).not.toThrow()
    })
  })
})
