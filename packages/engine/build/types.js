/** Define a test while retaining inference for its config and output types. */
export function test(definition) {
    return definition;
}
/** Define a singleton lifecycle that runTests compiles into ordinary DAG nodes. */
export function resource(definition) {
    return { kind: 'resource', ...definition };
}
