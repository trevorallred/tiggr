import { getArgs } from './args'
import { type RunTestsOptions } from './types'
import { Logger } from './util/logger'

const logger = new Logger('options')
logger.level = 'info'

export function updateOptions<T>(options: RunTestsOptions<T>): RunTestsOptions<T> {
  const response = cloneOptions(options)

  const args = getArgs()
  logger.verbose('args', args)
  response.dryRun = args.dryRun ?? response.dryRun ?? false
  response.exclude = mergeArrays(response.exclude, toStringArray(args.exclude))
  response.include = mergeArrays(response.include, toStringArray(args.include))
  response.showSkipped = args.showSkipped
  logger.verbose('response', response)
  return response
}

function cloneOptions<T>(options: RunTestsOptions<T>): RunTestsOptions<T> {
  return {
    ...options,
    initial: {
      ...options.initial,
    },
  }
}

function toStringArray(val?: string): string[] {
  if (!val) return []
  return val.split(',').map((val) => val.trim())
}

function mergeArrays(a: string[] = [], b: string[] = []): string[] {
  return [...new Set([...a, ...b])].toSorted()
}
