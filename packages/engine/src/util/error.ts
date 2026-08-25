// Minimal standalone stand-in for `messageFromError` from `@terros/common`. The original also
// special-cases Terros-specific `TantalimError`/`APIError` classes that don't exist outside the
// sales monorepo; this keeps only the generic Error/string/object handling tigger needs to turn a
// caught `evaluate()` failure into a display string.
export function messageFromError(error: unknown): string | undefined {
  if (error === undefined) return
  if (error === null) return
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') return error.message
    if ('error' in error && typeof error.error === 'string') return error.error
  }
  if (typeof error === 'string') return error
  return 'unknown error type'
}
