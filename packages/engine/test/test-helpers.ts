import { type TestDefinition } from '../src/types.js'

export type Config = { baseUrl: string; headers?: { authorization: string } }

export const config: Config = { baseUrl: 'https://example.test' }
export const runs: string[] = []

export function resetRuns(): void {
  runs.length = 0
}

export function stubTest(id: string, partial: Partial<TestDefinition<Config>> = {}): TestDefinition<Config> {
  return {
    id,
    run: () => {
      runs.push(id)
    },
    ...partial,
  }
}
