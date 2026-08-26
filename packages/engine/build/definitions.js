/** Compile singleton resource sugar into the same dependency/teardown nodes used by the scheduler. */
export function compileDefinitions(suiteDefinitions) {
    const resources = suiteDefinitions.filter(isResourceDefinition);
    const tests = suiteDefinitions.filter((definition) => !isResourceDefinition(definition));
    const resourcesById = indexResources(resources);
    const expanded = resources.flatMap((current) => [
        current.create,
        {
            ...current.destroy,
            uses: unique([...(current.destroy.uses ?? []), current.id]),
            tearsDown: current.create.id,
        },
    ]);
    return [...expanded, ...tests].map((definition) => addResourceDependencies(definition, resourcesById));
}
function indexResources(resources) {
    const resourcesById = new Map();
    for (const current of resources) {
        if (resourcesById.has(current.id))
            throw new Error(`Duplicate resource id: ${current.id}`);
        if (current.create.tearsDown)
            throw new Error(`Resource ${current.id} create test cannot tear down another test`);
        if (current.destroy.tearsDown)
            throw new Error(`Resource ${current.id} destroy test cannot declare tearsDown`);
        resourcesById.set(current.id, current);
    }
    return resourcesById;
}
function addResourceDependencies(definition, resourcesById) {
    const resourceDependencies = (definition.uses ?? []).flatMap((resourceId) => {
        const current = resourcesById.get(resourceId);
        if (!current)
            throw new Error(`Resource ${resourceId} not found (used by ${definition.id})`);
        return definition.id === current.destroy.id ? [] : [current.create.id];
    });
    return {
        ...definition,
        ...(resourceDependencies.length === 0 && definition.dependsOn === undefined
            ? {}
            : { dependsOn: unique([...(definition.dependsOn ?? []), ...resourceDependencies]) }),
    };
}
function isResourceDefinition(definition) {
    return 'kind' in definition && definition.kind === 'resource';
}
function unique(values) {
    return [...new Set(values)];
}
export function validateDefinitions(definitions) {
    const definitionsById = indexDefinitions(definitions);
    const visited = new Set();
    const active = new Set();
    const path = [];
    function visit(id) {
        if (active.has(id))
            throwCycle(path, id);
        if (visited.has(id))
            return;
        active.add(id);
        path.push(id);
        for (const referencedId of referencedIds(definitionsById.get(id)))
            visit(referencedId);
        path.pop();
        active.delete(id);
        visited.add(id);
    }
    for (const { id } of definitions)
        visit(id);
}
function indexDefinitions(definitions) {
    const definitionsById = new Map();
    for (const definition of definitions) {
        if (definitionsById.has(definition.id))
            throw new Error(`Duplicate test id: ${definition.id}`);
        definitionsById.set(definition.id, definition);
    }
    for (const definition of definitions) {
        for (const referencedId of referencedIds(definition)) {
            if (!definitionsById.has(referencedId))
                throw new Error(`Test ${referencedId} not found`);
        }
    }
    return definitionsById;
}
function referencedIds(definition) {
    return [...(definition?.dependsOn ?? []), ...(definition?.tearsDown ? [definition.tearsDown] : [])];
}
function throwCycle(path, id) {
    const cycleStart = path.indexOf(id);
    throw new Error(`Circular dependency: ${[...path.slice(cycleStart), id].join(' -> ')}`);
}
