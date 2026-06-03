import { Decoration, WidgetType } from '@codemirror/view'

import { disposeSolidWidget, renderSolidWidget } from '../../../../rendering/solid-widget'
import { TagChip } from './components/TagChip'

export class TagWidget extends WidgetType {
  constructor(
    readonly raw: string,
    readonly value: string
  ) {
    super()
  }

  override eq(other: TagWidget): boolean {
    return other.raw === this.raw && other.value === this.value
  }

  toDOM(): HTMLElement {
    return renderSolidWidget(() => TagChip({ raw: this.raw, value: this.value }))
  }

  override destroy(dom: HTMLElement): void {
    disposeSolidWidget(dom)
  }
}

export function tagDecoration(raw: string, value: string): Decoration {
  return Decoration.replace({ widget: new TagWidget(raw, value) })
}
