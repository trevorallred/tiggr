// Minimal standalone stand-in for `isEmpty`/`isNotEmpty` from `@terros/common`, ported verbatim
// since tigger's dependency/skip logic (`main.ts`) relies on their exact semantics for arrays,
// strings, and objects — not just falsiness.
export function isEmpty<T>(val: T | undefined | null): val is undefined | null {
  if (val === undefined) return true
  if (val === null) return true
  if (typeof val === 'string') {
    if (val.trim().length === 0) return true
    return false
  }
  if (typeof val === 'number') {
    if (Number.isNaN(val)) return true
    if (val === 0) return true
    return false
  }
  if (Array.isArray(val)) {
    return val.length === 0
  }
  if (typeof val === 'boolean') {
    return false
  }
  if (typeof val === 'object') {
    if (val instanceof Map) return val.size === 0
    if (val instanceof Set) return val.size === 0
    if (Object.values(val).every(isNotDefined)) return true
    if (Object.keys(val).length > 0) return false
    try {
      return JSON.stringify(val) === '{}'
    } catch (e) {
      return false
    }
  }
  throw new Error(`isEmpty is not implemented for ${typeof val} with value ${val}`)
}

export function isNotEmpty<T>(val: T | undefined): val is T {
  return !isEmpty(val)
}

function isDefined<T>(argument: T | undefined | null): argument is T {
  return argument !== undefined && argument !== null
}

function isNotDefined<T>(argument: T | undefined | null): argument is undefined | null {
  return !isDefined(argument)
}
