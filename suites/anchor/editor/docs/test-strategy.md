# Editor Test Strategy

This document defines the target quality gate for `packages/anchor-editor`.
The goal is not to collect tests for their own sake. The goal is to make the
editor safe to change while preserving the properties users depend on in a
local-first Markdown note editor.

The editor is allowed to have subtle dynamic behavior. The test strategy treats
that subtlety as first-class product behavior, not as a reason to lower the bar.

## Scope

This strategy covers:

- `packages/anchor-editor/src/Editor.tsx`
- `packages/anchor-editor/src/autosave-controller.ts`
- `packages/anchor-editor/src/keymap.ts`
- `packages/anchor-editor/src/live-preview.ts`
- `packages/anchor-editor/src/code-block.ts`
- editor package tests under `packages/anchor-editor/src/__tests__`
- stable editor fixtures under `packages/anchor-editor/src/__fixtures__`
- browser or application tests that prove editor behavior through `anchor-web`

This strategy does not cover the Rust vault core, backend HTTP bridge, Tauri
packaging, or general app routing except where those surfaces are needed to
prove editor integration behavior.

## Quality Bar

The editor quality bar is complete only when all of these are true:

1. Text fidelity is protected by deterministic fixtures and corpus tests.
2. Every editor command is tested through the real command implementation.
3. View-only decorations are proven not to mutate the Markdown source.
4. Autosave behavior is proven as a state machine, including conflict and
   concurrency paths.
5. Browser-only behavior is covered by real browser tests, not mocked DOM tests.
6. Coverage thresholds protect the editor's critical modules.
7. Flaky test behavior is treated as a test failure until the test is corrected.
8. CI has one editor gate that fails when any required editor evidence fails.

## Reference Model

AFFiNE/BlockSuite is the closest reference model for this strategy because it is
also an editor-heavy local-first knowledge application with subtle browser
interactions.

The practices adopted from that reference model are:

- static gates run separately from behavior tests
- generated artifacts are checked by rerunning generators and requiring a clean
  git status
- editor unit tests cover pure model, adapter, keymap, command, and state
  behavior
- browser integration tests mount a real editor harness instead of replacing
  editor behavior with mocks
- browser E2E tests own keyboard, mouse, clipboard, focus, layout, selection,
  undo, redo, and engine-specific behavior
- Anchor's required browser gate is adapted to Tauri and Bun WebView runtime
  reality rather than copied as a generic browser matrix. The current required
  Page harness runs the same editor behavior suite against both Bun WebView
  backends: `webkit` for the Tauri Apple-platform release runtime, and `chrome`
  as a secondary engine check that catches Blink-specific web behavior.
- model or text snapshots are preferred over broad DOM snapshots
- browser tests collect retry artifacts and fail on unexpected page errors
- a final aggregate CI job fails the quality gate if any required job fails

The practices intentionally not copied at the same scale are:

- large multi-shard browser matrices before Anchor has enough browser tests to
  justify that infrastructure
- Codecov-only coverage reporting without enforceable local thresholds
- broad visual screenshot baselines for behavior that can be proven through
  source text, model state, or semantic DOM assertions

The target state for Anchor keeps the same standard: subtle interaction behavior
must be proven at the layer where it actually exists.

## Invariants

These invariants define what must never regress.

### Markdown Source Identity

The CodeMirror document is the Markdown source of truth.

Required properties:

- `view.state.doc.toString()` is the exact editor buffer.
- Creating the editor view does not modify the document.
- Moving the caret does not modify the document.
- Recomputing live-preview decorations does not modify the document.
- Destroying and remounting the editor does not modify the document.
- Saving sends the exact buffer text, including trailing spaces and blank lines.
- No test may pass by accepting trimmed, reparsed, reserialized, or normalized
  Markdown unless the normalization is an explicit product contract.

The only accepted normalization currently owned by the editor is CRLF to LF on
editor import.

### View-Only Decorations

Live preview and code block decorations are presentation behavior. They must
not become storage behavior.

Required properties:

- Heading markers, wikilinks, Markdown links, tags, task checkboxes, blockquotes,
  inline marks, inline code, fenced code block labels, copy buttons, and line
  numbers are rendered without changing the underlying document.
- Reveal-on-caret behavior is selection based, not focus based.
- Moving the caret into a decorated range reveals the raw syntax for that range.
- Moving the caret away restores the preview presentation.
- Overlapping Markdown constructs do not crash decoration building.
- Unclosed syntax, especially code fences, degrades to safe plain text behavior.

### Explicit Edit Commands

Command behavior is text editing behavior and must be exact.

Required properties:

- `Enter` continues unordered lists, ordered lists, task lists, and blockquotes
  according to the documented behavior.
- `Enter` exits empty list and quote items without leaving a phantom prefix.
- `Tab` and `Shift-Tab` only affect supported list lines.
- Code fence auto-pairing only fires on the exact third backtick case.
- Commands that return `false` must leave the document and selection unchanged.
- Commands that return `true` must produce the exact expected document and a
  valid selection anchor.
- Multi-selection and non-collapsed selection behavior must be explicitly tested
  for either supported behavior or no-op behavior.

### Autosave State Machine

Autosave is an editor state machine. It must be tested independently from DOM
rendering.

Required properties:

- Dirty state only reflects difference from `lastSavedText`.
- Debounce schedules exactly one save for the latest text.
- `flush()` cancels pending debounce and saves immediately when needed.
- Saves in flight are coalesced without losing the latest edit.
- Successful saves update `baseRevision` and `lastSavedText`.
- Conflict errors block further saves until a load or explicit recovery path.
- Non-conflict errors surface as failed state without corrupting revision state.
- Loading a new note cancels pending timers and clears dirty state.
- Server-returned body replacement is applied only when the returned body differs
  from the submitted body.
- `destroy()` cancels all timers and prevents post-unmount saves.
- Whitespace is saved verbatim.

### Component Integration

The Solid `Editor` component must correctly connect CodeMirror, autosave,
external props, and route-level callbacks.

Required properties:

- Mounting creates exactly one `EditorView`.
- Unmounting destroys the view, autosave controller, and mutation observer.
- `body`, `noteId`, and `baseRevision` changes reset or preserve editor state
  according to the source-of-truth rules.
- Same-note revision updates do not overwrite local dirty edits.
- Different-note navigation resets document text and autosave state.
- `onAutosave` receives exact body and revision arguments.
- `onDirtyChange` reflects dirty transitions without duplicate noise.
- `onOpenWikilink` is invoked from the editor event boundary and failures are
  contained.
- Conflict and failed statuses render problem UI; clean, dirty, saving, and
  saved states remain visually silent unless the product contract changes.

### Browser Reality

Some editor behavior only exists in a browser. Those behaviors require browser
tests.

Required properties:

- Native selection and caret movement work in the mounted editor.
- Keyboard input reaches CodeMirror through the real event path.
- Clipboard behavior is validated through browser clipboard APIs or browser
  event simulation, not pure function mocks.
- Focus, blur, scroll, layout, and rendered line wrapping are validated in a real
  browser when they affect product behavior.
- Browser console errors and page errors fail the test unless the test declares
  and asserts the expected error.

## Test Layers

The quality gate uses layered tests. Each layer owns a different risk. A lower
layer must not pretend to prove behavior that only a higher layer can observe.

### Layer 1: Pure Unit Tests

Owned risks:

- autosave state transitions
- debounce and timer behavior
- command helper logic that does not require DOM
- string/range utilities
- language label mapping and URL/string helpers

Required test style:

- no DOM
- no browser
- fake timers where timing matters
- exact state assertions
- failure cases for invalid inputs
- no tests against private implementation state unless there is no public state
  boundary and the invariant is critical

Current anchor examples:

- `autosave-controller.test.ts`

Required additions:

- direct unit coverage for any pure helper extracted from `keymap.ts`
- direct unit coverage for language label normalization used by code block
  decorations, if it remains custom logic

### Layer 2: CodeMirror View Harness Tests

Owned risks:

- real CodeMirror `EditorState` and `EditorView` behavior
- decoration recomputation
- command dispatch effects
- selection/caret-driven reveal behavior
- DOM widgets in a lightweight DOM environment

Required test style:

- use a full-featured shared editor harness, not per-test lightweight
  `makeEditorView` helpers
- test real exported or internally exported command functions
- assert `view.state.doc.toString()` after every dynamic action
- assert selection anchors for editing commands
- assert semantic DOM selectors for widgets and preview elements
- avoid full DOM snapshots

Harness responsibilities:

```ts
interface EditorViewHarness {
  parent: HTMLElement
  view: EditorView
  cleanup(): void
  doc(): string
  contentText(): string
  lineText(lineNumber: number): string
  selection(): { from: number; to: number }
  moveCaret(pos: number | { line: number; column: number }): void
  selectRange(from: number, to: number): void
  dispatchText(from: number, to: number, insert: string): void
  typeText(text: string): Promise<void>
  pressKey(key: string, modifiers?: KeyModifiers): Promise<void>
  click(target: Element, options?: PointerOptions): Promise<void>
  mouseDown(target: Element, options?: PointerOptions): Promise<void>
  getByEditorRole(role: string, attrs?: Record<string, string>): HTMLElement
  queryByEditorRole(
    role: string,
    attrs?: Record<string, string>
  ): HTMLElement | null
  allByEditorRole(role: string): HTMLElement[]
  clipboard: { writes: string[]; reset(): void }
  windowOpen: { calls: Array<[string, string?, string?]>; reset(): void }
  events(type: string): Event[]
  loadFixture(name: string): Promise<void>
  flush(): Promise<void>
  expectDocUnchanged(action: () => void | Promise<void>): Promise<void>
  expectEditorRole(role: string, attrs?: Record<string, string>): HTMLElement
  destroy(): void
}
```

The harness must mount the production editor extension set by default:
Markdown language support, live preview, code block rendering, keymap,
theme/base extensions, and any editor extension that the real `Editor`
component uses for text editing behavior. Individual tests may disable a
production extension only when the test explicitly proves extension isolation.

The harness must also own deterministic browser-adjacent services used by
editor behavior: clipboard writes, `window.open`, timers, animation-frame
flushing, custom event capture, fixture loading, multiple editor instances, and
cleanup. It should mirror BlockSuite's test-host approach: a reusable editor
host with real editor composition and event helpers, not one-off setup code
inside each test.

The harness must not duplicate editor logic from production files. It may expose
test operations, selectors, and assertions over the public editor boundary.

Current anchor examples:

- `decorations.test.ts`
- `interaction.test.ts`

Required correction:

- `interaction.test.ts` must stop copying command implementations. It must call
  the real keymap path through the harness or product-owned command exports.
  Do not add package public test helpers.

### Layer 3: Editor Component Tests

Owned risks:

- Solid component lifecycle
- props to CodeMirror wiring
- autosave callback integration
- note navigation behavior
- problem status rendering
- wikilink event bridge

Required test style:

- mount the `Editor` component in a controlled DOM or browser component test
- use fake `onAutosave`, `onDirtyChange`, and `onOpenWikilink` callbacks
- interact through the editor surface when possible
- assert public component output and callback payloads
- do not assert Solid implementation details

Required scenarios:

- initial mount with body and revision
- edit triggers dirty and scheduled autosave
- `flush()` via `Mod-s` path calls `onAutosave`
- same-note revision update preserves local dirty text
- different-note navigation resets text and dirty state
- conflict save renders problem status
- failed save renders problem status
- clean save hides status UI
- wikilink event invokes callback exactly once
- unmount cancels pending save

### Layer 4: Browser Integration Tests

Owned risks:

- browser selection
- real keyboard events
- clipboard events
- focus and blur
- rendered layout behavior that jsdom or happy-dom cannot prove
- interactions between CodeMirror and CSS
- backend differences between WebKit and Chrome
- mobile-class input behavior that depends on pointer, beforeinput,
  composition, viewport, or virtual keyboard semantics

Required test style:

- run in a Bun WebView Page harness with backend parameterization
- run the same required editor behavior suite against `backend: 'webkit'` and
  `backend: 'chrome'` on macOS CI
- keep one shared test flow and one shared harness interface; backend selection
  is data, not a duplicated test tree
- run against a minimal editor page, not necessarily the full app
- do not use `agent-browser` as the required quality gate
- `backend: 'webkit'` is the release-runtime proof for macOS and iOS Tauri
  behavior because it exercises system `WKWebView`
- `backend: 'chrome'` is required as a differential check through the same
  scenarios, not as a separate product runtime contract
- if a non-macOS CI runner cannot execute `backend: 'webkit'`, that runner is
  incomplete for the editor Page harness; the required gate needs a macOS runner
- pin the Bun version used by the harness because `Bun.WebView` is experimental
- keep Playwright or Vitest-browser tests only when they prove generic web
  behavior; they are not the release-runtime proof for editor interactions
- use `press()` for keyboard-command tests. Bun WebView `type()` inserts text
  through browser editing commands and does not fire `keydown`/`keyup`, so it is
  only valid for text insertion or paste-like paths.
- use backend-neutral operations for required assertions: navigate, focus
  editor, read Markdown, evaluate DOM state, click, press, screenshot, console
  capture, cleanup, and artifact collection
- use Chrome-only CDP only for optional diagnostics; required editor assertions
  must not depend on CDP
- centralize page startup, fixture loading, editor focus, keyboard helpers,
  pointer helpers, selection helpers, polling assertions, clipboard permissions,
  and cleanup in reusable browser harness utilities
- fail on unexpected console errors, unexpected warnings, and page errors
- require explicit allowlists for expected browser console messages
- collect screenshot, console log, DOM summary, Markdown text dump, backend
  name, Bun version, and WebView failure metadata on retry or failure
- use stable viewport, color scheme, timezone, and clipboard permission
  configuration
- collect browser coverage into an editor-specific coverage directory when
  `COVERAGE=1` or CI enables it
- run keyboard, caret, selection, and widget-click invariants in both Bun
  WebView backends
- assert model/text state first, visual state second

Required harness shape:

```ts
type EditorWebViewBackend = 'webkit' | 'chrome'

interface EditorPageHarness {
  backend: EditorWebViewBackend
  navigateEditor(fixture?: string): Promise<void>
  focusEditor(): Promise<void>
  doc(): Promise<string>
  selection(): Promise<{ from: number; to: number }>
  pressKey(key: string, modifiers?: KeyModifiers): Promise<void>
  typeText(text: string): Promise<void>
  clickEditorRole(role: string, attrs?: Record<string, string>): Promise<void>
  dispatchTouch(
    role: string,
    type: 'pointerdown' | 'pointermove' | 'pointerup',
    points: Array<{ x: number; y: number }>
  ): Promise<void>
  dispatchComposition(text: string): Promise<void>
  dispatchBeforeInput(inputType: string, data?: string): Promise<void>
  expectNoUnexpectedConsole(): void
  collectFailureArtifacts(testName: string): Promise<void>
  cleanup(): Promise<void>
}
```

Every required browser scenario must run through `EditorPageHarness`. The
backend matrix is created by passing `backend` into the harness factory; tests
do not duplicate scenario bodies for WebKit and Chrome.

Required scenarios:

- type text into an empty note and autosave exact text
- Enter list continuation through real keyboard input
- Tab and Shift-Tab through real keyboard input
- fenced code auto-pair through real keyboard input
- moving caret into and out of preview ranges reveals and hides syntax
- task checkbox click changes exactly `[ ]` to `[x]` or `[x]` to `[ ]`
- Markdown link and wikilink preview do not trap caret movement
- copy button in a code block does not mutate editor text
- clipboard-specific behavior runs in both WebView backends where supported; a
  backend with denied or unavailable clipboard capability must still prove no
  source mutation
- focus and blur do not alter preview source
- mobile viewport profile focuses the editor, taps widget surfaces, scrolls the
  editor container, and proves no accidental Markdown mutation
- touch helper dispatches pointer events with `pointerType: 'touch'` for
  touch-only behavior that Bun WebView cannot trigger through native touch APIs
- composition harness dispatches `compositionstart`, `compositionupdate`, and
  `compositionend` around CJK text and verifies preview rebuilds do not corrupt
  the Markdown source
- beforeinput fallback scenarios cover Android-style input events such as
  `deleteContentBackward` without assuming reliable `keypress` key names
- virtual-keyboard or visual-viewport changes must not cover the caret, widget
  menu, or active input when mobile UI is introduced

### Layer 5: Application E2E Tests

Owned risks:

- `anchor-web` route integration
- backend save contract
- note switching
- persistence round trip
- Tauri/web runtime differences where relevant

Required test style:

- run through the app route that users actually use
- use a controlled test vault
- assert persisted Markdown bytes or exact file content when save behavior is
  under test
- keep E2E count small and high value
- reuse browser harness keyboard, selection, polling, console, and page-error
  utilities rather than shelling out to ad-hoc browser commands

Required scenarios:

- open a note, edit body, autosave, reload, exact text remains
- switch notes with a dirty note, no accidental overwrite occurs
- conflict path surfaces problem UI and blocks silent overwrite
- trailing spaces and blank lines survive save and reload
- editor playground page renders stress fixtures without crashing

## Fixture Strategy

Editor tests must use committed fixtures. Local personal notes may be useful as
developer-only stress input, but they are not a merge gate.

Required fixture directory:

```text
packages/anchor-editor/src/__fixtures__/
  markdown/
    plain.md
    headings.md
    lists.md
    tasks.md
    blockquotes.md
    wikilinks.md
    markdown-links.md
    inline-formatting.md
    fenced-code.md
    tables.md
    mixed-note.md
    cjk.md
    trailing-whitespace.md
    unclosed-syntax.md
```

Fixture requirements:

- each fixture has a clear purpose
- fixtures preserve trailing whitespace where that is the subject of the test
- fixtures include CJK and non-ASCII note content
- fixtures include nested list and task cases
- fixtures include overlapping syntax cases
- fixtures include incomplete user input, such as unclosed code fences and
  partially typed links
- fixtures are small enough to inspect in review
- large stress fixtures are generated deterministically or stored with a clear
  reason

Personal corpus tests:

- can exist as an opt-in local command
- must not print private file paths or note contents in CI logs
- must not be the only proof of fidelity
- must not replace committed fixtures

## Snapshot Policy

Snapshots are allowed when they lock a stable product-level representation.
Snapshots are not allowed as a substitute for understanding behavior.

Allowed snapshots:

- Markdown export text
- clipboard text/html payloads
- simplified model state
- normalized editor state summaries
- small semantic DOM fragments where selector assertions are insufficient

Avoided snapshots:

- entire CodeMirror DOM trees
- full rendered page markup
- browser layout values that change across platforms
- screenshots for text-only behavior

Screenshot snapshots are reserved for browser-rendered visual behavior that
cannot be trusted through model or DOM assertions.

## Property-Based Tests

Property-based tests are part of the complete strategy for dynamic editor
behavior. They complement example tests by exploring combinations that humans do
not enumerate well.

Required properties:

- generated Markdown plus random caret moves never changes the document
- generated Markdown plus decoration recomputation never throws
- command returns `false` implies document and selection unchanged
- command returns `true` implies selection is within document bounds
- generated valid fenced code blocks never lose body text in preview
- generated unclosed syntax does not crash and does not produce code-block-only
  decorations

Execution rules:

- use deterministic seeds in CI
- keep generated case count high enough to catch combinations, not so high that
  failures are hard to debug
- print the seed and minimized counterexample on failure
- promote every discovered regression to an explicit fixture test

## Coverage Policy

Coverage is a guardrail, not the definition of quality. A high-risk editor file
with weak behavior tests is not acceptable just because global coverage is high.

Target thresholds:

```text
packages/anchor-editor global:
  lines:      >= 85%
  functions:  >= 90%
  branches:   >= 80%

autosave-controller.ts:
  lines:      >= 95%
  functions:  >= 95%
  branches:   >= 90%

keymap.ts:
  lines:      >= 95%
  functions: 100%
  branches:   >= 90%

live-preview.ts:
  lines:      >= 90%
  functions:  >= 90%
  branches:   >= 85%

code-block.ts:
  lines:      >= 90%
  functions:  >= 90%
  branches:   >= 85%

Editor.tsx:
  lines:      >= 80%
  functions:  >= 80%
  branches:   >= 70%
```

Coverage must be measured against real source execution. Tests that duplicate
production logic do not count as meaningful coverage even if the test suite is
green.

Coverage reports must be reviewed with uncovered lines. Any uncovered line in
autosave, command handling, or source mutation paths requires one of:

- a test that covers it
- a documented reason it is unreachable
- a code change that removes unreachable logic

## CI Gate

The editor CI gate is complete when it runs these checks and fails on any
failure:

```sh
bun run check
cd packages/anchor-editor && bun run test
cd packages/anchor-editor && bun test --conditions browser --coverage src
cd apps/anchor-web && bun run build
cd apps/anchor && bun run test:e2e
cd apps/anchor-web && bun run test:e2e:editor
cd apps/anchor-web && bun run test:e2e:editor:webview
```

The final CI shape should expose editor-specific scripts:

```json
{
  "scripts": {
    "test:editor": "cd packages/anchor-editor && bun run test",
    "test:editor:coverage": "cd packages/anchor-editor && bun test --conditions browser --coverage src",
    "test:editor:browser": "cd apps/anchor-web && bun run test:e2e:editor",
    "test:editor:webview": "cd apps/anchor-web && bun run test:e2e:editor:webview"
  }
}
```

The exact script names may follow repository convention, but the gate must keep
the same evidence:

- type safety
- stable unit tests
- editor coverage
- production web build
- browser behavior
- Bun WebView backend matrix coverage for keyboard, caret, selection, and
  widget interaction invariants

## Flake Policy

Unit tests must not be flaky. A flaky unit test is either wrong or testing at
the wrong layer.

Browser tests may use retries to collect evidence, but retries are not a
substitute for deterministic waits.

Required practices:

- no arbitrary sleeps in unit tests
- no uncontrolled timers
- no reliance on test execution order
- no `test.only`, focused test, or skipped regression without a tracked reason
- no unexpected console errors
- no swallowed page errors
- browser tests use polling for eventual UI state
- browser tests collect WebView failure artifacts: screenshot, console log, DOM
  summary, Markdown text dump, backend name, Bun version, and failure metadata

## Review Checklist

Every editor change must answer these questions in review:

- Does this change alter the Markdown source of truth?
- Does this change alter a saved body, revision, or autosave state transition?
- Does this change add or modify a command?
- Does this change add or modify a decoration?
- Does this change rely on browser selection, clipboard, focus, or layout?
- Does this change need a fixture?
- Does this change need a browser test rather than a DOM harness test?
- Do existing tests call production code, or do they duplicate it?
- Is there any new unexpected console output?
- Is the verification evidence from the smallest layer that proves the risk?

## Required Test Map

### Autosave

Files:

- `autosave-controller.test.ts`

Required cases:

- initial state
- load reset
- same text no-op
- dirty transition
- debounce save
- flush save
- saved to clean timer
- conflict error
- non-conflict error
- conflict blocks further saves
- edit during save in flight
- server body replacement
- load cancels pending save
- destroy cancels timers
- trailing spaces and blank lines
- exact base revision passed to save callback
- duplicate dirty notifications are not emitted

### Full Editor Harness

Files:

- `src/__tests__/harness/editor-harness.ts`

Required capabilities:

- production editor extension composition by default
- fixture loading from `src/__fixtures__/markdown`
- exact document reads and visible-content reads
- line and position helpers
- caret movement and range selection
- text insertion and real command/key dispatch helpers
- pointer, mouse, and click dispatch helpers
- semantic queries by accessible role, ARIA, `data-editor-role`, and
  `data-editor-*` payload attributes
- clipboard and `window.open` capture
- custom editor event capture
- custom editor assertions such as `expectDocUnchanged` and
  `expectEditorRole`
- animation-frame and microtask flushing
- support for multiple mounted editor instances when testing global listeners,
  cleanup, or event leakage
- deterministic cleanup that destroys the `EditorView`, restores browser
  globals, and removes mounted DOM

### Keymap

Files:

- `keymap-command.test.ts`
- `keymap-browser.test.ts`

Required cases:

- unordered list continuation
- ordered list continuation and increment
- empty unordered list exit
- empty ordered list exit
- blockquote continuation
- empty blockquote exit
- task list continuation behavior
- Tab indent
- Shift-Tab outdent
- unsupported line no-op
- non-collapsed selection behavior
- multi-selection behavior
- code fence auto-pair
- code fence no-op when closing fence exists
- command false means exact no-op
- real browser keyboard path for Enter, Tab, Shift-Tab, and backticks

### Decorations

Files:

- `decorations.test.ts`
- `editor-view-invariants.test.ts`
- `decorations-browser.test.ts`

Required cases:

- heading marker hidden away from caret
- heading marker revealed on caret line
- wikilink chip display and reveal
- Markdown link chip display and reveal
- tag mark display
- inline code display and reveal
- bold and italic display and reveal
- task checkbox widget display
- task checkbox toggle exact mutation
- blockquote marker display and reveal
- fenced code block label, copy button, and line numbers
- multiple code blocks reset line numbers
- unclosed fence produces no code-block decoration
- overlapping constructs do not crash
- every decoration case preserves source text
- every caret movement preserves source text

### Editor Component

Files:

- `Editor.component.test.tsx`
- `Editor.browser.test.ts`

Required cases:

- mount and unmount lifecycle
- initial body displayed
- edit invokes autosave controller path
- `Mod-s` flush path
- note change resets body
- same note revision update preserves dirty text
- status UI only appears for conflict and failed states
- wikilink event bridge
- theme mutation observer reconfigures syntax highlighting without document
  mutation

### Corpus and Fixtures

Files:

- `fixture-fidelity.test.ts`
- `corpus-fidelity.local.test.ts`

Required cases:

- committed fixtures preserve exact source text
- stress fixture preserves exact source text
- trailing whitespace fixture preserves exact source text
- CJK fixture preserves exact source text
- local corpus command is opt-in and not part of CI

### Browser E2E

Files:

- `apps/anchor-web/e2e/editor.e2e.test.ts`

Required cases:

- open note and edit text
- autosave and reload exact content
- list command through keyboard
- code fence command through keyboard
- checkbox click mutation
- caret reveal behavior
- note switch while dirty
- conflict or failed save visible status

## Implementation Sequence

The complete strategy should be implemented in this order because each step
removes a known blind spot before raising the gate.

1. Create committed Markdown fixtures.
2. Create the full-featured editor view harness.
3. Replace copied keymap tests with tests against real command functions.
4. Add command no-op and selection-bound invariant tests.
5. Split fixture fidelity from personal corpus fidelity.
6. Add property-based invariants for Markdown plus random caret movement.
7. Add component tests for `Editor.tsx` lifecycle and prop synchronization.
8. Add browser tests for true keyboard, selection, clipboard, and focus paths.
9. Add coverage thresholds after the real-command and browser gaps are closed.
10. Add CI scripts that run the complete editor gate.

No step is optional for the final target state. The ordering exists only to keep
the work auditable and to avoid raising a metric before the underlying behavior
is actually protected.

## Stop Condition

The editor test strategy is complete when:

- all required fixtures exist
- all required test files exist
- tests call production editor code instead of copied logic
- unit, harness, component, browser, and E2E layers each own the risks assigned
  to them
- coverage thresholds are enforced for editor source files
- the editor CI gate fails on any missing or failed required evidence
- the README or developer docs point contributors to this strategy

Until those conditions are true, the editor has useful tests but not a complete
quality gate.
