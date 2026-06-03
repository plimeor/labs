# Editor Semantic Widget Renderer Plan

Date: 2026-06-01

## Clarification Status

The implementation target is clear enough to proceed after one explicit boundary
decision:

- `anchor-editor` stays Markdown-first. The CodeMirror document remains the
  source of truth, and saved content remains Markdown text.
- Rendering components should be organized by semantic widget family, not by the
  current file split.
- `tag`, `link`, `wikilink`, and list-related renderers need independent growth
  paths because future interaction and styling will diverge.
- AFFiNE/BlockSuite is reference architecture, not a migration target. Its useful
  lesson is responsibility separation: block-level renderers, inline renderers,
  and widgets have separate owners.

The plan enables a first-pass `ListMarker` in the first implementation pass. The
initial visual contract is intentionally narrow: non-task list markers render as
a small non-interactive dot when the caret is outside the marker range, and the
underlying Markdown marker is revealed when the caret overlaps it.

## Background

The current editor implementation keeps most live-preview rendering inside
`packages/anchor-editor/src/live-preview.ts` and `packages/anchor-editor/src/code-block.ts`.
Those files mix parsing, decoration ordering, DOM creation, event handling,
theme definitions, and Markdown mutation. That was acceptable while there were
only a few static decorations, but it is the wrong shape once tags, links,
wikilinks, and list markers become independently interactive.

The future pressure is already visible:

- `tag` starts as a style-only mark but is expected to get independent
  interaction.
- Markdown links and wikilinks have different syntax, safety, navigation, hover,
  and style requirements.
- Ordered and unordered list markers will need custom visual treatment.
- Task checkboxes already mutate Markdown and should not stay as inline DOM code
  inside a broad live-preview plugin.
- Code-block widgets have local state and browser APIs, which need lifecycle
  cleanup when CodeMirror removes widget DOM.

AFFiNE/BlockSuite handles similar complexity by separating editor composition
into blocks, inline specs, and widgets. Anchor cannot directly adopt that
model-first approach because the editor currently promises Markdown source
fidelity. The appropriate adaptation is a Markdown-first widget renderer: keep
CodeMirror and Markdown as the truth, but structure rendering by semantic
widget family and isolate CodeMirror adapter logic from Solid UI components.

## Objective

Refactor `packages/anchor-editor` so interactive rendering is implemented as
semantic widget-family modules with Solid components behind CodeMirror widget adapters.
The refactor keeps the package's real public API and Markdown fidelity intact,
but does not keep migration shims, old selectors, fallback paths, or parallel
implementations.

## Scope

Included implementation surfaces:

- `packages/anchor-editor/src/Editor.tsx`
- Existing `packages/anchor-editor/src/live-preview.ts` and
  `packages/anchor-editor/src/code-block.ts`, which are removed in the same
  change that makes `src/index.ts` point directly at the new extension modules.
- `packages/anchor-editor/src/index.ts`
- `packages/anchor-editor/src/__tests__/decorations.test.ts`
- `packages/anchor-editor/docs/test-strategy.md`
- New files under `packages/anchor-editor/src/editor`
- New files under `packages/anchor-editor/src/rendering`
- New files under `packages/anchor-editor/src/extensions`

Included rendering widgets:

- Editor status UI
- Markdown link chip
- Wikilink chip
- Tag chip
- Task checkbox
- Minimal list marker dot
- Code-block language label
- Code-block copy button

Included contracts to preserve:

- `@plimeor/anchor-editor` exports keep the same public names.
- `apps/anchor-web` imports `@plimeor/anchor-editor` through the workspace
  package and consumes `./src/index.ts`.
- No editor package build step is added.
- `view.state.doc.toString()` remains the source of truth.
- Preview rendering never mutates the document except through explicit user
  actions such as task checkbox toggling.
- Solid-rendered components use Tailwind utility classes for simple styling and
  `tailwind-variants` for stateful styling.
- Solid-rendered component classes are implementation details, not selector
  contracts. Tests and integrations select components by accessible role, ARIA,
  `data-editor-role`, and semantic `data-editor-*` payload attributes.
- ARIA labels, `data-editor-*` payload attributes, and event payloads remain
  stable unless a test codifies a deliberate new contract.

## Non-Goals

This plan does not include:

- A block editor migration.
- A new document model, block schema, CRDT layer, or Markdown AST persistence
  layer.
- A canonical Markdown serializer.
- Byte-for-byte source preservation beyond the current CodeMirror Markdown text
  source of truth.
- A plugin registry or public renderer extension API.
- Public event API expansion for tag interactions.
- Preserving old CodeMirror-prefixed CSS class names for Solid-rendered
  component roots.
- Introducing replacement `anchor-*` CSS class contracts for Solid-rendered
  component roots.
- Full list marker semantics such as ordered-number display, nested marker
  variants, drag handles, selection handles, or toggle/collapse behavior.
- New production dependencies except `tailwind-variants`, which is part of the
  requested component styling strategy.
- Root CI workflow changes unless existing commands already fail because of the
  refactor.

## Required Context

Unless noted otherwise, paths in this plan are relative to
`/Users/plimeor/Documents/anchor`. The `../AFFiNE` paths point to the sibling
clone at `/Users/plimeor/Documents/AFFiNE`.

Inspect these local files before implementation:

- `packages/anchor-editor/src/live-preview.ts`
- `packages/anchor-editor/src/code-block.ts`
- `packages/anchor-editor/src/Editor.tsx`
- `packages/anchor-editor/src/index.ts`
- `packages/anchor-editor/src/__tests__/decorations.test.ts`
- `packages/anchor-editor/src/__tests__/interaction.test.ts`
- `packages/anchor-editor/package.json`
- `apps/anchor-web/package.json`
- `apps/anchor-web/src/styles.css`
- `apps/anchor-web/src/routes/notes.$noteId.tsx`
- `apps/anchor-web/src/routes/playground.tsx`
- `packages/anchor-editor/docs/test-strategy.md`

Reference AFFiNE/BlockSuite files for architecture, not direct implementation:

- `../AFFiNE/blocksuite/docs-site/guide/component-types.md`
- `../AFFiNE/blocksuite/docs-site/guide/block-spec.md`
- `../AFFiNE/blocksuite/docs-site/guide/inline.md`
- `../AFFiNE/blocksuite/affine/blocks/list/src/list-block.ts`
- `../AFFiNE/blocksuite/affine/blocks/list/src/utils/get-list-icon.ts`
- `../AFFiNE/blocksuite/affine/inlines/link/src/inline-spec.ts`
- `../AFFiNE/blocksuite/affine/inlines/link/src/link-node/affine-link.ts`
- `../AFFiNE/blocksuite/affine/inlines/reference/src/inline-spec.ts`
- `../AFFiNE/blocksuite/affine/inlines/reference/src/reference-node/reference-node.ts`
- `../AFFiNE/blocksuite/framework/std/src/inline/extensions/inline-manager.ts`
- `../AFFiNE/blocksuite/integration-test/src/__tests__/utils/setup.ts`
- `../AFFiNE/blocksuite/integration-test/src/__tests__/utils/common.ts`
- `../AFFiNE/blocksuite/integration-test/src/editors/editor-container.ts`
- `../AFFiNE/blocksuite/affine/shared/src/test-utils/create-test-host.ts`
- `../AFFiNE/blocksuite/integration-test/vitest.config.ts`
- `../AFFiNE/tests/blocksuite/playwright.config.ts`
- `../AFFiNE/tests/blocksuite/e2e/utils/actions/edgeless.ts`
- `../AFFiNE/tests/blocksuite/e2e/utils/actions/keyboard.ts`
- `../AFFiNE/tests/blocksuite/e2e/utils/actions/misc.ts`
- `../AFFiNE/tests/blocksuite/e2e/utils/asserts.ts`
- `../AFFiNE/tests/blocksuite/e2e/slash-menu.spec.ts`
- `../AFFiNE/blocksuite/integration-test/src/__tests__/edgeless/mindmap.spec.ts`
- `../AFFiNE/blocksuite/affine/widgets/linked-doc/src/mobile-linked-doc-menu.ts`
- `../AFFiNE/blocksuite/affine/shared/src/services/virtual-keyboard-service.ts`
- `../AFFiNE/blocksuite/framework/std/src/event/keymap.ts`

## Planning Iteration

Local research was used instead of delegated research because the relevant code
paths are available locally and the requested deliverable is a plan. The
research findings integrated into this plan are:

- BlockSuite treats editor UI as composed interaction surfaces rather than one
  central renderer.
- BlockSuite list behavior is block-owned; list marker and todo interactions
  are not generic inline styling.
- BlockSuite link and reference rendering are separate inline specs with
  separate UI components and interaction models.
- BlockSuite test infrastructure uses full editor composition for integration
  tests. `integration-test/src/__tests__/utils/setup.ts` creates a workspace,
  registers schemas, loads store/view extensions, mounts
  `TestAffineEditorContainer`, exposes the real editor/doc on `window`, waits
  for render completion, and owns cleanup.
- BlockSuite also keeps reusable event helpers in
  `integration-test/src/__tests__/utils/common.ts` for pointer, click, drag,
  wait, and multi-touch behavior instead of writing one-off event dispatch in
  individual tests.
- BlockSuite's `affine/shared/src/test-utils/create-test-host.ts` shows the
  lower-level pattern: tests get a reusable host with command, selection, and
  view stores instead of mocking every caller path by hand.
- BlockSuite's browser layer uses Playwright/Vitest-browser infrastructure, not
  ad-hoc browser CLI calls. Anchor adopts the harness discipline, artifact
  collection, stable viewport, clipboard setup, console handling, and
  page-error failure behavior, but not BlockSuite's generic browser-engine
  matrix. Anchor's required Page harness is a Bun WebView backend matrix:
  the same scenarios run against `webkit` and `chrome`.
- BlockSuite e2e utilities centralize keyboard shortcuts, platform-specific
  modifier keys, polling assertions, page initialization, and explicit console
  allowlists. Anchor's browser harness should follow that shape instead of
  embedding shell-based browser commands inside test files.
- BlockSuite touch coverage is mostly harness-level pointer simulation. Both
  integration and e2e helpers dispatch `PointerEvent` with
  `pointerType: 'touch'`, stable `pointerId`, and `isPrimary` to exercise
  pinch, pan, and touch-only paths when the browser automation layer cannot
  provide true touch input.
- BlockSuite treats IME and mobile keyboards as first-class edge cases. It skips
  browser tests that Playwright cannot express, but covers the behavior through
  lower-level events such as `compositionstart`, `compositionupdate`,
  `compositionend`, and `beforeinput`.
- BlockSuite mobile linked-doc UI avoids relying on `keypress` because Android
  may report `event.key` as `Unidentified`; it watches `beforeinput`, uses a
  `VirtualKeyboardProvider`, prevents menu pointerdown from blurring the editor,
  and positions mobile UI around keyboard height and viewport movement.
- Anchor must keep a different persistence boundary: Markdown text remains the
  source, so renderer modules must operate through source ranges and explicit
  Markdown transforms.

Design review is required after drafting and before implementation because this
plan changes module boundaries and introduces a reusable widget lifecycle bridge.

## Proposed Approach

Use a Markdown-first semantic widget renderer.

The key ownership boundaries are:

- `Editor.tsx` owns editor assembly, autosave wiring, theme reconfiguration, and
  route-facing callbacks.
- `editor/EditorStatus.tsx` owns the Solid status UI.
- `extensions/live-preview/plugin.ts` owns CodeMirror live-preview orchestration.
- `extensions/live-preview/widgets/*/collect.ts` owns semantic range
  collection for one widget family.
- `extensions/live-preview/widgets/*/widgets.tsx` owns CodeMirror `WidgetType`
  adapters for one widget family.
- `extensions/live-preview/widgets/*/components/*.tsx` owns Solid UI for one
  widget family.
- `extensions/code-block/*` owns fenced code block decorations and widgets.
- `rendering/solid-widget.tsx` owns Solid mount and dispose mechanics.
- `rendering/decorations.ts` owns pending decoration records, sorting, and
  overlap resolution.
- `rendering/selection.ts` owns selection overlap helpers.

The directory boundary is `widgets`: each widget family owns its source-range
collection, CodeMirror adapter, Solid component, and local style variants in one
place.

The main tradeoff: this introduces more files now, but avoids a public renderer
registry and keeps future growth local to each widget family. That is the smallest
shape that handles known future divergence without turning `live-preview.ts`
into another central dependency.

## Target Directory Structure

```txt
packages/anchor-editor/src/
  editor/
    Editor.tsx
    EditorStatus.tsx

  rendering/
    solid-widget.tsx
    decorations.ts
    selection.ts

  extensions/
    live-preview/
      index.ts
      plugin.ts
      theme.ts
      types.ts
      widgets/
        headings/
          collect.ts
          theme.ts
        inline-format/
          collect.ts
          theme.ts
        links/
          collect.ts
          widgets.tsx
          theme.ts
          components/
            MarkdownLinkChip.tsx
            WikilinkChip.tsx
            styles.ts
        tags/
          collect.ts
          widgets.tsx
          theme.ts
          components/
            TagChip.tsx
            styles.ts
        lists/
          collect.ts
          widgets.tsx
          theme.ts
          components/
            TaskCheckbox.tsx
            ListMarker.tsx
            styles.ts
        blockquote/
          collect.ts
          theme.ts

    code-block/
      index.ts
      plugin.ts
      language.ts
      widgets.tsx
      theme.ts
      components/
        CodeLanguageLabel.tsx
        CodeCopyButton.tsx
        styles.ts

  autosave-controller.ts
  keymap.ts
  complex-note.ts
  index.ts
```

No migration shims are kept after the extraction. `src/index.ts` exports the
same public package names directly from the new extension modules, and internal
imports and tests move to those module paths in the same change.

## Styling Strategy

Component CSS classes are implementation details. They are not migration
contracts, test selectors, or public styling APIs.

Rules:

- Static, simple visuals use literal Tailwind utility classes in the Solid
  component.
- Stateful or multi-variant visuals use `tailwind-variants` in colocated
  `components/styles.ts` files.
- Component tests and e2e tests do not query utility classes. They query
  accessible roles, ARIA labels, `data-editor-role`, and semantic payload
  attributes such as `data-editor-url`, `data-editor-target`, and
  `data-editor-tag`.
- No replacement `anchor-*` class namespace is introduced for Solid-rendered
  components.
- No old `cm-anchor-*` class names are carried forward for Solid-rendered
  components.
- `apps/anchor-web/src/styles.css` includes
  `@source "../../../packages/anchor-editor/src";` so editor package utility
  classes are generated in the anchor-web production CSS. This is a required
  build input for utility generation, not an editor package build step.
- CodeMirror line decorations may use utility classes directly. A non-utility
  technical selector is allowed only when CodeMirror line attributes or CSS
  pseudo-elements require a selector that Tailwind utilities cannot express
  cleanly; it must not use the old `cm-anchor-*` namespace or become a public
  component contract.

## Core Types

Use internal semantic records to prevent components from depending on
CodeMirror implementation details.

```ts
export type SemanticToken =
  | {
      kind: 'tag'
      from: number
      to: number
      raw: string
      value: string
    }
  | {
      kind: 'markdown-link'
      from: number
      to: number
      label: string
      url: string
    }
  | {
      kind: 'wikilink'
      from: number
      to: number
      target: string
    }
  | {
      kind: 'task-checkbox'
      from: number
      to: number
      checked: boolean
    }
  | {
      kind: 'list-marker'
      from: number
      to: number
      raw: string
      markerKind: 'ordered' | 'unordered'
    }
```

Interactive collectors must produce semantic tokens or widget render requests
before those records are converted into CodeMirror decorations. Static
mark/line-only collectors may emit decorations directly when there is no Solid
component and no action surface. The invariant is strict for interactive
widgets: Solid components receive semantic props and never receive `EditorView`,
syntax nodes, or parser state.

The CodeMirror-specific conversion boundary is:

```txt
Markdown source + syntax tree
  -> widget collector
  -> semantic token or widget render request
  -> widget adapter or mark/line decoration adapter
  -> CodeMirror Decoration
```

## Solid Widget Lifecycle

`rendering/solid-widget.tsx` should provide a narrow bridge:

```ts
export interface SolidWidgetElement extends HTMLElement {
  __disposeSolidWidget?: () => void
}

export function renderSolidWidget(create: () => JSX.Element): HTMLElement
export function disposeSolidWidget(dom: HTMLElement): void
```

Each CodeMirror widget adapter must call `disposeSolidWidget(dom)` in
`WidgetType.destroy(dom)`.

The emitted DOM contract is the root element type plus `data-editor-role`,
not a CSS class:

- checkbox root: `input[data-editor-role="task-checkbox"]`
- wikilink root: `span[data-editor-role="wikilink"]`
- Markdown link root: `span[data-editor-role="markdown-link"]`
- tag root: `span[data-editor-role="tag"]`
- list marker root: `span[data-editor-role="list-marker"]`
- code copy root: `button[data-editor-role="code-copy"]`
- code language root: `span[data-editor-role="code-language"]`

Tailwind utility classes and `tailwind-variants` output are implementation
details. Tests must not select Solid-rendered components by class name.

The adapter emits one visible root element per widget and keeps no alternate DOM
path. If an internal detached mount is needed to let Solid create that root, the
detached container is not returned to CodeMirror and does not create a second DOM
path.

## Widget Responsibilities

### Links

`widgets/links` owns both Markdown links and wikilinks.

Markdown link behavior to preserve:

- Render `[label](url)` as a `span` with
  `data-editor-role="markdown-link"` when the caret is outside the link
  range.
- Show `label` as text.
- Store `url` in `data-editor-url`.
- Use `title=url`.
- On `meta` or `ctrl` click, open safe URLs with
  `window.open(url, '_blank', 'noopener,noreferrer')`.
- Reject `javascript:` and `data:` URLs.
- Reveal raw Markdown when the selection overlaps the link range.

Wikilink behavior to preserve:

- Render `[[target]]` as a `span` with `data-editor-role="wikilink"` when
  the caret is outside the wikilink range.
- Show `target` as text.
- Store `target` in `data-editor-target`.
- Use `title=[[target]]`.
- On `meta` or `ctrl` click, dispatch bubbling `anchor:open-wikilink` with
  `detail: { target }`.
- Reveal raw Markdown when the selection overlaps the wikilink range.

`MarkdownLinkChip` and `WikilinkChip` must remain separate components. They may
share tiny local helpers, but not a generic public `LinkChip`; their source
syntax, safety model, and navigation contracts differ.

### Tags

`widgets/tags` owns hashtag rendering.

Current behavior to preserve and extend:

- Detect hashtags using the existing regex rule outside inline code and fenced
  code.
- Render as a `span` with `data-editor-role="tag"` when the caret is outside
  the tag range.
- Preserve visible tag text including the leading `#`.
- Add `data-editor-tag` with the normalized value without `#`.
- Add `data-editor-tag-raw` if useful for future rename or menu behavior.
- Reveal raw Markdown when the selection overlaps the tag range.

Tag rendering should become a widget, not a mark, because future tag interaction
will need menu anchoring, hover state, rename, filtering, or navigation. The
widget adapter remains the only layer that knows the Markdown source range.

Tag overlap rules:

- Do not render a tag inside inline code, fenced code, or code block nodes.
- Do not render a tag if its range is inside a higher-priority replacement such
  as a Markdown link, wikilink, or task checkbox.
- Do not consume list markers or heading markers.

### Lists

`widgets/lists` owns task checkboxes and the first-pass list marker renderer.

Task checkbox behavior to preserve:

- Render `[ ]`, `[x]`, and `[X]` task markers as an `input` with
  `data-editor-role="task-checkbox"` when the caret is outside the marker
  range.
- Use `aria-label="Todo"` for unchecked and `aria-label="Done"` for checked.
- On `mousedown`, prevent default and replace exactly the three marker
  characters.
- `[ ]` becomes `[x]`.
- `[x]` and `[X]` become `[ ]`.
- Ignore mismatched text at the stored range and avoid mutation if the slice no
  longer matches the expected marker.

List marker behavior for this pass:

- Render non-task unordered markers such as `-` and `*` as a small
  non-interactive dot when the caret is outside the marker range.
- Render ordered markers such as `1.` as the same small non-interactive dot in
  this first pass. The Markdown source still preserves the original number.
- Use a `span` with `data-editor-role="list-marker"` on the rendered marker
  root.
- Use `aria-hidden="true"` because the marker is visual decoration and should
  not introduce a separate focus or screen-reader target.
- Reveal the original Markdown marker when the selection overlaps the marker
  range.
- Do not render a list marker for task markers; task markers are owned by
  `TaskCheckbox`.

Future list marker expansions must be decided before they are enabled:

- Ordered marker visual number display.
- Nested list depth display.
- Interaction semantics for selecting the list item versus editing the marker.
- Marker-specific hover or menu behavior.

### Code Blocks

`extensions/code-block` owns fenced code block rendering.

Behavior to preserve:

- Closed fenced code blocks get new open/content/close line attributes owned by
  `extensions/code-block`; old `cm-anchor-*` line class names are not preserved.
- Unclosed fences do not get code-block box rendering.
- Language labels use the existing display-name mapping.
- Missing info string displays `CODE`.
- Copy button writes only the code body lines.
- Copy button shows `Copied!` after a successful clipboard write, then returns
  to `Copy`. The copied state is styled through `tailwind-variants`, not a
  copied-state CSS class contract.
- Copy button prevents editor focus and selection side effects on mousedown and
  click.

Lifecycle cleanup must clear any copy-status timeout when the component is
destroyed.

### Headings, Inline Format, Blockquote

These remain mark or line decorations in the first pass:

- heading marker hiding and heading line marks
- bold
- italic
- inline code
- blockquote line style and quote marker hiding

They still move into widget-family collectors so that `live-preview/plugin.ts` is not
the owner of every markdown syntax rule. They do not need Solid components until
there is real independent interaction.

## Work Sequence

### 1. Establish Behavior Baseline

Purpose:

- Confirm current tests and build behavior before moving files.

Actions:

- Run editor tests and typecheck.
- Run anchor-web build or check.
- Record any pre-existing failures before editing.

Evidence:

- `cd packages/anchor-editor && bun run test`
- `cd packages/anchor-editor && bun run check`
- `cd apps/anchor-web && bun run build`

Pause if:

- Baseline failures are unrelated but block interpretation of the refactor.

### 2. Build Full Editor Test Harness

Purpose:

- Replace local one-off `makeView` helpers with a production-composition
  harness before moving rendering code.

Touchpoints:

- `packages/anchor-editor/src/__tests__/harness/editor-harness.ts`
- `packages/anchor-editor/src/__fixtures__/markdown`
- `packages/anchor-editor/src/__tests__/decorations.test.ts`
- `packages/anchor-editor/src/__tests__/interaction.test.ts`

Acceptance:

- Tests create editor views through the shared harness, not per-file
  partial setup.
- The harness mounts the same editor extension set used by production editor
  behavior unless a test explicitly opts out to prove extension isolation.
- The harness owns fixture loading, selection movement, keyboard dispatch,
  pointer dispatch, clipboard capture, `window.open` capture, custom event
  capture, flush, and cleanup.
- Existing decoration and interaction tests pass through the harness before
  renderer extraction begins.

Regression evidence:

- Existing source-identity tests still pass.
- Existing widget render tests still pass after selectors move to
  `data-editor-role` and semantic `data-editor-*` payload attributes.

### 3. Create Rendering Infrastructure

Purpose:

- Add shared lifecycle and decoration helpers before moving renderer code.

Touchpoints:

- `src/rendering/solid-widget.tsx`
- `src/rendering/decorations.ts`
- `src/rendering/selection.ts`
- `packages/anchor-editor/package.json`
- `apps/anchor-web/src/styles.css`

Acceptance:

- No production behavior changes.
- `tailwind-variants` is available to editor components that need stateful
  variants.
- `apps/anchor-web/src/styles.css` includes
  `@source "../../../packages/anchor-editor/src";`.
- No `anchor-*` component class namespace is introduced.
- Existing tests still pass after helpers are imported or copied into current
  modules.

Regression evidence:

- Existing decoration tests still verify document immutability and DOM rendering.

### 4. Move Code-Block Rendering

Purpose:

- Extract the simpler isolated widget group first.

Touchpoints:

- `src/extensions/code-block/plugin.ts`
- `src/extensions/code-block/theme.ts`
- `src/extensions/code-block/language.ts`
- `src/extensions/code-block/widgets.tsx`
- `src/extensions/code-block/components/CodeLanguageLabel.tsx`
- `src/extensions/code-block/components/CodeCopyButton.tsx`
- `src/extensions/code-block/components/styles.ts`
- Removed `src/code-block.ts`

Acceptance:

- Language label remains a `span` and copy button remains a `button`.
- Language label and copy button expose `data-editor-role`; their visual
  classes are Tailwind implementation details.
- Clipboard behavior is still observable through a public DOM click.
- Timeout cleanup exists in the Solid component.

Regression evidence:

- Existing code-block decoration tests.
- New copy-button click test with a mocked `navigator.clipboard.writeText`.

### 5. Move Link Rendering

Purpose:

- Separate Markdown link and wikilink rendering into widget modules.

Touchpoints:

- `src/extensions/live-preview/widgets/links/collect.ts`
- `src/extensions/live-preview/widgets/links/widgets.tsx`
- `src/extensions/live-preview/widgets/links/components/MarkdownLinkChip.tsx`
- `src/extensions/live-preview/widgets/links/components/WikilinkChip.tsx`
- `src/extensions/live-preview/widgets/links/components/styles.ts`
- `src/extensions/live-preview/widgets/links/theme.ts`

Acceptance:

- Markdown links and wikilinks render with `data-editor-role` and semantic
  payload attributes; classes are not selector contracts.
- Unsafe URLs are not opened.
- Wikilink custom event payload remains unchanged.

Regression evidence:

- Existing Markdown link and wikilink tests.
- New interaction tests for unsafe Markdown link and wikilink `meta` or
  `ctrl` click.

### 6. Move Tags to Widget Rendering

Purpose:

- Promote tags from mark-only styling to interactive-capable rendering.

Touchpoints:

- `src/extensions/live-preview/widgets/tags/collect.ts`
- `src/extensions/live-preview/widgets/tags/widgets.tsx`
- `src/extensions/live-preview/widgets/tags/components/TagChip.tsx`
- `src/extensions/live-preview/widgets/tags/components/styles.ts`
- `src/extensions/live-preview/widgets/tags/theme.ts`

Acceptance:

- Tags render with `data-editor-role="tag"`.
- Tags expose `data-editor-tag`.
- Tags reveal raw source while selected.
- Tags do not render inside inline or fenced code.
- Tags do not steal ranges from links or wikilinks.

Regression evidence:

- Existing tag tests updated only where the DOM representation changes from
  mark span to widget span.
- New overlap tests for tag inside Markdown link, wikilink, and inline code.

### 7. Move List Rendering

Purpose:

- Put task checkbox and first-pass list marker rendering under the list widget
  boundary.

Touchpoints:

- `src/extensions/live-preview/widgets/lists/collect.ts`
- `src/extensions/live-preview/widgets/lists/widgets.tsx`
- `src/extensions/live-preview/widgets/lists/components/TaskCheckbox.tsx`
- `src/extensions/live-preview/widgets/lists/components/ListMarker.tsx`
- `src/extensions/live-preview/widgets/lists/components/styles.ts`
- `src/extensions/live-preview/widgets/lists/theme.ts`

Acceptance:

- Task checkbox DOM and exact Markdown mutation stay the same.
- Task checkbox exposes `data-editor-role="task-checkbox"`; classes are not
  selector contracts.
- Non-task unordered and ordered list markers render as a small dot when the
  caret is outside the marker range.
- Original Markdown list markers reveal when the selection overlaps the marker
  range.
- Task markers are not also rendered as list markers.

Regression evidence:

- Existing task marker render tests.
- New real `mousedown` test instead of duplicating the dispatch logic in the
  test body.
- New list marker render and reveal tests for `- item`, `* item`, and `1. item`.

### 8. Move Remaining Live Preview Collectors

Purpose:

- Finish extracting static markdown decorations so the root plugin only
  orchestrates.

Touchpoints:

- `widgets/headings/collect.ts`
- `widgets/inline-format/collect.ts`
- `widgets/blockquote/collect.ts`
- `extensions/live-preview/plugin.ts`
- `extensions/live-preview/theme.ts`
- `extensions/live-preview/index.ts`
- Removed `src/live-preview.ts`

Acceptance:

- Heading reveal, bold, italic, inline code, and blockquote behavior remain
  unchanged.
- Decoration sorting and overlap filtering are centralized.
- `src/index.ts` imports the live-preview extension directly from
  `extensions/live-preview`.

Regression evidence:

- Existing heading, inline format, blockquote, and combined document tests.

### 9. Extract Editor Shell UI

Purpose:

- Keep `Editor.tsx` focused on CodeMirror and autosave wiring.

Touchpoints:

- `src/editor/Editor.tsx`
- `src/editor/EditorStatus.tsx`
- `src/Editor.tsx`
- `src/index.ts`

Acceptance:

- `Editor` public export remains unchanged.
- Problem statuses render exactly when `status === 'conflict'` or
  `status === 'failed'`.
- Clean, dirty, saving, and saved statuses remain hidden.

Regression evidence:

- Existing editor or interaction tests for status behavior.
- Add a focused component-level test only if an existing public boundary can
  observe status rendering without adding test-only APIs.

### 10. Update Documentation

Purpose:

- Keep the package test strategy aligned with the new structure.

Touchpoints:

- `packages/anchor-editor/docs/test-strategy.md`

Acceptance:

- The document names the new `extensions`, `widgets`, and `rendering`
  boundaries.
- The required test map includes tag widget behavior, link and wikilink
  interactions, task checkbox real event tests, first-pass list marker rendering,
  and Solid widget cleanup risk.

Regression evidence:

- `git diff --check`
- Markdown path references resolve by inspection.

## Test Plan

This refactor follows `packages/anchor-editor/docs/test-strategy.md`. The test
plan is behavior-first: tests prove Markdown fidelity, DOM contracts, explicit
user actions, browser-only behavior, and lifecycle cleanup through the smallest
public boundary that can observe each risk.

Do not add test-only exports, test-only runtime flags, dependency injection, or
alternate component paths. If a behavior cannot be observed without such a seam,
record the gap and move the proof to the next public layer.

Required test artifacts for this refactor:

- Add `packages/anchor-editor/src/__tests__/harness/editor-harness.ts` as the
  single full-featured editor harness for package-level editor tests.
- Update `packages/anchor-editor/src/__tests__/decorations.test.ts` for the new
  `data-editor-role` and `data-editor-*` DOM contracts.
- Update `packages/anchor-editor/src/__tests__/interaction.test.ts` so dynamic
  interactions call real production command or widget paths instead of copied
  logic.
- Add `packages/anchor-editor/src/__tests__/editor-view-invariants.test.ts`
  for source-identity and caret-reveal invariants if those checks would make
  `decorations.test.ts` too broad.
- Add `packages/anchor-editor/src/__tests__/Editor.component.test.tsx` for the
  extracted `Editor` shell and status behavior.
- Add a Bun WebView Page harness for `apps/anchor-web` e2e tests. The harness
  runs the same editor behavior suite against `backend: 'webkit'` and
  `backend: 'chrome'`. WebKit is the release-runtime proof for Tauri on Apple
  platforms; Chrome is a required differential check through the same flow. The
  required gate must not depend on shelling out to `agent-browser`.
- Add `apps/anchor-web/e2e/harness/editor-webview-harness.ts` with one
  backend-neutral interface over Bun WebView: page startup, fixture loading,
  editor focus, exact Markdown reads, keyboard `press()` helpers, text insertion
  helpers, pointer and touch event helpers, composition events, beforeinput
  events, selection actions, polling assertions, console/page error handling,
  failure artifacts, and cleanup.
- Add `apps/anchor-web/e2e/harness/editor-webview-matrix.ts` to parameterize
  the same test scenarios over `webkit` and `chrome` without duplicating test
  bodies.
- Add `apps/anchor-web` scripts for editor browser checks:
  `test:e2e:editor` and `test:e2e:editor:webview`.
- Update `apps/anchor-web/e2e/editor.e2e.test.ts` to use that browser harness,
  stop selecting old `.cm-anchor-*` component classes, and cover the
  browser-only cases listed below.
- Add or update committed fixtures under
  `packages/anchor-editor/src/__fixtures__/markdown`.

### Layer 1: Pure Unit Tests

Owned risks:

- pure range, sorting, and overlap helpers in `rendering/decorations.ts`
- selection overlap helpers in `rendering/selection.ts`
- language display-name normalization in `extensions/code-block/language.ts`
- URL safety helpers used by Markdown links

Required tests:

- Overlap sorting gives higher-priority replacements precedence over tags.
- Selection overlap returns true for partial, full, and boundary-touching
  ranges, and false for adjacent ranges.
- Markdown link URL safety rejects `javascript:` and `data:` schemes.
- Language display names preserve current behavior for known languages,
  unknown info strings, and empty info strings.

Do not unit test private collectors. Collector behavior is observed through the
CodeMirror view harness.
Do not unit test Tailwind class strings. Visual and state behavior is proven
through DOM roles, ARIA/state attributes, browser behavior, and production CSS
generation.

### Layer 2: CodeMirror View Harness Tests

Owned risks:

- decoration recomputation
- reveal-on-caret behavior
- Markdown source identity
- CodeMirror widget DOM contracts
- real command dispatch and Markdown mutation ranges

Required harness:

- Use the full-featured `EditorView` harness from the editor test strategy.
- The harness mounts the production editor extension set by default: Markdown
  language support, live preview, code block rendering, keymap, base theme, and
  any extension the real `Editor` component depends on for editing behavior.
- The harness exposes fixture loading, document reads, line reads, selection
  reads, caret movement, range selection, text insertion, keyboard dispatch,
  pointer/mouse dispatch, clipboard capture, `window.open` capture, custom event
  capture, custom assertions, animation-frame flushing, multiple editor
  instances, and deterministic cleanup.
- Assert `view.state.doc.toString()` before and after every render-only action.
- Query Solid-rendered widgets by accessible role, ARIA, `data-editor-role`,
  and semantic `data-editor-*` payload attributes.
- Avoid full CodeMirror DOM snapshots.

Required harness API:

```ts
interface EditorViewHarness {
  parent: HTMLElement
  view: EditorView
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

This harness is modeled after BlockSuite's full editor test setup, not after the
current local `makeView` helper. It centralizes production editor composition and
event utilities so tests do not rebuild partial editor setups or duplicate
editor logic.

Required cases:

- Passive render of headings, links, wikilinks, tags, tasks, list markers,
  inline formatting, blockquotes, and code blocks never changes
  `view.state.doc.toString()`.
- Moving the caret into each preview range reveals the raw Markdown source.
- Moving the caret out restores the preview representation.
- Markdown link chip renders label text, `data-editor-url`, and
  `data-editor-role="markdown-link"`.
- Unsafe Markdown link click does not call `window.open`.
- Wikilink chip renders target text, `data-editor-target`, and
  `data-editor-role="wikilink"`.
- Wikilink `meta` or `ctrl` click dispatches `anchor:open-wikilink` once with
  `detail: { target }`.
- Tag chip renders original text, `data-editor-tag`, and
  `data-editor-role="tag"`.
- Tag chip does not render inside inline code, fenced code, Markdown links, or
  wikilinks.
- Task checkbox real `mousedown` toggles exactly `[ ]`, `[x]`, or `[X]`.
- Task checkbox does not mutate when the stored range no longer contains the
  expected marker.
- `ListMarker` renders a small non-focusable `span` dot with
  `data-editor-role="list-marker"` for `- item`, `* item`, and `1. item`.
- `ListMarker` reveals the original Markdown marker on selection overlap.
- `ListMarker` does not render for task markers.
- Code language label renders as `span[data-editor-role="code-language"]`.
- Code copy button renders as `button[data-editor-role="code-copy"]`.
- Code copy button writes only the code body and does not mutate editor text.
- Code copy button shows `Copied!` after a successful write and returns to
  `Copy` after the configured timeout.
- Code copy button clears pending copied-state timeout when destroyed.

### Layer 3: Editor Component Tests

Owned risks:

- `Editor.tsx` to `editor/Editor.tsx` extraction
- `EditorStatus.tsx` visibility rules
- wikilink event bridge from editor DOM to route callback
- lifecycle cleanup across mount, unmount, and note changes

Required cases:

- Mount creates one editor view and unmount destroys it.
- Different-note navigation resets document text and autosave state.
- Same-note revision update preserves dirty local edits.
- Conflict and failed statuses render problem UI.
- Clean, dirty, saving, and saved statuses remain hidden.
- Wikilink DOM event invokes `onOpenWikilink` once and does not crash the
  editor if the callback fails.

### Layer 4: Browser Integration Tests

Owned risks:

- real browser selection and caret movement
- real keyboard events
- clipboard behavior
- focus and blur
- CSS and Tailwind utility generation around CodeMirror DOM
- backend differences between WebKit and Chrome
- mobile-class input behavior involving pointer events, beforeinput,
  composition events, viewport changes, and virtual keyboard positioning

Required cases:

- Browser tests run through a Bun WebView Page harness. The browser quality gate
  does not use `agent-browser`.
- The required harness runs the same editor behavior suite against
  `backend: 'webkit'` and `backend: 'chrome'`. WebKit is the release-runtime
  proof for Tauri on Apple platforms; Chrome is a required differential check.
- The harness must be backend-parameterized. Test files must not fork into
  separate WebKit and Chrome implementations unless a behavior is explicitly
  backend-specific and justified in the test name.
- Pin the Bun version used by the harness because `Bun.WebView` is
  experimental.
- Playwright or Vitest-browser checks may remain for generic web behavior, but
  they are not the required editor Page harness and do not require a
  Chromium/Firefox/WebKit matrix.
- Use `press()` for keyboard-command tests. Bun WebView `type()` inserts text
  through browser editing commands and does not fire `keydown`/`keyup`, so it is
  only valid for text insertion or paste-like paths.
- Use Chrome-only CDP only for optional diagnostics. Required editor assertions
  must use backend-neutral harness operations.
- The browser harness owns page startup, fixture loading, editor focus, exact
  Markdown reads, keyboard helpers, pointer helpers, selection helpers, polling
  assertions, clipboard permissions, and cleanup.
- Unexpected `console.error`, unexpected warnings, and `pageerror` fail the
  test. Allowed messages must be declared in the test before page startup.
- Browser tests use stable viewport, color scheme, timezone, and clipboard
  permission configuration.
- Failed or retried browser tests collect screenshot, console log, DOM summary,
  Markdown text dump, backend name, Bun version, and WebView failure metadata.
- Browser coverage is collected when `COVERAGE=1` or CI enables it, and is
  written to an editor-specific coverage directory.
- Keyboard, caret, selection, and widget-click invariants run in both Bun
  WebView backends. Clipboard-specific tests must use the backend-capable
  clipboard path owned by the harness and still prove no source mutation when
  permissions are denied or unavailable.
- Real keyboard `Enter` continues unordered, ordered, task, and blockquote
  lines according to `keymap.ts`.
- Real keyboard `Tab` and `Shift-Tab` affect only supported list lines.
- Typing the third backtick triggers code fence pairing only on the supported
  path.
- Moving the caret into and out of link, wikilink, tag, task, list marker, and
  code block preview ranges reveals and hides syntax without changing source.
- Clicking a task checkbox changes exactly the Markdown task marker.
- Clicking code copy uses the browser clipboard path and does not mutate editor
  text.
- Focus and blur do not alter preview source text.
- Mobile viewport profile focuses the editor, taps widget surfaces, scrolls the
  editor container, and proves no accidental Markdown mutation.
- Touch-only helpers dispatch `PointerEvent` with `pointerType: 'touch'`,
  stable `pointerId`, and `isPrimary` for tap, drag, and future pinch paths
  when the automation layer does not provide true mobile touch input.
- Composition tests dispatch `compositionstart`, `compositionupdate`, and
  `compositionend` around CJK text and verify preview rebuilds do not corrupt
  the Markdown source.
- Beforeinput fallback tests cover Android-style `InputEvent` paths such as
  `deleteContentBackward` without assuming reliable `keypress` key names.
- Future mobile widgets that react to virtual keyboard or visual viewport
  changes must prove the active caret, menu, and widget surface remain visible
  and do not blur the editor accidentally.
- The production CSS generated by anchor-web contains the Tailwind utilities
  used by editor components, proving `@source "../../../packages/anchor-editor/src";`
  is effective.

### Layer 5: Application E2E Tests

Owned risks:

- anchor-web route integration
- exact persistence round trip
- note switching with dirty text
- problem status visibility in the real app surface

Required cases:

- Open a note, edit body, autosave, reload, and verify exact Markdown text.
- Switch notes while one note is dirty without accidental overwrite.
- Preserve trailing spaces and blank lines through save and reload.
- Surface conflict or failed save status without silently overwriting content.
- Playground or fixture route renders mixed editor stress content without
  console or page errors.

### Fixtures and Property Checks

Required fixture additions or updates:

- overlapping link, wikilink, tag, inline-code, and fenced-code syntax
- unordered, ordered, and task list marker cases
- unclosed fenced code and partially typed link syntax
- CJK text combined with tags, wikilinks, and list markers
- trailing whitespace and blank lines around rendered widgets

Property-level checks:

- generated Markdown plus random caret movement never changes the document
- decoration recomputation never throws for generated Markdown
- unclosed syntax degrades to plain text behavior rather than widget-only
  rendering

Any property failure must be promoted to a committed fixture test before the
refactor is considered complete.

## Acceptance, Regression Evidence, and Verification

Implementation is acceptable only when all of these are true:

- The editor package public exports are unchanged.
- No `package.json` build script is added to `packages/anchor-editor`.
- `apps/anchor-web` still depends on `@plimeor/anchor-editor` through
  `workspace:*`.
- All current editor behavior covered by `decorations.test.ts` remains covered.
- Tests that previously located Solid-rendered widgets through old component
  root classes are updated to accessible role, ARIA, `data-editor-role`, and
  semantic `data-editor-*` payload selectors.
- Tailwind utilities used by editor components are present in the anchor-web
  production CSS output.
- Tag rendering is owned by `widgets/tags` and is implemented as a Solid-backed
  widget.
- Link and wikilink rendering are owned by `widgets/links` with separate Solid
  components.
- Task checkbox rendering is owned by `widgets/lists`.
- First-pass `ListMarker` rendering is owned by `widgets/lists` and renders
  non-task list markers as a small non-interactive dot.
- Code block label and copy button rendering are owned by
  `extensions/code-block`.
- Interactive widget collectors produce semantic tokens or widget render
  requests before CodeMirror decorations are created.
- CodeMirror widget adapters dispose Solid components on destroy.
- `view.state.doc.toString()` remains unchanged after passive rendering.
- Explicit user actions mutate only the intended Markdown range.
- The Layer 1 through Layer 5 test evidence listed in this plan exists or a
  blocking gap is recorded with the public boundary that prevents the proof.

Required automated checks:

```sh
cd packages/anchor-editor && bun run test
cd packages/anchor-editor && bun run check
cd packages/anchor-editor && bun test --conditions browser --coverage src
cd apps/anchor-web && bun run build
cd apps/anchor-web && bun run test:e2e
cd apps/anchor-web && bun run test:e2e:editor
cd apps/anchor-web && bun run test:e2e:editor:webview
cd /Users/plimeor/Documents/anchor && git diff --check
```

Optional broader checks:

```sh
cd /Users/plimeor/Documents/anchor && bun run check
cd /Users/plimeor/Documents/anchor && bun run test
```

Run optional checks when the refactor touches shared exports, route imports, or
test utilities beyond `packages/anchor-editor`.

## Testing Constraints

The behavior-level test targets are defined in the Layer 1 through Layer 5 test
plan above. These constraints apply to every layer:

- Do not add test-only exports.
- Do not test private collector functions unless they become product-owned
  public helpers inside the package.
- Prefer DOM-level tests through `EditorView` for rendering and interaction.
- Mock only browser APIs that are external to the editor, such as
  `navigator.clipboard.writeText` and `window.open`.

## Risks and Controls

### Risk: DOM Shape Drift

If Solid components introduce wrapper elements around widgets, inline layout,
CSS selectors, or CodeMirror selection may change.

Control:

- Choose and test the final root element type for each widget.
- Use Tailwind utility classes and `tailwind-variants` as styling
  implementation details.
- Use accessible role, ARIA, `data-editor-role`, and semantic `data-editor-*`
  payload attributes as the DOM contract.
- Do not add legacy classes, class aliases, fallback selectors, or a replacement
  `anchor-*` class API.

### Risk: Widget Lifecycle Leaks

CodeMirror can discard widget DOM during document changes, selection changes,
or viewport changes. Solid effects and timers must not survive discarded DOM.

Control:

- All Solid-backed `WidgetType` classes implement `destroy(dom)`.
- `CodeCopyButton` clears pending timeout in `onCleanup`.

### Risk: Tag Widget Overlap

Changing tag rendering from mark to replacement widget can accidentally hide
parts of links, inline code, or list markers.

Control:

- Tag collector skips ranges inside code nodes.
- Central overlap resolution gives link, wikilink, task checkbox, and code-block
  replacements priority over tags.
- Add overlap tests before considering the widget complete.

### Risk: List Marker Placeholder Semantics

Rendering ordered markers as a dot intentionally sacrifices visible numbering in
the first pass while preserving the Markdown source.

Control:

- Keep the behavior explicitly scoped to first-pass marker styling.
- Reveal the original ordered marker on caret overlap.
- Do not normalize or rewrite the ordered number.
- Add tests that prove `1.` remains unchanged in `view.state.doc.toString()`.

### Risk: Future Flexibility Theater

Too many generic abstractions can make current code harder to read without
reducing real change amplification.

Control:

- Do not introduce a registry, plugin API, or generic widget framework.
- Keep widget modules plain functions and local widget classes.
- Extract only helpers used by at least two current widget families or required for
  lifecycle correctness.

### Risk: Block Editor Migration Is Misrepresented

This refactor does not make a block editor migration easy. It only limits the
future rewrite surface.

Control:

- Keep the source-of-truth statement explicit in docs and code comments where
  needed.
- Keep components semantic and adapter-free so they are reusable if the backend
  later changes from Markdown ranges to block model mutations.

## Checkpoints

Checkpoint 1:

- `solid-widget.tsx` exists.
- One simple widget uses it.
- Existing tests pass.

Checkpoint 2:

- Links and wikilinks are in `widgets/links`.
- DOM contract and click tests pass.

Checkpoint 3:

- Tags are widgets.
- Overlap and reveal tests pass.

Checkpoint 4:

- Task checkbox and `ListMarker` are in `widgets/lists`.
- Real mouse event toggle test passes.
- List marker dot render and reveal tests pass for unordered and ordered markers.

Checkpoint 5:

- `live-preview/plugin.ts` only orchestrates collectors, sorting, and plugin
  lifecycle.
- `src/live-preview.ts` and `src/code-block.ts` are removed, with `src/index.ts`
  exporting directly from the new extension modules.

## Pause Conditions

Pause before continuing if any of these occur:

- Preserving existing widget root DOM shape requires a fragile Solid mount hack
  that fails event or cleanup tests.
- Tag widget replacement breaks caret reveal or overlaps in a way central
  sorting cannot resolve cleanly.
- First-pass `ListMarker` cannot be implemented without also rewriting list
  Markdown source.
- The refactor requires changing public package exports.
- The refactor requires adding a package build script.
- `apps/anchor-web` cannot build while consuming editor source directly.

## Stop Condition

Stop when:

- The target structure exists for the implemented widget families.
- Public exports and anchor-web consumption are unchanged.
- Required tests and build checks pass or any failure is clearly identified as
  pre-existing with evidence.
- The package test strategy document reflects the new structure.
- No unauthorized block editor migration, serializer, registry, dependency, or
  build workflow has been introduced.
