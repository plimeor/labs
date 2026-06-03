import { Decoration, WidgetType } from '@codemirror/view'

import { MarkdownLinkChip } from './components/MarkdownLinkChip'
import { WikilinkChip } from './components/WikilinkChip'

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase()
  return !trimmed.startsWith('javascript:') && !trimmed.startsWith('data:')
}

export class WikilinkWidget extends WidgetType {
  constructor(readonly target: string) {
    super()
  }

  override eq(other: WikilinkWidget): boolean {
    return other.target === this.target
  }

  toDOM(): HTMLElement {
    return WikilinkChip({
      target: this.target,
      onOpen: event => {
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).dispatchEvent(
            new CustomEvent('anchor:open-wikilink', {
              bubbles: true,
              detail: { target: this.target }
            })
          )
        }
      }
    })
  }
}

export class MarkdownLinkWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly url: string
  ) {
    super()
  }

  override eq(other: MarkdownLinkWidget): boolean {
    return other.label === this.label && other.url === this.url
  }

  toDOM(): HTMLElement {
    return MarkdownLinkChip({
      label: this.label,
      url: this.url,
      onOpen: event => {
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault()
          if (isSafeUrl(this.url)) {
            window.open(this.url, '_blank', 'noopener,noreferrer')
          }
        }
      }
    })
  }
}

export function markdownLinkDecoration(label: string, url: string): Decoration {
  return Decoration.replace({ widget: new MarkdownLinkWidget(label, url) })
}

export function wikilinkDecoration(target: string): Decoration {
  return Decoration.replace({ widget: new WikilinkWidget(target) })
}
