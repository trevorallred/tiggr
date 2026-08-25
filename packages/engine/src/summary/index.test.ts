import { type TestRunnerOutput, type TestRun } from '../types.js'
import { printTestOutput } from './index.js'

function stubTest(id: string, partial?: Partial<TestRun>): TestRun {
  return {
    id,
    observations: [],
    loop: 1,
    complete: true,
    passed: 'pass',
    duration: 123,
    ...partial,
  }
}

describe('printTestOutput', () => {
  describe('3 tests: pass, fail, skip', () => {
    const input: TestRunnerOutput = {
      runId: 'run-1',
      startedAt: '2026-08-24T00:00:00.000Z',
      completedAt: '2026-08-24T00:00:00.100Z',
      engineVersion: '0.0.0',
      result: 'pass',
      tests: [
        stubTest('test1', { duration: 100, output: 'output1', passed: 'pass' }),
        stubTest('test2', { duration: 100, output: 'output2', passed: 'fail' }),
        stubTest('test3', { duration: 200, output: 'output3', passed: 'skip' }),
      ],
      duration: 100,
    }
    const output = printTestOutput(input)

    it('failed, passed, skipped', () => {
      expect(output).toMatch(
        'Tests: \u001b[31m1 failed\u001b[0m, \u001b[32m1 passed\u001b[0m, \u001b[38;2;255;255;0m1 skipped\u001b[0m, 3 total'
      )
    })
    it('shows failed test details only', () => {
      expect(output).not.toMatch('test1')
      expect(output).not.toMatch('output1')
      expect(output).toMatch('test2')
      expect(output).toMatch('output2')
      expect(output).not.toMatch('test3')
      expect(output).not.toMatch('output3')
    })
    it('Duration and speedup', () => {
      expect(output).toMatch('Duration: 100ms, 75% speed up with Tigger')
    })
  })
  it('1 test with no duration', () => {
    const input: TestRunnerOutput = {
      runId: 'run-1',
      startedAt: '2026-08-24T00:00:00.000Z',
      completedAt: '2026-08-24T00:00:00.100Z',
      engineVersion: '0.0.0',
      result: 'pass',
      tests: [stubTest('test1', { duration: 100, output: 'output1', passed: 'pass' })],
      duration: 0,
    }
    const output = printTestOutput(input)

    expect(output).toMatch('Tests: \u001b[32m1 passed\u001b[0m, 1 total')
    expect(output).not.toMatch('Duration')
  })
  it('2 tests with pass/skip', () => {
    const input: TestRunnerOutput = {
      runId: 'run-1',
      startedAt: '2026-08-24T00:00:00.000Z',
      completedAt: '2026-08-24T00:00:00.100Z',
      engineVersion: '0.0.0',
      result: 'pass',
      tests: [
        stubTest('test1', { duration: 100, output: 'output1', passed: 'pass' }),
        stubTest('test2', { duration: 100, output: 'output2', passed: 'skip' }),
      ],
      duration: 100,
    }
    const output = printTestOutput(input)

    expect(output).not.toMatch('failed')
    expect(output).toMatch('1 passed')
    expect(output).toMatch('1 skipped')
    expect(output).toMatch('2 total')
    expect(output).toMatch('speed up')
  })
})
