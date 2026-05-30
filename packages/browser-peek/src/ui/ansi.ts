import { styleText } from 'node:util'

type Format = Parameters<typeof styleText>[0]

function wrap(format: Format) {
  return (value: string): string => styleText(format, value)
}

export const color = {
  bold: wrap('bold'),
  cyan: wrap('cyan'),
  dim: wrap('dim'),
  yellow: wrap('yellow')
}
