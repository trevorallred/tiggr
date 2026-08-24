import { type TestRunnerOutput, type PassFail } from '../types'
import * as color from './color'
import { simplifyRunnerOutput } from './reduce'
import { type TestRunSummary } from './types'

export function printTestOutput<T>(raw: TestRunnerOutput<T>): string {
  const { showSkipped = false } = raw
  const input = simplifyRunnerOutput(raw)
  const { tags, totalDuration, speedUp, failed, tests } = input

  const output: string[] = []
  function addLine(line = ''): void {
    output.push(line)
  }

  if (tags) {
    addLine(`Tags:  ${color.gray(stringsToArray(tags))}`)
    addLine()
  }

  addLine(failed ? color.redBg(' FAIL ') : color.greenBg(' PASS '))
  addLine()

  let lastLoop = 0
  tests.forEach((t) => {
    if (t.passed === 'pass' || (t.passed === 'skip' && !showSkipped)) return
    if (t.loop > lastLoop) {
      addLine(color.gray('   Loop ' + t.loop))
      lastLoop = t.loop
    }
    const summary = `${t.id} (${t.duration}ms) ${t.output}`
    addLine(`      ${passingSymbol[t.passed]} ${color.gray(summary)}`)
  })

  addLine()
  addLine(buildTestSummaryOutput(input))

  if (totalDuration) {
    addLine(`Duration: ${totalDuration}, ${speedUp}% speed up with Tigger`)
  }

  return output.join('\n')
}

/** Example: Tests: 53 passed, 53 total */
function buildTestSummaryOutput({ passed, failed, skipped }: TestRunSummary): string {
  const output = []

  if (failed) {
    output.push(`Tests: ${color.red(`${failed} failed`)}`)
    output.push(color.green(`${passed} passed`))
  } else {
    output.push(`Tests: ${color.green(`${passed} passed`)}`)
  }

  if (skipped > 0) output.push(color.yellow(`${skipped} skipped`))

  output.push(`${passed + failed + skipped} total`)

  return output.join(', ')
}

function stringsToArray(values: string[]): string {
  return `[ ${values.map((v) => `"${v}"`).join(', ')} ]`
}

const passingSymbol: Record<PassFail, string> = {
  pass: color.green('✓'),
  fail: color.red('✗'),
  skip: color.yellow('○'),
}
