export const config = { baseUrl: 'https://example.test' };
export const runs = [];
export function resetRuns() {
    runs.length = 0;
}
export function stubTest(id, partial = {}) {
    return {
        id,
        run: () => {
            runs.push(id);
        },
        ...partial,
    };
}
