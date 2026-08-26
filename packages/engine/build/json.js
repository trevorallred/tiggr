export function deepFreezePlainData(value, seen = new WeakSet()) {
    if (value === null || typeof value !== 'object')
        return value;
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
        return value;
    }
    if (seen.has(value))
        return value;
    seen.add(value);
    for (const nestedValue of Object.values(value))
        deepFreezePlainData(nestedValue, seen);
    return Object.freeze(value);
}
export function normalizeJsonObject(value, label) {
    const normalized = normalizeJsonValue(value, label);
    if (Array.isArray(normalized) || normalized === null || typeof normalized !== 'object') {
        throw new Error(`${label} must be a JSON object`);
    }
    return normalized;
}
export function normalizeJsonValue(value, label, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            throw new Error(`${label} contains a non-finite number`);
        return value;
    }
    if (typeof value !== 'object')
        throw new Error(`${label} contains a non-JSON value`);
    if (seen.has(value))
        throw new Error(`${label} contains a circular reference`);
    seen.add(value);
    try {
        if (Array.isArray(value))
            return value.map((item) => normalizeJsonValue(item, label, seen));
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            throw new Error(`${label} contains a non-plain object`);
        }
        return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, normalizeJsonValue(nestedValue, label, seen)]));
    }
    finally {
        seen.delete(value);
    }
}
