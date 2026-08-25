import { type TestRunnerOutput, type PassFail, type TestRun } from '../types.js'
import { type TestRunSummary, type TestSummary } from './types.js'

export function simplifyRunnerOutput(input: TestRunnerOutput): TestRunSummary {
  const originalTests = input.tests
  const tests = simplifyTestOutput(originalTests)
  return {
    tags: uniqueTags(originalTests, input.showSkipped),
    tests,
    totalDuration: durationToString(input.duration),
    speedUp: calculationSpeedup(tests, input.duration),
    passed: count(tests, 'pass'),
    failed: count(tests, 'fail'),
    skipped: count(tests, 'skip'),
  }
}

function simplifyTestOutput(tests: TestRun[]): TestSummary[] {
  return [...tests].sort((a, b) => {
    const loopA = a.loop || Number.MAX_SAFE_INTEGER
    const loopB = b.loop || Number.MAX_SAFE_INTEGER
    return loopA - loopB
  }).map((t): TestSummary => {
    return {
      id: t.id,
      duration: t.duration || 0,
      loop: t.loop || 0,
      output: stringifyOutput(t.error ?? t.skipReason ?? t.output),
      passed: t.passed || 'skip',
    }
  })
}

function uniqueTags(allTests: TestRun[], showSkipped?: boolean): string[] {
  const tests = showSkipped ? allTests : allTests.filter((t) => t.passed !== 'skip')
  const tags = tests.flatMap((t) => t.tags || [])
  return [...new Set(tags)]
}

function stringifyOutput(output: unknown): string {
  if (output === undefined) return ''
  if (typeof output === 'string') return output
  return JSON.stringify(output)
}

function calculationSpeedup(tests: TestSummary[], suiteDuration: number): number {
  const totalDuration = tests.map((t) => t.duration).reduce(sum, 0)
  if (totalDuration <= suiteDuration) return 0
  return Math.round(((totalDuration - suiteDuration) / totalDuration) * 100)
}

const sum = (a: number, b: number): number => a + b

function count(tests: TestSummary[], passed: PassFail): number {
  return tests.filter((t) => t.passed === passed).length
}

function durationToString(duration?: number): string {
  if (!duration) return ''
  if (duration > 1000) return `${(duration / 1000).toFixed(1)} seconds`
  return duration + 'ms'
}
