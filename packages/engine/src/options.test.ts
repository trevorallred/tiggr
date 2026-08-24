import { updateOptions } from './options'

describe('updateOptions', () => {
  const initial = {}
  test('dryRun arg', () => {
    addArgs(['--dryRun'])
    const result = updateOptions({ initial })
    expect(result.dryRun).toBe(true)
  })

  test('dryRun default', () => {
    addArgs()
    const result = updateOptions({ initial, dryRun: true })
    expect(result.dryRun).toBe(true)
  })

  test('exclude', () => {
    addArgs(['--exclude', 'a, b'])
    const result = updateOptions({ initial, exclude: ['a', 'c'] })
    expect(result.exclude).toEqual(['a', 'b', 'c'])
  })

  test('include', () => {
    addArgs(['--include=a,b'])
    const result = updateOptions({ initial, include: ['a', 'c'] })
    expect(result.include).toEqual(['a', 'b', 'c'])
  })
})

function addArgs(args: string[] = []): void {
  process.argv = ['node', 'script', ...args]
}
