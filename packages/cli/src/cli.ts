#!/usr/bin/env node

import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import {
  printTestOutput,
  runTests,
  type JsonObject,
  type SuiteDefinition,
  type TestRunnerOutput,
} from 'tiggr'

export type CliOptions = {
  command: 'run'
  ids: string[]
  dryRun: boolean
  include: string[]
  exclude: string[]
  format: 'json' | 'pretty'
}

type SuiteModule = {
  definitions: SuiteDefinition<object>[]
  config: object
  metadata?: JsonObject
}

export function parseCliArgs(args: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      include: { type: 'string', multiple: true, short: 'i' },
      exclude: { type: 'string', multiple: true, short: 'x' },
      json: { type: 'boolean', default: false },
      pretty: { type: 'boolean', default: false },
    },
  })

  const [command, ...ids] = positionals
  if (command !== 'run') throw new Error('Usage: tiggr run [ids...] [--dry-run] [--include <id-or-tag>] [--exclude <id-or-tag>] [--json|--pretty]')
  if (values.json && values.pretty) throw new Error('--json and --pretty cannot be used together')

  return {
    command,
    ids,
    dryRun: values['dry-run'] ?? false,
    include: splitValues(values.include),
    exclude: splitValues(values.exclude),
    format: values.pretty ? 'pretty' : 'json',
  }
}

export async function runCli(args = process.argv.slice(2), cwd = process.cwd()): Promise<number> {
  const options = parseCliArgs(args)
  const suite = await loadSuite(cwd)
  const result = await runTests(suite.definitions, {
    config: suite.config,
    metadata: suite.metadata,
    dryRun: options.dryRun,
    include: unique([...options.ids, ...options.include]),
    exclude: options.exclude,
    includeStartMessage: false,
  })

  process.stdout.write(formatOutput(result, options.format) + '\n')
  return result.result === 'fail' ? 1 : 0
}

export function formatOutput(result: TestRunnerOutput, format: 'json' | 'pretty'): string {
  return format === 'pretty' ? printTestOutput(result) : JSON.stringify(result, null, 2)
}

async function loadSuite(cwd: string): Promise<SuiteModule> {
  const explicit = process.env.TIGGR_CONFIG
  const candidates = explicit ? [resolve(cwd, explicit)] : ['tiggr.config.mjs', 'tiggr.config.js'].map((name) => resolve(cwd, name))
  const configPath = candidates.find(existsSync)
  if (!configPath) throw new Error(`No tiggr.config.mjs or tiggr.config.js found in ${cwd}`)

  const imported = (await import(pathToFileURL(configPath).href)) as { default?: unknown }
  const suite = imported.default
  if (!suite || typeof suite !== 'object' || !('definitions' in suite) || !Array.isArray(suite.definitions)) {
    throw new Error(`${configPath} must default-export { definitions, config }`)
  }
  if (!('config' in suite) || !suite.config || typeof suite.config !== 'object') {
    throw new Error(`${configPath} must provide an object config`)
  }
  return suite as SuiteModule
}

function splitValues(values: string[] | undefined): string[] {
  return values?.flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean) ?? []
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url))) {
  runCli().then(
    (code) => {
      process.exitCode = code
    },
    (error: unknown) => {
      process.stderr.write(`tiggr: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 2
    }
  )
}
