import { compileDefinitions, runTests } from './main.js'
import { resource, test } from './types.js'
import { config, type Config, resetRuns, runs, stubTest } from '../test/test-helpers.js'

beforeEach(resetRuns)

it('compiles singleton resources into ordinary dependency and teardown nodes', async () => {
  const project = resource<Config, { id: string }>({
    id: 'project',
    create: test({
      id: 'createProject',
      run: () => {
        runs.push('createProject')
        return { id: 'project-1' }
      },
    }),
    destroy: test({
      id: 'archiveProject',
      run: ({ outputs }) => {
        const created = outputs.get<{ id: string }>('createProject')
        runs.push(`archiveProject:${String(created?.id)}`)
      },
    }),
  })
  const definitions = compileDefinitions<Config>([
    project,
    stubTest('left', { uses: ['project'] }),
    stubTest('right', { uses: ['project'] }),
    stubTest('fan-in', { dependsOn: ['left', 'right'] }),
  ])
  expect(definitions.find(({ id }) => id === 'left')?.dependsOn).toEqual(['createProject'])
  expect(definitions.find(({ id }) => id === 'archiveProject')).toMatchObject({
    uses: ['project'],
    tearsDown: 'createProject',
  })
  const result = await runTests(
    [project, stubTest('left', { uses: ['project'] }), stubTest('right', { uses: ['project'] }), stubTest('fan-in', { dependsOn: ['left', 'right'] })],
    { config, includeStartMessage: false }
  )
  expect(runs).toEqual(['createProject', 'left', 'right', 'fan-in', 'archiveProject:project-1'])
  expect(result.tests.map(({ id }) => id)).toEqual(['createProject', 'archiveProject', 'left', 'right', 'fan-in'])
})

it('keeps resource teardown selected when a consumer is included', async () => {
  const project = resource<Config>({
    id: 'project',
    create: stubTest('createProject'),
    destroy: stubTest('archiveProject'),
  })
  const result = await runTests([project, stubTest('consumer', { uses: ['project'] }), stubTest('other')], {
    config,
    include: ['consumer'],
    includeStartMessage: false,
  })
  expect(runs).toEqual(['createProject', 'consumer', 'archiveProject'])
  expect(result.tests.find(({ id }) => id === 'other')?.passed).toBe('skip')
})

it('rejects missing and duplicate singleton resource definitions', () => {
  expect(() => compileDefinitions([stubTest('consumer', { uses: ['missing'] })])).toThrow(
    'Resource missing not found (used by consumer)'
  )
  const one = resource({ id: 'project', create: stubTest('create-one'), destroy: stubTest('destroy-one') })
  const two = resource({ id: 'project', create: stubTest('create-two'), destroy: stubTest('destroy-two') })
  expect(() => compileDefinitions([one, two])).toThrow('Duplicate resource id: project')
})
