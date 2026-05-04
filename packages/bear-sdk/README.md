# @plimeor/bear-sdk

Typed Bun SDK for Bear's local CLI.

The SDK calls Bear's local command-line tool and parses `--format json` output
with Valibot. It does not read or write Bear's database directly. By default it
uses `bear` when available and falls back to `bearcli`; pass `command` to any
method when a specific binary path is required.

## Requirements

- macOS with Bear App installed.
- Bear CLI available as `bear` or `bearcli` on `PATH`.
- Bun runtime.

## Install

```bash
bun add @plimeor/bear-sdk
```

## Minimal Usage

```ts
import { Bear } from '@plimeor/bear-sdk'

const note = await Bear.create({
  content: 'Body text',
  tags: ['work/draft'],
  title: 'My Note'
})

await Bear.append({ id: note.id }, { content: '\nFollow-up' })

const shown = await Bear.show({ id: note.id }, { includeContent: true })
console.log(shown.title, shown.content)
```

Override CLI resolution when needed:

```ts
await Bear.list({ command: '/Applications/Bear.app/Contents/MacOS/bearcli', limit: 20 })
```

## API Shape

All public functions live under the `Bear` namespace:

```ts
import { Bear } from '@plimeor/bear-sdk'
```

Read operations:

```ts
await Bear.list({ limit: 20 })
await Bear.count({ tag: 'work' })
await Bear.search('@today @todo')
await Bear.countSearch('@today')
await Bear.show({ id: note.id }, { includeContent: true })
await Bear.cat({ id: note.id })
await Bear.searchIn({ id: note.id }, { string: 'TODO' })
```

`list`, `search`, `create`, and `show` return Bear's full non-content metadata:
`id`, `title`, `locked`, `tags`, `hash`, `length`, `created`, `modified`,
`pins`, `location`, `todos`, `done`, and `attachments`. `search` also includes
`matches`. `show({ includeContent: true })` adds `content`; `list` and `search`
do not fetch note bodies.

Write operations:

```ts
await Bear.create({ title: 'Draft', content: 'Body', tags: ['draft'] })
await Bear.append({ id: note.id }, { content: '\nMore' })
await Bear.edit({ id: note.id }, { at: 'TODO', replace: 'DONE' })
await Bear.write({ id: note.id }, { base: current.hash, content: '# Title\nBody' })
await Bear.trash({ id: note.id })
await Bear.archive({ id: note.id })
await Bear.restore({ id: note.id })
```

Organization and attachments:

```ts
await Bear.listTags({ id: note.id })
await Bear.addTags({ id: note.id }, { tags: ['work'] })
await Bear.removeTags({ id: note.id }, { tags: ['draft'] })
await Bear.renameTagGlobally({ from: 'draft', to: 'published' })
await Bear.deleteTagGlobally({ name: 'old-tag' })

await Bear.listPins({ id: note.id })
await Bear.addPins({ id: note.id }, { targets: ['global'] })
await Bear.removePins({ id: note.id }, { targets: ['global'] })

await Bear.addAttachment({ id: note.id }, { filename: 'note.txt', data: 'payload' })
await Bear.listAttachments({ id: note.id })
await Bear.saveAttachment({ id: note.id }, { filename: 'note.txt' })
await Bear.deleteAttachment({ id: note.id }, { filename: 'note.txt' })
```

## Validation And Errors

Inputs and Bear JSON output are validated at the SDK boundary with Valibot.
Invalid inputs or unexpected output shapes throw Valibot errors. Non-JSON output
throws the native `JSON.parse` error. CLI failures are left as Bun Shell errors.

`show` normalizes Bear's `locked` field from CLI strings (`yes` / `no`) into a
boolean.

## Tests

```bash
bun run --cwd packages/bear-sdk test
```

The integration tests create temporary Bear notes, validate SDK behavior against
those notes, and move the test notes to Bear Trash in `finally` blocks.
