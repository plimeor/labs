import { type EditorView, WidgetType } from '@codemirror/view'

import { disposeSolidWidget, renderSolidWidget } from '../../rendering/solid-widget'
import { CodeCopyButton } from './components/CodeCopyButton'
import { CodeLanguageLabel, type CodeLanguageLabelElement } from './components/CodeLanguageLabel'

export class LanguageLabelWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly value: string,
    readonly infoFrom: number,
    readonly infoTo: number
  ) {
    super()
  }

  override eq(other: LanguageLabelWidget): boolean {
    return (
      other.label === this.label &&
      other.value === this.value &&
      other.infoFrom === this.infoFrom &&
      other.infoTo === this.infoTo
    )
  }

  toDOM(view: EditorView): HTMLElement {
    return CodeLanguageLabel({
      label: this.label,
      value: this.value,
      onLanguageChange: language => updateCodeBlockLanguage(view, this.infoFrom, this.infoTo, language)
    })
  }

  override destroy(dom: HTMLElement): void {
    ;(dom as CodeLanguageLabelElement).__disposeCodeLanguageLabel?.()
  }

  override ignoreEvent(): boolean {
    return true
  }
}

function updateCodeBlockLanguage(view: EditorView, from: number, to: number, language: string): void {
  if (from < 0 || to < from || to > view.state.doc.length) return

  const current = view.state.doc.sliceString(from, to)
  if (current === language) return

  view.dispatch({
    changes: { from, insert: language, to },
    selection: view.state.selection
  })
}

export class CopyButtonWidget extends WidgetType {
  constructor(
    readonly codeText: string,
    readonly blockId: number
  ) {
    super()
  }

  override eq(other: CopyButtonWidget): boolean {
    return other.codeText === this.codeText && other.blockId === this.blockId
  }

  toDOM(): HTMLElement {
    return renderSolidWidget(() => CodeCopyButton({ codeText: this.codeText }))
  }

  override destroy(dom: HTMLElement): void {
    disposeSolidWidget(dom)
  }

  override ignoreEvent(): boolean {
    return false
  }
}
