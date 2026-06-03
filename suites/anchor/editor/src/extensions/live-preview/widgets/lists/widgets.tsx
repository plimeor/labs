import { Decoration, type EditorView, WidgetType } from '@codemirror/view'

import { disposeSolidWidget, renderSolidWidget } from '../../../../rendering/solid-widget'
import { ListMarker } from './components/ListMarker'
import { TaskCheckbox } from './components/TaskCheckbox'

export class TaskCheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number
  ) {
    super()
  }

  override eq(other: TaskCheckboxWidget): boolean {
    return other.checked === this.checked && other.from === this.from
  }

  toDOM(view: EditorView): HTMLElement {
    return renderSolidWidget(() =>
      TaskCheckbox({
        checked: this.checked,
        onToggle: event => {
          event.preventDefault()
          const marker = this.checked ? '[x]' : '[ ]'
          const replacement = this.checked ? '[ ]' : '[x]'
          const slice = view.state.doc.sliceString(this.from, this.from + 3)
          if (slice === marker) {
            view.dispatch({
              changes: { from: this.from, insert: replacement, to: this.from + 3 }
            })
          }
        }
      })
    )
  }

  override destroy(dom: HTMLElement): void {
    disposeSolidWidget(dom)
  }

  override ignoreEvent(): boolean {
    return false
  }
}

export class ListMarkerWidget extends WidgetType {
  override eq(other: ListMarkerWidget): boolean {
    return other instanceof ListMarkerWidget
  }

  toDOM(): HTMLElement {
    return renderSolidWidget(() => ListMarker())
  }

  override destroy(dom: HTMLElement): void {
    disposeSolidWidget(dom)
  }
}

export function taskCheckboxDecoration(checked: boolean, from: number): Decoration {
  return Decoration.replace({ widget: new TaskCheckboxWidget(checked, from) })
}

export function listMarkerDecoration(): Decoration {
  return Decoration.replace({ widget: new ListMarkerWidget() })
}
