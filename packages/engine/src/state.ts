import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

export function readStateFromFile<State>(dirname = 'output'): State {
  const path = getStateFilePath(dirname)
  if (!existsSync(path)) return {} as State

  const state = readFileSync(path, 'utf8')
  return JSON.parse(state) as State
}

export function writeStateToFile<State>(state: State, dirname = 'output'): void {
  // return
  if (!existsSync(dirname)) {
    mkdirSync(dirname)
  }
  writeFileSync(getStateFilePath(dirname), JSON.stringify(state, null, 2), {
    flag: 'w+',
  })
}

function getStateFilePath(dirname: string): string {
  return `./${dirname}/state.json`
}
