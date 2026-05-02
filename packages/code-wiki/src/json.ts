export function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

export function stableStringify(input: unknown): string {
  return `${JSON.stringify(sortJsonValue(input), null, 2)}\n`
}

function sortJsonValue(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(sortJsonValue)
  }

  if (!isRecord(input)) {
    return input
  }

  return Object.fromEntries(
    Object.entries(input)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, sortJsonValue(value)])
  )
}
