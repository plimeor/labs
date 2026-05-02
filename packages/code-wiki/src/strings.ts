export function splitCommaList(input: string | undefined): string[] | undefined {
  if (!input) {
    return undefined
  }

  const values = input
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  return values.length > 0 ? values : undefined
}
