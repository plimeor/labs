import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { EditorWebViewBackend } from './editor-webview-matrix'

const DEFAULT_BASE_URL = 'http://127.0.0.1:1420'
const DEFAULT_TIMEOUT_MS = 10_000

type ConsoleLevel = 'debug' | 'error' | 'info' | 'log' | 'warn'

interface BunWebViewLike {
  close: () => void
  click: (selector: string, options?: unknown) => Promise<void>
  evaluate: <T = unknown>(source: string) => Promise<T>
  loading: boolean
  press: (key: string) => Promise<void>
  resize: (width: number, height: number) => void
  screenshot: () => Promise<Blob>
  type: (text: string) => Promise<void>
}

interface BunWebViewConstructor {
  new (options: {
    backend: EditorWebViewBackend
    console?: (level: ConsoleLevel, ...args: unknown[]) => void
    headless: boolean
    height: number
    title?: string
    url: string
    width: number
  }): BunWebViewLike
}

interface EditorWebViewHarnessOptions {
  backend: EditorWebViewBackend
  baseUrl?: string
  height?: number
  width?: number
}

export class EditorWebViewHarness {
  readonly backend: EditorWebViewBackend

  private readonly baseUrl: string
  private readonly consoleMessages: string[] = []
  private readonly height: number
  private readonly width: number
  private view: BunWebViewLike | undefined

  constructor(options: EditorWebViewHarnessOptions) {
    this.backend = options.backend
    this.baseUrl = options.baseUrl ?? process.env.ANCHOR_E2E_BASE_URL ?? DEFAULT_BASE_URL
    this.height = options.height ?? 920
    this.width = options.width ?? 1280
  }

  async start(): Promise<void> {
    const WebView = (Bun as unknown as { WebView: BunWebViewConstructor }).WebView
    if (!WebView) {
      throw new Error('Bun.WebView is not available in this Bun runtime')
    }

    this.view = new WebView({
      backend: this.backend,
      headless: true,
      height: this.height,
      title: `Anchor editor e2e ${this.backend}`,
      url: `${this.baseUrl}/#/playground`,
      width: this.width,
      console: (level, ...args) => {
        if (level === 'error') {
          this.consoleMessages.push(`${level}: ${args.map(String).join(' ')}`)
        }
      }
    })

    await this.waitUntilLoaded()
    await this.installPageErrorHooks()
    await this.installClipboardStub()
    await this.waitForSelector('[data-testid="live-preview-surface"]')
  }

  close(): void {
    this.view?.close()
    this.view = undefined
  }

  async assertNoPageErrors(): Promise<void> {
    const pageErrors = await this.pageErrors()
    const messages = [...this.consoleMessages, ...pageErrors]
    if (messages.length > 0) {
      throw new Error(`Page emitted console/page errors:\n${messages.join('\n')}`)
    }
  }

  async captureFailureArtifact(slug: string): Promise<void> {
    if (!this.view) return

    const dir = join(import.meta.dir, '..', 'artifacts')
    await mkdir(dir, { recursive: true })
    const file = join(dir, `${Date.now()}-${this.backend}-${slug}.png`)
    await Bun.write(file, await this.view.screenshot())
  }

  async evaluate<T = unknown>(source: string): Promise<T> {
    return this.requireView().evaluate<T>(source)
  }

  async click(selector: string): Promise<void> {
    await this.requireView().click(selector)
  }

  async press(key: string): Promise<void> {
    await this.requireView().press(key)
  }

  async typeText(text: string): Promise<void> {
    await this.requireView().type(text)
  }

  async resize(width: number, height: number): Promise<void> {
    this.requireView().resize(width, height)
    await Bun.sleep(100)
  }

  async loadSample(sampleId: string): Promise<void> {
    await this.evaluate(
      `(() => {
        const sampleId = ${JSON.stringify(sampleId)};
        const select = Array.from(document.querySelectorAll('select'))
          .find(el => Array.from(el.options).some(option => option.value === sampleId));
        if (!select) throw new Error('Sample select not found for ' + sampleId);
        select.value = sampleId;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`
    )

    await this.click('[data-testid="load-sample"]')
    await this.waitForSelector('[data-testid="live-preview-surface"]')
    await this.waitFor(async () => {
      const source = await this.savedMarkdown()
      return source.length > 0 && source !== 'undefined'
    }, `sample ${sampleId} to load`)
  }

  async loadFixture(fixtureId: string): Promise<void> {
    await this.loadSample(fixtureId)
  }

  async focusEditor(): Promise<void> {
    await this.evaluate(`document.querySelector('.cm-content')?.focus()`)
    await Bun.sleep(60)
  }

  async moveCursorOffHeading(): Promise<void> {
    if ((await this.count('[data-editor-role="code-block-content"]')) > 0) {
      await this.click('[data-editor-role="code-block-content"]')
    } else {
      await this.focusEditor()
      await this.press('End')
    }
    await Bun.sleep(120)
  }

  async savedMarkdown(): Promise<string> {
    return this.text('.playground-saved pre')
  }

  async count(selector: string): Promise<number> {
    return this.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`)
  }

  async text(selector: string): Promise<string> {
    return this.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`)
  }

  async allText(selector: string): Promise<string[]> {
    return this.evaluate(
      `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map(el => el.textContent ?? '')`
    )
  }

  async waitForSelector(selector: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    await this.waitFor(async () => (await this.count(selector)) > 0, `selector ${selector}`, timeoutMs)
  }

  async waitFor(assertion: () => Promise<boolean>, label: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      if (await assertion()) return
      await Bun.sleep(100)
    }

    throw new Error(`Timed out waiting for ${label}`)
  }

  async dispatchPointer(selector: string, type = 'pointerdown'): Promise<void> {
    await this.dispatchTargetedEvent(
      selector,
      `(() => {
        const eventOptions = { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true };
        return typeof PointerEvent === 'function'
          ? new PointerEvent(${JSON.stringify(type)}, eventOptions)
          : new MouseEvent(${JSON.stringify(type.replace(/^pointer/, 'mouse'))}, eventOptions);
      })()`
    )
  }

  async dispatchTouch(selector: string, type = 'touchstart'): Promise<void> {
    await this.evaluate(
      `(() => {
        const target = document.querySelector(${JSON.stringify(selector)});
        if (!target) throw new Error('dispatch target not found: ${selector.replaceAll("'", "\\'")}');
        const rect = target.getBoundingClientRect();
        const touch = {
          clientX: rect.left + Math.max(1, rect.width / 2),
          clientY: rect.top + Math.max(1, rect.height / 2),
          identifier: 1,
          target
        };
        const event = new Event(${JSON.stringify(type)}, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'changedTouches', { value: [touch] });
        Object.defineProperty(event, 'targetTouches', { value: [touch] });
        Object.defineProperty(event, 'touches', { value: [touch] });
        target.dispatchEvent(event);
      })()`
    )
  }

  async dispatchComposition(selector: string, data: string): Promise<void> {
    await this.dispatchTargetedEvent(
      selector,
      `new CompositionEvent('compositionstart', { bubbles: true, cancelable: true, data: ${JSON.stringify(data)} })`
    )
    await this.dispatchTargetedEvent(
      selector,
      `new CompositionEvent('compositionupdate', { bubbles: true, cancelable: true, data: ${JSON.stringify(data)} })`
    )
    await this.dispatchTargetedEvent(
      selector,
      `new CompositionEvent('compositionend', { bubbles: true, cancelable: true, data: ${JSON.stringify(data)} })`
    )
  }

  async dispatchBeforeInput(selector: string, inputType: string, data: string): Promise<void> {
    await this.dispatchTargetedEvent(
      selector,
      `new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        data: ${JSON.stringify(data)},
        inputType: ${JSON.stringify(inputType)}
      })`
    )
  }

  async clipboardText(): Promise<string> {
    return this.evaluate(`window.__anchorE2EClipboard ?? ''`)
  }

  private async dispatchTargetedEvent(selector: string, eventExpression: string): Promise<void> {
    await this.evaluate(
      `(() => {
        const target = document.querySelector(${JSON.stringify(selector)});
        if (!target) throw new Error('dispatch target not found: ${selector.replaceAll("'", "\\'")}');
        target.dispatchEvent(${eventExpression});
      })()`
    )
  }

  private async installClipboardStub(): Promise<void> {
    await this.evaluate(
      `(() => {
        window.__anchorE2EClipboard = '';
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async text => {
              window.__anchorE2EClipboard = String(text);
            }
          }
        });
      })()`
    )
  }

  private async installPageErrorHooks(): Promise<void> {
    await this.evaluate(
      `(() => {
        if (window.__anchorE2EInstalled) return;
        window.__anchorE2EInstalled = true;
        window.__anchorE2EErrors = [];
        window.addEventListener('error', event => {
          window.__anchorE2EErrors.push(String(event.message ?? event.error ?? 'unknown error'));
        });
        window.addEventListener('unhandledrejection', event => {
          window.__anchorE2EErrors.push(String(event.reason ?? 'unhandled rejection'));
        });
      })()`
    )
  }

  private async pageErrors(): Promise<string[]> {
    return this.evaluate(`window.__anchorE2EErrors ?? []`)
  }

  private requireView(): BunWebViewLike {
    if (!this.view) throw new Error('WebView has not been started')
    return this.view
  }

  private async waitUntilLoaded(): Promise<void> {
    const deadline = Date.now() + DEFAULT_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (!this.requireView().loading) return
      await Bun.sleep(50)
    }

    throw new Error(`WebView did not finish loading ${this.baseUrl}`)
  }
}

export async function withEditorWebView(
  backend: EditorWebViewBackend,
  slug: string,
  run: (page: EditorWebViewHarness) => Promise<void>
): Promise<void> {
  const page = new EditorWebViewHarness({ backend })
  await page.start()

  try {
    await run(page)
    await page.assertNoPageErrors()
  } catch (err) {
    await page.captureFailureArtifact(slug)
    throw err
  } finally {
    page.close()
  }
}
