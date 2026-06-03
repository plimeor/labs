interface ComplexMarkdownNoteOptions {
  sections?: number
}

export const complexMarkdownStressNoteSectionCount = 80
export const expandableMarkdownTokensPerStressSection = 12
export const expectedComplexMarkdownStressTokenCount =
  complexMarkdownStressNoteSectionCount * expandableMarkdownTokensPerStressSection

export function createComplexMarkdownNote(options: ComplexMarkdownNoteOptions = {}): string {
  const sections = options.sections ?? complexMarkdownStressNoteSectionCount
  const lines: string[] = [
    '# Anchor stress note',
    '',
    '> This note intentionally mixes task lists, links, wikilinks, inline code, tags, quotes, and code blocks.',
    ''
  ]

  for (let index = 1; index <= sections; index += 1) {
    const padded = String(index).padStart(3, '0')
    const checked = index % 2 === 0 ? 'x' : ' '

    lines.push(`## Section ${padded}: [[Project ${padded}]] #stress/${padded}`)
    lines.push('')
    lines.push(
      `- [${checked}] Review [Design ${padded}](https://example.com/design/${padded}) with [[Owner ${padded}]] and \`serialize-${padded}\` #review`
    )
    lines.push(
      `- [ ] Ship [Docs ${padded}](https://example.com/docs/${padded} "Docs ${padded}") for [[Anchor V${index}]] using \`publish-${padded}\` #docs`
    )
    lines.push(
      `- [ ] Compare **bold ${padded}** and *italic ${padded}* around [Spec ${padded}](https://example.com/spec/${padded}) [[Decision ${padded}]]`
    )
    lines.push('')
    lines.push(
      `> Trace [source ${padded}](https://example.com/source/${padded}) into \`inline-${padded}\` and [[Trace ${padded}]] #quote`
    )
    lines.push('')

    if (index % 8 === 0) {
      lines.push('```ts')
      lines.push(`const section${padded} = "${padded}"`)
      lines.push(`console.log(section${padded})`)
      lines.push('```')
      lines.push('')
    }
  }

  return lines.join('\n').trimEnd()
}

export const complexMarkdownStressNote = createComplexMarkdownNote()
