import { syntaxTree } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { Decoration, type DecorationSet, type PluginValue, ViewPlugin, type ViewUpdate } from '@codemirror/view'

import { DecorationCollector, decorationSetFrom } from '../../rendering/decorations'
import { overlapsSelection } from '../../rendering/selection'
import { languageDisplayName } from './language'
import { CopyButtonWidget, LanguageLabelWidget } from './widgets'

const codeBlockOpenLine = Decoration.line({
  attributes: { 'data-editor-role': 'code-block-open' },
  class: 'anchor-code-block-open'
})

const codeBlockCloseLine = Decoration.line({
  attributes: { 'data-editor-role': 'code-block-close' },
  class: 'anchor-code-block-close'
})

class CodeBlockPlugin implements PluginValue {
  decorations: DecorationSet

  constructor(view: ViewUpdate['view']) {
    this.decorations = this.buildDecorations(view)
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view)
    }
  }

  buildDecorations(view: ViewUpdate['view']): DecorationSet {
    const { doc } = view.state
    const tree = syntaxTree(view.state)
    const collector = new DecorationCollector()
    let blockIndex = 0

    tree.iterate({
      enter(node) {
        if (node.name !== 'FencedCode') return

        const blockFrom = node.from
        const blockTo = node.to

        let codeMarkCount = 0
        node.node.cursor().iterate(child => {
          if (child.name === 'CodeMark') codeMarkCount++
        })
        if (codeMarkCount < 2) return false

        const startLine = doc.lineAt(blockFrom)
        const rawEnd = blockTo - 1 < blockFrom ? blockFrom : blockTo - 1
        const endLine = doc.lineAt(rawEnd)

        let codeInfoFrom = -1
        let codeInfoTo = -1
        node.node.cursor().iterate(child => {
          if (child.name === 'CodeInfo') {
            codeInfoFrom = child.from
            codeInfoTo = child.to
          }
        })

        const infoRaw = codeInfoFrom >= 0 ? doc.sliceString(codeInfoFrom, codeInfoTo).trim() : ''
        const displayLabel = infoRaw ? languageDisplayName(infoRaw) : 'CODE'

        const bodyLines: string[] = []
        for (let ln = startLine.number + 1; ln <= endLine.number - 1; ln++) {
          if (ln >= 1 && ln <= doc.lines) {
            bodyLines.push(doc.line(ln).text)
          }
        }
        const codeText = bodyLines.join('\n')
        const currentBlockId = blockIndex++

        let openingMarkFrom = -1
        let openingMarkTo = -1
        node.node.cursor().iterate(child => {
          if (child.name === 'CodeMark' && openingMarkFrom < 0) {
            openingMarkFrom = child.from
            openingMarkTo = child.to
          }
        })

        const onOpenFence = overlapsSelection(view, startLine.from, startLine.to)

        if (!onOpenFence && openingMarkFrom >= 0) {
          collector.replace(openingMarkFrom, openingMarkTo, Decoration.replace({}), 5)

          if (codeInfoFrom >= 0) {
            collector.replace(
              codeInfoFrom,
              codeInfoTo,
              Decoration.replace({ widget: new LanguageLabelWidget(displayLabel, infoRaw, codeInfoFrom, codeInfoTo) }),
              4
            )
          } else {
            collector.replace(
              openingMarkTo,
              openingMarkTo,
              Decoration.replace({
                widget: new LanguageLabelWidget(displayLabel, infoRaw, openingMarkTo, openingMarkTo)
              }),
              4
            )
          }

          const insertPos = codeInfoFrom >= 0 ? codeInfoTo : openingMarkTo
          collector.replace(
            insertPos,
            insertPos,
            Decoration.replace({ widget: new CopyButtonWidget(codeText, currentBlockId) }),
            3
          )
        }

        let closingMarkFrom = -1
        let closingMarkTo = -1
        node.node.cursor().iterate(child => {
          if (child.name === 'CodeMark') {
            closingMarkFrom = child.from
            closingMarkTo = child.to
          }
        })

        if (closingMarkFrom !== openingMarkFrom && closingMarkFrom >= 0) {
          const closingLine = doc.lineAt(closingMarkFrom)
          const onCloseFence = overlapsSelection(view, closingLine.from, closingLine.to)
          if (!onCloseFence) {
            collector.replace(closingMarkFrom, closingMarkTo, Decoration.replace({}), 5)
          }
        }

        collector.line(startLine.from, codeBlockOpenLine)

        for (let ln = startLine.number + 1; ln <= endLine.number - 1; ln++) {
          if (ln >= 1 && ln <= doc.lines) {
            const line = doc.line(ln)
            const lineOffset = ln - startLine.number - 1
            collector.line(
              line.from,
              Decoration.line({
                class: 'anchor-code-block-content',
                attributes: {
                  'data-editor-line-num': String(lineOffset + 1),
                  'data-editor-role': 'code-block-content'
                }
              })
            )
          }
        }

        if (endLine.number > startLine.number) {
          collector.line(endLine.from, codeBlockCloseLine)
        }

        return false
      }
    })

    return decorationSetFrom(collector.pending)
  }
}

export const codeBlockPlugin: Extension = ViewPlugin.fromClass(CodeBlockPlugin, {
  decorations: (plugin: CodeBlockPlugin) => plugin.decorations
})
