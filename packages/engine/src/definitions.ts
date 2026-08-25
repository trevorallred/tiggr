import {
  type ResourceDefinition,
  type SuiteDefinition,
  type TestDefinition,
  type TestId,
} from './types.js'

/** Compile singleton resource sugar into the same dependency/teardown nodes used by the scheduler. */
export function compileDefinitions<Config extends object>(
  suiteDefinitions: SuiteDefinition<Config>[]
): TestDefinition<Config, unknown>[] {
  const resources = suiteDefinitions.filter(isResourceDefinition)
  const tests = suiteDefinitions.filter(
    (definition): definition is TestDefinition<Config, unknown> => !isResourceDefinition(definition)
  )
  const resourcesById = indexResources(resources)
  const expanded = resources.flatMap((current) => [
    current.create,
    {
      ...current.destroy,
      uses: unique([...(current.destroy.uses ?? []), current.id]),
      tearsDown: current.create.id,
    },
  ])
  return [...expanded, ...tests].map((definition) => addResourceDependencies(definition, resourcesById))
}

function indexResources<Config extends object>(
  resources: ResourceDefinition<Config, unknown, unknown>[]
): Map<TestId, ResourceDefinition<Config, unknown, unknown>> {
  const resourcesById = new Map<TestId, ResourceDefinition<Config, unknown, unknown>>()
  for (const current of resources) {
    if (resourcesById.has(current.id)) throw new Error(`Duplicate resource id: ${current.id}`)
    if (current.create.tearsDown) throw new Error(`Resource ${current.id} create test cannot tear down another test`)
    if (current.destroy.tearsDown) throw new Error(`Resource ${current.id} destroy test cannot declare tearsDown`)
    resourcesById.set(current.id, current)
  }
  return resourcesById
}

function addResourceDependencies<Config extends object>(
  definition: TestDefinition<Config, unknown>,
  resourcesById: Map<TestId, ResourceDefinition<Config, unknown, unknown>>
): TestDefinition<Config, unknown> {
  const resourceDependencies = (definition.uses ?? []).flatMap((resourceId) => {
    const current = resourcesById.get(resourceId)
    if (!current) throw new Error(`Resource ${resourceId} not found (used by ${definition.id})`)
    return definition.id === current.destroy.id ? [] : [current.create.id]
  })
  return {
    ...definition,
    ...(resourceDependencies.length === 0 && definition.dependsOn === undefined
      ? {}
      : { dependsOn: unique([...(definition.dependsOn ?? []), ...resourceDependencies]) }),
  }
}

function isResourceDefinition<Config extends object>(
  definition: SuiteDefinition<Config>
): definition is ResourceDefinition<Config, unknown, unknown> {
  return 'kind' in definition && definition.kind === 'resource'
}

function unique<Value>(values: Value[]): Value[] {
  return [...new Set(values)]
}

export function validateDefinitions<Config extends object>(definitions: TestDefinition<Config, unknown>[]): void {
  const definitionsById = indexDefinitions(definitions)
  const visited = new Set<TestId>()
  const active = new Set<TestId>()
  const path: TestId[] = []
  function visit(id: TestId): void {
    if (active.has(id)) throwCycle(path, id)
    if (visited.has(id)) return
    active.add(id)
    path.push(id)
    for (const referencedId of referencedIds(definitionsById.get(id))) visit(referencedId)
    path.pop()
    active.delete(id)
    visited.add(id)
  }
  for (const { id } of definitions) visit(id)
}

function indexDefinitions<Config extends object>(
  definitions: TestDefinition<Config, unknown>[]
): Map<TestId, TestDefinition<Config, unknown>> {
  const definitionsById = new Map<TestId, TestDefinition<Config, unknown>>()
  for (const definition of definitions) {
    if (definitionsById.has(definition.id)) throw new Error(`Duplicate test id: ${definition.id}`)
    definitionsById.set(definition.id, definition)
  }
  for (const definition of definitions) {
    for (const referencedId of referencedIds(definition)) {
      if (!definitionsById.has(referencedId)) throw new Error(`Test ${referencedId} not found`)
    }
  }
  return definitionsById
}

function referencedIds<Config extends object>(definition?: TestDefinition<Config, unknown>): TestId[] {
  return [...(definition?.dependsOn ?? []), ...(definition?.tearsDown ? [definition.tearsDown] : [])]
}

function throwCycle(path: TestId[], id: TestId): never {
  const cycleStart = path.indexOf(id)
  throw new Error(`Circular dependency: ${[...path.slice(cycleStart), id].join(' -> ')}`)
}
