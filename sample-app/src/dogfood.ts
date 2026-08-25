import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { TestRunnerOutput } from 'tiggr'
import { startSampleServer } from './server.js'

const sampleRoot = fileURLToPath(new URL('../', import.meta.url))
const cliPath = fileURLToPath(new URL('../../packages/cli/build/cli.js', import.meta.url))
const running = await startSampleServer()

try {
  const execution = await executeCli(running.baseUrl)
  process.stdout.write(execution.stdout)
  if (execution.stderr) process.stderr.write(execution.stderr)
  if (execution.code !== 0) throw new Error(`tiggr run exited with ${execution.code}`)

  const result = JSON.parse(execution.stdout) as TestRunnerOutput
  if (result.result !== 'pass') throw new Error(`Expected a passing run, received ${result.result}`)
  const ids = result.tests.map(({ id }) => id)
  const expectedIds = ['createProject', 'archiveProject', 'createDocument', 'processDocument', 'summarize', 'tag', 'search']
  if (!expectedIds.every((id) => ids.includes(id))) throw new Error(`Run did not contain the full graph: ${ids.join(', ')}`)
  const summarize = result.tests.find(({ id }) => id === 'summarize')
  const tag = result.tests.find(({ id }) => id === 'tag')
  const search = result.tests.find(({ id }) => id === 'search')
  const archive = result.tests.find(({ id }) => id === 'archiveProject')
  if (summarize?.loop !== tag?.loop || !search?.loop || search.loop <= (summarize?.loop ?? 0)) {
    throw new Error('Run did not preserve fan-out/fan-in scheduling')
  }
  if (!archive?.loop || archive.loop <= search.loop) throw new Error('Resource teardown did not run after its consumers')

  const pollObservations = result.tests
    .flatMap(({ observations }) => observations)
    .filter((observation) => observation.type === 'poll')
  if (!pollObservations.some((observation) => observation.settled === true && Number(observation.attempts) > 1)) {
    throw new Error('Run did not capture genuine multi-attempt polling')
  }

  const invariant = search?.observations.find(
    (observation) => observation.type === 'assertion' && String(observation.expected).startsWith('only documents from')
  )
  if (!invariant || invariant.passed !== true) throw new Error('Search isolation invariant was not observed as passing')
} finally {
  await running.close()
}

function executeCli(baseUrl: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, 'run', '--json'], {
      cwd: sampleRoot,
      env: { ...process.env, TIGGR_BASE_URL: baseUrl },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk
    })
    child.once('error', reject)
    child.once('close', (code) => resolve({ code, stdout, stderr }))
  })
}
