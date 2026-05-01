# @plimeor/command-kit

Bun-first command declaration runtime for CLI and agent tools.

## Install

```bash
bun add @plimeor/command-kit @sinclair/typebox
```

## Minimal Usage

```ts
import { Type } from '@sinclair/typebox'
import { defineCli, defineCommand } from '@plimeor/command-kit'

const cli = defineCli({
  description: 'Example CLI',
  name: 'example',
  commands: [
    defineCommand('add', {
      args: Type.Object({
        items: Type.Array(Type.String()),
        source: Type.String()
      }),
      description: 'Add items from a source',
      options: Type.Object({
        json: Type.Optional(Type.Boolean({ description: 'Write a JSON result envelope' }))
      }),
      positionals: [{ name: 'source' }, { name: 'items', rest: true }],
      run: context => ({
        items: context.args.items,
        source: context.args.source
      })
    })
  ]
})

await cli.serve(process.argv.slice(2))
```

```bash
bun example.ts add repo item-a item-b --json
```
