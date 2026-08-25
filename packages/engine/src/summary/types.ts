import { type PassFail } from '../types.js'

export type TestRunSummary = {
  tags?: string[]
  tests: TestSummary[]
  totalDuration: string
  speedUp: number
  passed: number
  failed: number
  skipped: number
}

export type TestSummary = {
  id: string
  loop: number
  passed: PassFail
  duration: number
  output?: string
}
