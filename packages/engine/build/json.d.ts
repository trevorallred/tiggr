import { type DeepReadonly, type JsonObject, type JsonValue } from './types.js';
export declare function deepFreezePlainData<Value>(value: Value, seen?: WeakSet<object>): DeepReadonly<Value>;
export declare function normalizeJsonObject(value: object, label: string): JsonObject;
export declare function normalizeJsonValue(value: unknown, label: string, seen?: Set<object>): JsonValue;
//# sourceMappingURL=json.d.ts.map