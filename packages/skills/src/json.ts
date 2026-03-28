export function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

export function requireText(input: unknown, label: string): string {
  if (typeof input !== 'string') {
    throw new Error(`${label} must be a string`)
  }

  const value = input.trim()
  if (!value) {
    throw new Error(`${label} must not be empty`)
  }

  return value
}

export function optionalText(input: unknown, label: string): string | undefined {
  if (input === undefined || input === null) {
    return undefined
  }

  if (typeof input !== 'string') {
    throw new Error(`${label} must be a string`)
  }

  const value = input.trim()
  return value || undefined
}

export function omitUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T
}

export function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
