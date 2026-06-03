import { Decoration, WidgetType } from '@codemirror/view'

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
    return TagChip({ raw: this.raw, value: this.value })
  }
}

export function tagDecoration(raw: string, value: string): Decoration {
  return Decoration.replace({ widget: new TagWidget(raw, value) })
}
