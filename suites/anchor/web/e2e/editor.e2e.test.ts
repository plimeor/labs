import { describe, expect, test } from 'bun:test'

import {
  assertPinnedBunWebViewVersion,
  editorWebViewBackends,
  isEditorWebViewE2EEnabled
} from './harness/editor-webview-matrix'
import { withEditorWebView } from './harness/editor-webview-harness'

const TEST_TIMEOUT_MS = 60_000
const enabled = isEditorWebViewE2EEnabled()
const e2eDescribe = enabled ? describe : describe.skip

if (enabled) {
  assertPinnedBunWebViewVersion()
}

for (const backend of editorWebViewBackends()) {
  e2eDescribe(`Editor WebView e2e (${backend})`, () => {
    test(
      'combined sample renders every semantic widget without mutating saved Markdown',
      async () => {
        await withEditorWebView(backend, 'combined-semantic-widgets', async page => {
          await page.loadFixture('combined')
          await page.moveCursorOffHeading()

          const source = await page.savedMarkdown()
          expect(source).toContain('## Editor checks')
          expect(source).toContain('[[Anchor V1]]')
          expect(source).toContain('[Anchor](https://example.com)')
          expect(source).toContain('#markdown')

          expect(await page.allText('[data-editor-role="wikilink"]')).toContain('Anchor V1')
          expect(await page.allText('[data-editor-role="markdown-link"]')).toEqual(
            expect.arrayContaining(['Anchor', 'docs'])
          )
          expect(await page.allText('[data-editor-role="tag"]')).toEqual(expect.arrayContaining(['#markdown', '#editor']))
          expect(await page.count('[data-editor-role="task-checkbox"]')).toBeGreaterThanOrEqual(2)
          expect(await page.count('[data-editor-role="list-marker"]')).toBeGreaterThanOrEqual(0)
          expect(await page.count('[data-editor-role="blockquote-line"]')).toBeGreaterThan(0)
          expect(await page.count('[data-editor-role="code-block-content"]')).toBeGreaterThan(0)
          expect(await page.text('[data-editor-role="heading"]')).not.toMatch(/^##/)
          expect(await page.text('[data-editor-role="code-block-content"]')).toContain('const value')
          expect(await page.savedMarkdown()).toBe(source)
        })
      },
      TEST_TIMEOUT_MS
    )

    test(
      'tokens sample supports keyboard movement and exact Markdown reads',
      async () => {
        await withEditorWebView(backend, 'tokens-keyboard-source', async page => {
          await page.loadFixture('tokens')
          const before = await page.savedMarkdown()

          await page.focusEditor()
          await page.press('End')
          await page.press('ArrowDown')
          await page.waitForSelector('[data-editor-role="markdown-link"]')
          await page.waitForSelector('[data-editor-role="wikilink"]')

          expect(await page.text('[data-editor-role="markdown-link"]')).toBe('External')
          expect(await page.text('[data-editor-role="wikilink"]')).toBe('Kent Beck')

          await page.press('Home')
          await page.press('ArrowDown')
          expect(await page.savedMarkdown()).toBe(before)
        })
      },
      TEST_TIMEOUT_MS
    )

    test(
      'task checkbox mutates only the checkbox marker and autosaves the Markdown source',
      async () => {
        await withEditorWebView(backend, 'task-checkbox-autosave', async page => {
          await page.loadFixture('tokens')
          expect(await page.savedMarkdown()).toContain('- [ ] one character at a time')

          await page.click('[data-editor-role="task-checkbox"]')
          await page.waitFor(
            async () => (await page.savedMarkdown()).includes('- [x] one character at a time'),
            'task checkbox autosave',
            3000
          )

          const source = await page.savedMarkdown()
          expect(source).toContain('[[Kent Beck]] #notes [External](https://example.com)')
          expect(source).toContain('- [x] one character at a time')
        })
      },
      TEST_TIMEOUT_MS
    )

    test(
      'wikilink command click reaches the playground callback through the DOM event contract',
      async () => {
        await withEditorWebView(backend, 'wikilink-open-event', async page => {
          await page.loadFixture('tokens')
          await page.focusEditor()
          await page.press('End')
          await page.waitForSelector('[data-editor-role="wikilink"]')

          await page.evaluate(
            `document
              .querySelector('[data-editor-role="wikilink"]')
              ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }))`
          )

          await page.waitFor(
            async () => (await page.text('.playground-events')).includes('Open wikilink [[Kent Beck]]'),
            'wikilink open event'
          )
        })
      },
      TEST_TIMEOUT_MS
    )

    test(
      'code copy button writes the exact code body through the browser clipboard surface',
      async () => {
        await withEditorWebView(backend, 'code-copy-clipboard', async page => {
          await page.loadFixture('combined')
          await page.waitForSelector('[data-editor-role="code-copy"]')

          await page.click('[data-editor-role="code-copy"]')
          await page.waitFor(async () => (await page.clipboardText()).includes('const value = 1'), 'clipboard write')

          expect(await page.clipboardText()).toContain('const value = 1')
        })
      },
      TEST_TIMEOUT_MS
    )

    test(
      'mobile-class events and viewport changes do not mutate passive rendering source',
      async () => {
        await withEditorWebView(backend, 'mobile-input-events', async page => {
          await page.loadFixture('combined')
          const before = await page.savedMarkdown()

          await page.resize(390, 820)
          await page.focusEditor()
          await page.dispatchPointer('.cm-content')
          await page.dispatchTouch('.cm-content')
          await page.dispatchComposition('.cm-content', '测')
          await page.dispatchBeforeInput('.cm-content', 'insertCompositionText', '测')

          expect(await page.count('[data-testid="live-preview-surface"]')).toBe(1)
          expect(await page.savedMarkdown()).toBe(before)
        })
      },
      TEST_TIMEOUT_MS
    )

    test(
      'stress note mounts in the viewport without crashing',
      async () => {
        await withEditorWebView(backend, 'stress-note', async page => {
          await page.loadFixture('stress')
          await page.waitForSelector('[data-testid="live-preview-surface"]')
          await page.waitForSelector('[data-editor-role="wikilink"]')

          expect(await page.savedMarkdown()).toContain('# Anchor stress note')
        })
      },
      TEST_TIMEOUT_MS
    )
  })
}
