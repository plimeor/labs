import { syntaxTree } from '@codemirror/language'
import { type Extension } from '@codemirror/state'
import {
  type DecorationSet,
  type PluginValue,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view'

import { DecorationCollector, decorationSetFrom } from '../../rendering/decorations'
import { collectBlockquote } from './widgets/blockquote/collect'
import { collectHeading } from './widgets/headings/collect'
import { collectInlineFormat } from './widgets/inline-format/collect'
import { collectListMarkers, collectTaskCheckbox } from './widgets/lists/collect'
import { createMarkdownLinkCollector, collectWikilinks } from './widgets/links/collect'
import { collectTags } from './widgets/tags/collect'
import type { CollectorContext } from './types'

class LivePreviewPlugin implements PluginValue {
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
    const collector = new DecorationCollector()
    const tree = syntaxTree(view.state)
    const context: CollectorContext = {
      collector,
      doc: view.state.doc,
      tree,
      view
    }
    const markdownLinks = createMarkdownLinkCollector()

    tree.iterate({
      enter(node) {
        collectHeading(context, node)
        collectInlineFormat(context, node)
        collectTaskCheckbox(context, node)
        markdownLinks.enter(context, node)
        collectBlockquote(context, node)

        if (node.name === 'FencedCode') return false
      },

      leave(node) {
        markdownLinks.leave(context, node)
      }
    })

    collectWikilinks(context)
    collectTags(context)
    collectListMarkers(context)

    return decorationSetFrom(collector.pending)
  }
}

export const livePreview: Extension = ViewPlugin.fromClass(LivePreviewPlugin, {
  decorations: (plugin: LivePreviewPlugin) => plugin.decorations
})
